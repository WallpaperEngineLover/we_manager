import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as os from 'os'
import type { GraphicsWarning } from '@shared/types'
import { getEngineRenderer } from './lwe.service'
import { hostAppPath, hostCommand, isFlatpak } from '../utils/flatpak'

const execFileAsync = promisify(execFile)

const SOFTWARE_RENDERER = /llvmpipe|softpipe|swrast/i
const GLVND_DIR = '/usr/share/glvnd/egl_vendor.d'
const FLATPAK_GL_DIR = '/usr/lib/x86_64-linux-gnu/GL'
const NVIDIA_VERSION_FILE = process.env['WEM_NVIDIA_VERSION_FILE'] || '/proc/driver/nvidia/version'
const EXTENSION_PREFIX = 'org.freedesktop.Platform.GL.nvidia-'
const INSTALL_TIMEOUT_MS = 10 * 60_000

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function hasNvidiaDevice(): boolean {
  return fs.existsSync('/dev/nvidiactl')
}

/** The sandbox only gets NVIDIA's EGL from the Flatpak GL extension that matches the host driver */
function sandboxHasNvidiaGl(): boolean {
  const vendorDirs = [GLVND_DIR, ...(process.env['__EGL_VENDOR_LIBRARY_DIRS'] ?? '').split(':').filter(Boolean)]
  return (
    vendorDirs.some((dir) => listDir(dir).some((name) => /nvidia/i.test(name))) ||
    listDir(FLATPAK_GL_DIR).some((name) => name.startsWith('nvidia'))
  )
}

export function parseNvidiaDriverVersion(procText: string): string | undefined {
  return /(\d{3,}\.\d+(?:\.\d+)?)/.exec(procText)?.[1]
}

export function nvidiaExtensionName(version: string): string {
  return EXTENSION_PREFIX + version.replace(/\./g, '-')
}

function hostDriverExtension(): string | undefined {
  try {
    const version = parseNvidiaDriverVersion(fs.readFileSync(NVIDIA_VERSION_FILE, 'utf8'))
    return version ? nvidiaExtensionName(version) : undefined
  } catch {
    return undefined
  }
}

/** What the engine said about its renderer wins, before it did only the Flatpak NVIDIA check can tell */
export function getGraphicsWarning(): GraphicsWarning | null {
  const renderer = getEngineRenderer()
  const flatpakNvidia = isFlatpak() && hasNvidiaDevice() && !sandboxHasNvidiaGl()

  if (renderer !== undefined && !SOFTWARE_RENDERER.test(renderer)) return null
  if (!flatpakNvidia) return renderer !== undefined ? { kind: 'software', renderer } : null

  const extension = hostDriverExtension()
  return { kind: 'flatpak-nvidia', ...(renderer !== undefined ? { renderer } : {}), ...(extension ? { extension } : {}) }
}

async function onHost(cmd: string, args: string[], timeout: number): Promise<string> {
  const [file, fileArgs] = hostCommand(cmd, args)
  const { stdout } = await execFileAsync(file, fileArgs, { timeout, maxBuffer: 1 << 20 })
  return stdout
}

/** The extension has to go where the app is, and a remote that exists in both makes flatpak ask which one */
export function appInstallation(appPath = hostAppPath()): '--user' | '--system' {
  return appPath?.startsWith(os.homedir()) ? '--user' : '--system'
}

export async function installNvidiaExtension(): Promise<{ ok: boolean; message: string }> {
  const extension = hostDriverExtension()
  if (!isFlatpak() || !extension) return { ok: false, message: 'The driver version could not be read' }

  try {
    const installation = appInstallation()
    const listing = await onHost(
      'flatpak',
      ['remote-ls', installation, 'flathub', '--runtime', '--columns=application,branch'],
      60_000
    )
    const branch = listing
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .find(([id]) => id === extension)?.[1]
    if (!branch) return { ok: false, message: `${extension} is not on Flathub` }

    await onHost(
      'flatpak',
      ['install', installation, '-y', '--noninteractive', 'flathub', `${extension}//${branch}`],
      INSTALL_TIMEOUT_MS
    )
    return { ok: true, message: extension }
  } catch (err) {
    const e = err as Error & { stderr?: string }
    return { ok: false, message: (e.stderr || e.message).trim().split('\n').slice(-2).join(' ') }
  }
}
