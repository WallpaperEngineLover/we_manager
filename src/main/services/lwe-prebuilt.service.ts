import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { LWE_RELEASE_REPO } from '@shared/constants'
import type { LweInstallProgress, LwePrebuiltTarget } from '@shared/types'
import { isCommandAvailable } from '../utils/platform'
import { getLwePrebuiltDir } from '../utils/paths'
import { buildCleanBuildEnv, isOstreeSystem, readPrebuiltRelease, resetLweDetection } from './lwe.service'

const execFileAsync = promisify(execFile)

// Arch builds are paused: V8 (libnode) is only in the AUR there, so the release CI can't build them
type PrebuiltDistro = 'ubuntu-24.04' | 'fedora-44'

const DISTRO_LABELS: Record<PrebuiltDistro, string> = {
  'ubuntu-24.04': 'Ubuntu 24.04',
  'fedora-44': 'Fedora 44'
}

// Libraries the engine and CEF load from the system. Fedora installs missing ones by soname instead
// (see installMissingLibraries), so Nobara's full ffmpeg is never swapped for ffmpeg-free.
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
  } catch { /* no os-release */ }
  return fields
}

function detectPrebuiltDistro(): PrebuiltDistro | undefined {
  const release = readOsRelease()
  const ids = [release.ID, ...(release.ID_LIKE ?? '').split(/\s+/)].filter(Boolean)
  // Mint 22 and Pop!_OS 24.04 are built on noble and carry its libraries
  if (release.UBUNTU_CODENAME === 'noble' || (release.ID === 'ubuntu' && release.VERSION_ID === '24.04')) {
    return 'ubuntu-24.04'
  }
  if (ids.includes('fedora') && release.VERSION_ID === '44') return 'fedora-44'
  return undefined
}

function isKdeSession(): boolean {
  return (process.env.XDG_CURRENT_DESKTOP ?? '').split(':').some(d => d.toUpperCase() === 'KDE')
}

export function getPrebuiltTarget(): LwePrebuiltTarget {
  if (process.arch !== 'x64') {
    return { supported: false, reason: 'Prebuilt builds are x86_64 only, build from source instead.' }
  }
  const distro = detectPrebuiltDistro()
  if (!distro) {
    const release = readOsRelease()
    const isArch = [release.ID, ...(release.ID_LIKE ?? '').split(/\s+/)].includes('arch')
    const name = release.PRETTY_NAME ?? 'this distribution'
    return {
      supported: false,
      reason: isArch
        ? 'There is no prebuilt build for Arch for now (V8 is only in the AUR there), build from source instead.'
        : `There is no prebuilt build for ${name} (only Ubuntu 24.04 and Fedora 44), build from source instead.`
    }
  }
  const variant = isKdeSession() ? 'kde' : 'generic'
  return {
    supported: true,
    asset: `linux-wallpaperengine-${variant}-${distro}-x86_64.tar.gz`,
    label: `${DISTRO_LABELS[distro]}, ${variant === 'kde' ? 'with' : 'without'} KDE integration`
  }
}

interface GithubRelease {
  tag_name: string
  assets: { name: string; browser_download_url: string; size: number }[]
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  const res = await fetch(`https://api.github.com/repos/${LWE_RELEASE_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'we-manager' }
  })
  if (res.status === 404) throw new Error(`${LWE_RELEASE_REPO} has no releases yet.`)
  if (!res.ok) throw new Error(`GitHub answered ${res.status} ${res.statusText} for the latest release.`)
  return (await res.json()) as GithubRelease
}

async function download(url: string, dest: string, total: number, onProgress: (fraction: number) => void): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': 'we-manager' } })
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`)

  const size = Number(res.headers.get('content-length')) || total
  let received = 0
  let lastReport = 0
  const body = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    const now = Date.now()
    if (size > 0 && now - lastReport > 250) {
      lastReport = now
      onProgress(received / size)
    }
  })
  await pipeline(body, fs.createWriteStream(dest))
}

/** Sonames the binary (with its bundled libs) can't resolve on this system */
async function findMissingLibraries(binary: string): Promise<string[]> {
  const { stdout } = await execFileAsync('ldd', [binary], {
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
  if (distro === 'fedora-44' && isOstreeSystem()) {
    // --allow-inactive: a provider may already be in the base image
    await execFileAsync('rpm-ostree', [
      'install', '--idempotent', '--allow-inactive', ...missing.map(soname => `${soname}()(64bit)`)
    ], { timeout: 1_200_000, maxBuffer: 10 * 1024 * 1024 })
    return true
  }
  const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
  let command: string[]
  switch (distro) {
    case 'fedora-44':
      command = ['dnf', 'install', '-y', ...missing.map(soname => `${soname}()(64bit)`)]
      break
    case 'ubuntu-24.04':
      command = ['apt-get', 'install', '-y', ...RUNTIME_DEPS_UBUNTU]
      break
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

    send({ stage: 'downloading', message: 'Looking up the latest release...', percentage: 2 })
    const release = await fetchLatestRelease()
    const asset = release.assets.find(a => a.name === target.asset)
    if (!asset) throw new Error(`Release ${release.tag_name} has no ${target.asset}.`)

    const installed = readPrebuiltRelease()
    const binary = path.join(installDir, 'linux-wallpaperengine')
    const upToDate = installed?.tag === release.tag_name && installed.asset === asset.name && fs.existsSync(binary)

    if (!upToDate) {
      const sizeMb = Math.round(asset.size / 1024 / 1024)
      send({ stage: 'downloading', message: `Downloading ${release.tag_name} (${sizeMb} MB)...`, percentage: 5 })
      fs.mkdirSync(path.dirname(installDir), { recursive: true })
      await download(asset.browser_download_url, archive, asset.size, fraction => {
        send({
          stage: 'downloading',
          message: `Downloading ${release.tag_name} (${sizeMb} MB)...`,
          percentage: 5 + Math.round(fraction * 70)
        })
      })

      send({ stage: 'installing', message: 'Unpacking...', percentage: 78 })
      fs.rmSync(staging, { recursive: true, force: true })
      fs.mkdirSync(staging)
      await execFileAsync('tar', ['-xzf', archive, '-C', staging, '--strip-components=1'], { timeout: 300_000 })
      fs.writeFileSync(path.join(staging, '.release'), JSON.stringify({ tag: release.tag_name, asset: asset.name }))

      // running engines keep their already mapped files, the new ones are used from the next launch
      fs.rmSync(previous, { recursive: true, force: true })
      if (fs.existsSync(installDir)) fs.renameSync(installDir, previous)
      fs.renameSync(staging, installDir)
      fs.rmSync(previous, { recursive: true, force: true })
      fs.rmSync(archive, { force: true })
    }

    send({ stage: 'installing', message: 'Checking system libraries...', percentage: 85 })
    let missing = await findMissingLibraries(binary)
    if (missing.length > 0) {
      send({
        stage: 'installing',
        message: `Installing missing system libraries (sudo required): ${missing.join(', ')}`,
        percentage: 88
      })
      if (await installMissingLibraries(distro, missing)) {
        resetLweDetection()
        send({
          stage: 'done',
          message: `linux-wallpaperengine ${release.tag_name} installed. The missing system libraries (${missing.join(', ')}) were added with rpm-ostree, reboot once before using it.`,
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
        ? `linux-wallpaperengine ${release.tag_name} is already up to date.`
        : `linux-wallpaperengine ${release.tag_name} installed (${target.label}).`,
      percentage: 100
    })
  } catch (err) {
    fs.rmSync(archive, { force: true })
    fs.rmSync(staging, { recursive: true, force: true })
    send({ stage: 'error', message: `Installation failed: ${(err as Error).message}`, percentage: 0 })
  }
}
