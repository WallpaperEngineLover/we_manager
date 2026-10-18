import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { LWE_RELEASE_REPO } from '@shared/constants'
import type { LweInstallProgress, LwePrebuiltTarget } from '@shared/types'
import { isCommandAvailable } from '../utils/platform'
import { getLwePrebuiltDir } from '../utils/paths'
import { isFlatpak } from '../utils/flatpak'
import { downloadVerified, fetchLatestRelease } from '../utils/github'
import { buildCleanBuildEnv, isOstreeSystem, parseOsReleaseIds, readPrebuiltRelease, resetLweDetection } from './lwe.service'
import { t } from '../i18n'

const execFileAsync = promisify(execFile)

/** bundles all but desktop libraries, needs glibc 2.35+ */
type PrebuiltDistro = 'ubuntu-24.04' | 'fedora-44' | 'portable'

const DISTRO_LABELS: Record<PrebuiltDistro, string> = {
  'ubuntu-24.04': 'Ubuntu 24.04',
  'fedora-44': 'Fedora 44',
  portable: 'Portable build'
}

function distroLabel(distro: PrebuiltDistro): string {
  return distro === 'portable' ? t('lwe.portableBuild') : DISTRO_LABELS[distro]
}

const PORTABLE_GLIBC = '2.35'

// Fedora installs missing ones by soname instead, so Nobara's ffmpeg isn't swapped for ffmpeg-free
const RUNTIME_DEPS_UBUNTU = [
  'libglew2.2', 'libsdl2-2.0-0', 'libx11-6', 'libxrandr2',
  'libavcodec60', 'libavformat60', 'libavutil58', 'libswresample4', 'libswscale7',
  'libdbus-1-3', 'libfreetype6', 'libglfw3', 'libharfbuzz0b', 'liblz4-1', 'libmpv2', 'libpulse0',
  'libwayland-client0', 'libwayland-cursor0', 'libwayland-egl1', 'libegl1', 'libgl1',
  'libnss3', 'libatk1.0-0t64', 'libatk-bridge2.0-0t64', 'libcups2t64', 'libxcomposite1', 'libxdamage1',
  'libgbm1', 'libxkbcommon0', 'libasound2t64', 'libpango-1.0-0', 'libcairo2',
  // V8 for scene scripts
  'libnode109'
]

function readOsRelease(): Record<string, string> {
  const fields: Record<string, string> = {}
  try {
    for (const line of fs.readFileSync('/etc/os-release', 'utf8').split('\n')) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (match) fields[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  } catch { }
  return fields
}

/** e.g. "2.39" */
function glibcVersion(): string | undefined {
  const header = (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header
  return header?.glibcVersionRuntime
}

function versionAtLeast(version: string, minimum: string): boolean {
  const a = version.split('.').map(Number)
  const b = minimum.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return true
}

function detectPrebuiltDistro(): PrebuiltDistro | undefined {
  const release = readOsRelease()
  const ids = [release.ID, ...(release.ID_LIKE ?? '').split(/\s+/)].filter(Boolean)
  if (!isOstreeSystem()) {
    // Mint 22 and Pop!_OS 24.04 are built on noble
    if (release.UBUNTU_CODENAME === 'noble' || (release.ID === 'ubuntu' && release.VERSION_ID === '24.04')) {
      return 'ubuntu-24.04'
    }
    if (ids.includes('fedora') && release.VERSION_ID === '44') return 'fedora-44'
  }
  const glibc = glibcVersion()
  if (glibc && versionAtLeast(glibc, PORTABLE_GLIBC)) return 'portable'
  return undefined
}

function assetName(variant: string, distro: PrebuiltDistro): string {
  return `linux-wallpaperengine-${variant}-${distro}-x86_64.tar.gz`
}

function isKdeSession(): boolean {
  return (process.env.XDG_CURRENT_DESKTOP ?? '').split(':').some(d => d.toUpperCase() === 'KDE')
}

export function getPrebuiltTarget(): LwePrebuiltTarget {
  if (isFlatpak()) {
    return { supported: false, managed: true, reason: t('lwe.flatpakManaged') }
  }
  if (process.arch !== 'x64') {
    return { supported: false, reason: t('lwe.prebuiltX64Only') }
  }
  const distro = detectPrebuiltDistro()
  if (!distro) {
    const glibc = glibcVersion()
    return {
      supported: false,
      reason: glibc
        ? t('lwe.prebuiltGlibcHave', { required: PORTABLE_GLIBC, have: glibc })
        : t('lwe.prebuiltGlibc', { required: PORTABLE_GLIBC })
    }
  }
  const variant = isKdeSession() ? 'kde' : 'generic'
  return {
    supported: true,
    asset: assetName(variant, distro),
    label: t(variant === 'kde' ? 'lwe.prebuiltWithKde' : 'lwe.prebuiltWithoutKde', { build: distroLabel(distro) })
  }
}

/** Unresolved sonames */
async function findMissingLibraries(binary: string): Promise<string[]> {
  // the portable launcher adds its bundled fallback libraries before running ldd
  const portable = fs.existsSync(`${binary}.bin`)
  const { stdout } = await execFileAsync(portable ? binary : 'ldd', portable ? ['--check-libraries'] : [binary], {
    env: buildCleanBuildEnv(),
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024
  })
  const missing = new Set<string>()
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\S+) => not found/.exec(line)
    if (match) missing.add(match[1])
  }
  return [...missing]
}

/** true when layered with rpm-ostree, which needs a reboot */
async function installMissingLibraries(distro: PrebuiltDistro, missing: string[]): Promise<boolean> {
  const ids = parseOsReleaseIds(fs.existsSync('/etc/os-release') ? fs.readFileSync('/etc/os-release', 'utf8') : '')
  const bySoname = missing.map(soname => `${soname}()(64bit)`)
  if (isOstreeSystem()) {
    // --allow-inactive: a provider may already be in the base image
    await execFileAsync('rpm-ostree', ['install', '--idempotent', '--allow-inactive', ...bySoname],
      { timeout: 1_200_000, maxBuffer: 10 * 1024 * 1024 })
    return true
  }
  const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
  let command: string[]
  if (distro === 'ubuntu-24.04') {
    command = ['apt-get', 'install', '-y', ...RUNTIME_DEPS_UBUNTU]
  } else if (ids.includes('fedora') && isCommandAvailable('dnf')) {
    command = ['dnf', 'install', '-y', ...bySoname]
  } else if ((ids.includes('suse') || ids.includes('opensuse')) && isCommandAvailable('zypper')) {
    command = ['zypper', '--non-interactive', 'install', ...bySoname]
  } else {
    // apt and pacman can't install by soname without a file index
    throw new Error(`These system libraries are missing: ${missing.join(', ')}. Install the packages providing them with your package manager.`)
  }
  await execFileAsync(elevate, command, { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 })
  return false
}

export async function installLwePrebuilt(win: BrowserWindow): Promise<void> {
  const send = (progress: LweInstallProgress) => {
    win.webContents.send(IpcChannels.EVENT_LWE_INSTALL_PROGRESS, progress)
  }

  const installDir = getLwePrebuiltDir()
  const archive = `${installDir}.download.tar.gz`
  const staging = `${installDir}.new`
  const previous = `${installDir}.old`

  try {
    const target = getPrebuiltTarget()
    const distro = detectPrebuiltDistro()
    if (!target.supported || !target.asset || !distro) throw new Error(target.reason ?? 'No prebuilt build fits this system.')

    send({ stage: 'downloading', message: t('lwe.lookingUpRelease'), percentage: 2 })
    const release = await fetchLatestRelease(LWE_RELEASE_REPO)
    if (!release) throw new Error(`${LWE_RELEASE_REPO} has no releases yet.`)
    const portableAsset = assetName(isKdeSession() ? 'kde' : 'generic', 'portable')
    const asset = release.assets.find(a => a.name === target.asset) ?? release.assets.find(a => a.name === portableAsset)
    if (!asset) throw new Error(`Release ${release.tag_name} has no ${target.asset}.`)
    const assetDistro: PrebuiltDistro = asset.name === portableAsset ? 'portable' : distro

    const installed = readPrebuiltRelease()
    const binary = path.join(installDir, 'linux-wallpaperengine')
    const upToDate = installed?.tag === release.tag_name && installed.asset === asset.name && fs.existsSync(binary)

    if (!upToDate) {
      const sizeMb = Math.round(asset.size / 1024 / 1024)
      send({ stage: 'downloading', message: t('lwe.downloadingRelease', { tag: release.tag_name, size: sizeMb }), percentage: 5 })
      fs.mkdirSync(path.dirname(installDir), { recursive: true })
      // checked against the release's size and sha256 before tar sees it
      await downloadVerified(asset, archive, fraction => {
        send({
          stage: 'downloading',
          message: t('lwe.downloadingRelease', { tag: release.tag_name, size: sizeMb }),
          percentage: 5 + Math.round(fraction * 70)
        })
      })

      send({ stage: 'installing', message: t('lwe.unpacking'), percentage: 78 })
      fs.rmSync(staging, { recursive: true, force: true })
      fs.mkdirSync(staging)
      await execFileAsync('tar', ['-xzf', archive, '-C', staging, '--strip-components=1'], { timeout: 300_000 })
      fs.writeFileSync(path.join(staging, '.release'), JSON.stringify({ tag: release.tag_name, asset: asset.name }))

      // running engines keep their mapped files

      fs.rmSync(previous, { recursive: true, force: true })
      if (fs.existsSync(installDir)) fs.renameSync(installDir, previous)
      fs.renameSync(staging, installDir)
      fs.rmSync(previous, { recursive: true, force: true })
      fs.rmSync(archive, { force: true })
    }

    send({ stage: 'installing', message: t('lwe.checkingLibraries'), percentage: 85 })
    let missing = await findMissingLibraries(binary)
    if (missing.length > 0) {
      send({
        stage: 'installing',
        message: t('lwe.installingLibraries', { libraries: missing.join(', ') }),
        percentage: 88
      })
      if (await installMissingLibraries(assetDistro, missing)) {
        resetLweDetection()
        send({
          stage: 'done',
          message: t('lwe.installedRebootNeeded', { tag: release.tag_name, libraries: missing.join(', ') }),
          percentage: 100
        })
        return
      }
      missing = await findMissingLibraries(binary)
      if (missing.length > 0) {
        throw new Error(`These system libraries are still missing: ${missing.join(', ')}. Install them with your package manager, or build from source.`)
      }
    }

    resetLweDetection()
    send({
      stage: 'done',
      message: upToDate
        ? t('lwe.upToDate', { tag: release.tag_name })
        : t('lwe.installedPrebuilt', { tag: release.tag_name, build: assetDistro === distro && target.label ? target.label : distroLabel('portable') }),
      percentage: 100
    })
  } catch (err) {
    fs.rmSync(archive, { force: true })
    fs.rmSync(staging, { recursive: true, force: true })
    send({ stage: 'error', message: t('lwe.installFailed', { error: (err as Error).message }), percentage: 0 })
  }
}
