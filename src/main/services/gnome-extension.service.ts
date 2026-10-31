import { execFile } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import type { GnomeExtensionStatus } from '@shared/types'
import { detectDesktopEnv, isWaylandSession } from '../utils/platform'
import { hostCommand, isFlatpak, toHostPath } from '../utils/flatpak'
import { getLweStatus } from './lwe.service'
import { t } from '../i18n'

const execFileAsync = promisify(execFile)

/** GNOME has no layer-shell, the engine's extension makes desktop windows. A fresh install needs a re-login */
const GNOME_EXTENSION_UUID = 'linux-wallpaperengine@wallpaperenginelover.github.io'
const GNOME_HELPER = 'linux-wallpaperengine-gnome-helper'

function userExtensionDir(): string {
  // the Flatpak's XDG_DATA_HOME is under ~/.var/app, the Shell reads the host's
  const dataHome = (!isFlatpak() && process.env.XDG_DATA_HOME) || path.join(os.homedir(), '.local', 'share')
  return path.join(dataHome, 'gnome-shell', 'extensions', GNOME_EXTENSION_UUID)
}

function bundledExtensionDir(enginePath = getLweStatus().path): string | undefined {
  if (!enginePath) return undefined
  let real = enginePath
  try { real = fs.realpathSync(enginePath) } catch { }
  const dir = path.join(path.dirname(real), 'gnome-shell-extension', GNOME_EXTENSION_UUID)
  return fs.existsSync(path.join(dir, 'metadata.json')) ? dir : undefined
}

function readVersion(dir: string): string | undefined {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8')) as Record<string, unknown>
    const version = metadata['version-name']
    return typeof version === 'string' || typeof version === 'number' ? String(version) : undefined
  } catch {
    return undefined
  }
}

/** older gnome-extensions print ENABLED instead of ACTIVE */
export function parseExtensionState(output: string): string | undefined {
  return output.match(/^\s*State:\s*(.+?)\s*$/m)?.[1]?.toUpperCase()
}

async function runHost(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  const [file, fileArgs] = hostCommand(cmd, args)
  try {
    const { stdout, stderr } = await execFileAsync(file, fileArgs, { timeout: 10000, encoding: 'utf8' })
    return { ok: true, out: `${stdout}${stderr}` }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: `${failure.stdout ?? ''}${failure.stderr ?? ''}` || (failure.message ?? '') }
  }
}

function isGnomeWayland(): boolean {
  return detectDesktopEnv() === 'gnome' && isWaylandSession()
}

export async function getGnomeExtensionStatus(): Promise<GnomeExtensionStatus> {
  if (!isGnomeWayland()) return { needed: false, state: 'not-needed' }

  const bundled = bundledExtensionDir()
  const bundledVersion = bundled ? readVersion(bundled) : undefined
  const installedDir = userExtensionDir()
  const installedVersion = fs.existsSync(installedDir) ? readVersion(installedDir) : undefined
  const base: Partial<GnomeExtensionStatus> & { needed: true } = { needed: true, bundled: !!bundled, ...(bundledVersion ? { bundledVersion } : {}),
    ...(installedVersion ? { installedVersion } : {}) }

  const info = await runHost('gnome-extensions', ['info', GNOME_EXTENSION_UUID])
  const state = info.ok ? parseExtensionState(info.out) : undefined
  if (isFlatpak()) Object.assign(base, await flatpakDetails(bundled))

  if (state === 'ACTIVE' || state === 'ENABLED') {
    if (bundledVersion && installedVersion && bundledVersion !== installedVersion) {
      return { ...base, state: 'outdated' }
    }
    return { ...base, state: 'active' }
  }
  if (state === 'ERROR' || state === 'OUT OF DATE') return { ...base, state: 'error', detail: info.out.trim() }
  if (state) return { ...base, state: 'disabled' }

  if (installedVersion !== undefined) return { ...base, state: 'needs-relogin' }
  return { ...base, state: 'not-installed' }
}

export function flatpakInstallCommands(hostDir: string): string[] {
  const quoted = `'${hostDir.replace(/'/g, "'\\''")}'`
  return [
    'mkdir -p ~/.local/share/gnome-shell/extensions',
    `cp -r ${quoted} ~/.local/share/gnome-shell/extensions/`,
    `gnome-extensions enable ${GNOME_EXTENSION_UUID}`
  ]
}

function flatpakDetails(bundled: string | undefined): Promise<Partial<GnomeExtensionStatus>> {
  const hostDir = bundled ? toHostPath(bundled) : undefined
  return Promise.resolve(hostDir ? { flatpakCommands: flatpakInstallCommands(hostDir) } : {})
}

export async function installGnomeExtension(): Promise<{ ok: boolean; message: string; status: GnomeExtensionStatus }> {
  const bundled = bundledExtensionDir()
  if (!bundled) {
    return {
      ok: false,
      message: t('gnome.noFolder'),
      status: await getGnomeExtensionStatus()
    }
  }
  const wasOutdated = (await getGnomeExtensionStatus()).state === 'outdated'
  const target = userExtensionDir()
  const staging = `${target}.new`
  await fs.promises.rm(staging, { recursive: true, force: true })
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  // the Flatpak shares the host home, gnome-extensions runs on the host
  await fs.promises.cp(bundled, staging, { recursive: true })
  const helper = path.join(staging, GNOME_HELPER)
  if (fs.existsSync(helper)) await fs.promises.chmod(helper, 0o755)
  await fs.promises.rm(target, { recursive: true, force: true })
  await fs.promises.rename(staging, target)

  const enabled = await runHost('gnome-extensions', ['enable', GNOME_EXTENSION_UUID])
  if (!enabled.ok) await addToEnabledExtensions()

  const status = await getGnomeExtensionStatus()
  const message = status.state === 'active' && !wasOutdated
    ? t('gnome.active')
    : t('gnome.installedRelogin')
  return { ok: true, message, status }
}

/** Parses gsettings' GVariant string array, e.g. @as [] or ['a@b', 'c@d'] */
export function parseStringArray(value: string): string[] {
  return [...value.matchAll(/'([^']*)'/g)].map(match => match[1])
}

async function addToEnabledExtensions(): Promise<void> {
  const current = await runHost('gsettings', ['get', 'org.gnome.shell', 'enabled-extensions'])
  if (!current.ok) return
  const uuids = parseStringArray(current.out)
  if (uuids.includes(GNOME_EXTENSION_UUID)) return
  const list = [...uuids, GNOME_EXTENSION_UUID].map(uuid => `'${uuid}'`).join(', ')
  await runHost('gsettings', ['set', 'org.gnome.shell', 'enabled-extensions', `[${list}]`])
}
