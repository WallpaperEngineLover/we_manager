import { execFile, execFileSync, spawn, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { parseLweFontList } from './lwe-fonts'
import type {
  LweStatus,
  LweInstallProgress,
  LinuxDistro,
  HotswapSettings,
  LweSceneObject,
  LweProperty,
  LweAudioObject,
  LweSceneEffect,
  LweFontNeed,
  CrashPhase,
  EngineFlags,
  ScreenTarget,
  HwdecBackend,
  HrtfMode,
  TransitionDuration,
  TransitionMode,
  BatteryFps,
  IdlePause,
  SplitLayout,
  XrayMode
} from '@shared/types'
import {
  isCommandAvailable,
  invalidateCommandCache,
  whichCommand,
  getConnectedScreens,
  getMirroredScreens,
  getScreenGeometry,
  getWaylandDisplay,
  getXdgRuntimeDir,
  isWaylandSession
} from '../utils/platform'
import { getWorkshopPath, getLweManifestPath, getLwePrebuiltDir, getSteamRoots } from '../utils/paths'
import {
  flatpakInstanceId,
  hostCommand,
  hostPidOf,
  hostProcessCommandLine,
  hostProcessCommandLineAsync,
  isFlatpak,
  killHostProcess
} from '../utils/flatpak'
import { owningPackage } from '../utils/packages'
import { isOwnDirectory, lweBuildDir } from '../utils/buildDir'
import { LWE_PROCESS_PATTERN, isLweCommandLine } from '../utils/engineProcess'
import {
  getLweRepoUrl,
  getLweRepoBranch,
  getLweCmakeArgs,
  getAudioScreen,
  getAmbientVolume,
  getLeds,
  getLoader,
  getDefaultAudioSensitivity,
  getDisablePuppetAnimation,
  getScriptLimits,
  getDisabledScreens
} from './config.service'
import { DEFAULT_LWE_FPS, DEFAULT_LWE_REPO } from '@shared/constants'
import { engineFlagArgs, filterSupportedArgs } from '@shared/engineFlags'
import { imageAdjustmentArgs, imageAdjustmentLines, type ImageAdjustments } from '@shared/imageAdjustments'
import { formatVideoSegments, type VideoSegment } from '@shared/videoTrim'
import { t } from '../i18n'

export const ALL_SCREENS: ScreenTarget = '*'

const execFileAsync = promisify(execFile)

// AppRun points LD_LIBRARY_PATH etc. into /tmp/.mount_*, which CMake would cache
const APPIMAGE_MOUNT = /^\/tmp\/\.mount_[^/]+(\/|$)/

const DEFAULT_LED_SERVER = '127.0.0.1:6742'

const LOCAL_SOURCE_EXCLUDES = [
  '/.git', '/build', '/build-*', '/cmake-build-*', '/.cache', '/result', '/result-*', '/.idea', '/.vscode', '/.zed',
  '__pycache__'
]
const tarExclude = (pattern: string): string =>
  `--exclude=${pattern.startsWith('/') ? `.${pattern}` : pattern}`

function validLedServer(value: string): string {
  const server = value.trim()
  const match = /^([^\s:]+)(?::(\d{1,5}))?$/.exec(server)
  if (!match) return DEFAULT_LED_SERVER
  if (match[2] !== undefined && (Number(match[2]) < 1 || Number(match[2]) > 65535)) return DEFAULT_LED_SERVER
  return server
}

function isAppImagePath(entry: string, appDir: string | undefined): boolean {
  if (appDir && (entry === appDir || entry.startsWith(`${appDir}/`))) return true
  return APPIMAGE_MOUNT.test(entry)
}

export function buildCleanBuildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const appDir = env.APPDIR
  for (const key of ['LD_LIBRARY_PATH', 'LD_PRELOAD', 'APPDIR', 'APPIMAGE', 'OWD', 'ARGV0']) {
    delete env[key]
  }
  // find_library also searches PATH, which picked up Electron's bundled libEGL.so
  for (const [key, value] of Object.entries(env)) {
    if (!value || !value.includes('/')) continue
    const entries = value.split(':')
    if (!entries.some((entry) => isAppImagePath(entry, appDir))) continue
    const kept = entries.filter((entry) => !isAppImagePath(entry, appDir))
    if (kept.length > 0) env[key] = kept.join(':')
    else delete env[key]
  }
  return env
}

/** A cache pointing into an AppImage mount needs a fresh configure */
function dropPoisonedCmakeCache(cmakeBuild: string): boolean {
  const cachePath = path.join(cmakeBuild, 'CMakeCache.txt')
  let cache: string
  try { cache = fs.readFileSync(cachePath, 'utf8') } catch { return false }
  if (!/\/tmp\/\.mount_[^/\s]+/.test(cache)) return false
  fs.rmSync(cachePath, { force: true })
  return true
}

const LWE_BINARY = 'linux-wallpaperengine'
const BUILD_DIR = lweBuildDir()

const LWE_SEARCH_PATHS = [
  path.join(os.homedir(), 'projects', 'private', 'linux-wallpaperengine', 'build', 'output', 'linux-wallpaperengine'),
  path.join(os.homedir(), 'projects', 'linux-wallpaperengine', 'build', 'output', 'linux-wallpaperengine'),
  // a downloaded release wins over a source install
  path.join(getLwePrebuiltDir(), 'linux-wallpaperengine'),
  '/usr/local/bin/linux-wallpaperengine',
  '/usr/local/linux-wallpaperengine',
  '/usr/bin/linux-wallpaperengine',
  path.join(os.homedir(), '.local', 'bin', 'linux-wallpaperengine'),
  path.join(os.homedir(), 'bin', 'linux-wallpaperengine'),
  '/opt/linux-wallpaperengine/linux-wallpaperengine'
]

async function removeBuildDir(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) return
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 60 })
    return
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EACCES' && code !== 'ENOTEMPTY' && code !== 'EPERM') throw err
  }
  // root only deletes what is ours: files a make install left root-owned inside our folder, not somebody else's
  // folder or a link
  if (!isOwnDirectory(dir)) throw new Error(`${dir} is not a folder of yours, not removing it as root.`)
  const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
  await execFileAsync(elevate, ['rm', '-rf', dir], { timeout: 30_000, encoding: 'utf8' })
}

interface LweInstallManifest {
  files: string[]
  symlink: string
}

function readLweManifest(): LweInstallManifest | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(getLweManifestPath(), 'utf8')) as LweInstallManifest
    if (Array.isArray(parsed.files) && typeof parsed.symlink === 'string') return parsed
  } catch { /* falls back to heuristic cleanup in uninstallLwe */ }
  return undefined
}

function writeLweManifest(manifest: LweInstallManifest): void {
  try {
    fs.writeFileSync(getLweManifestPath(), JSON.stringify(manifest, null, 2), 'utf8')
  } catch { }
}

const FLATPAK_LWE_BINARY = '/app/bin/linux-wallpaperengine'

function findLweBinary(): string | undefined {
  if (isFlatpak()) return fs.existsSync(FLATPAK_LWE_BINARY) ? FLATPAK_LWE_BINARY : undefined
  for (const p of LWE_SEARCH_PATHS) {
    try {
      fs.accessSync(p, fs.constants.X_OK)
      return p
    } catch { }
  }
  return whichCommand(LWE_BINARY)
}

export function readPrebuiltRelease(): { tag: string; asset: string } | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(getLwePrebuiltDir(), '.release'), 'utf8')) as { tag: string; asset: string }
  } catch {
    return undefined
  }
}

function isPrebuiltPath(p: string): boolean {
  return p.startsWith(getLwePrebuiltDir() + path.sep)
}

let ownerCache: { path: string; owner: string | undefined } | undefined

/** Flatpak, Nix profile or distribution package that owns the binary */
export function lwePackageOwner(binary: string): string | undefined {
  let real = binary
  try { real = fs.realpathSync(binary) } catch { }
  if (ownerCache?.path === real) return ownerCache.owner
  let owner: string | undefined
  if (isFlatpak() && real.startsWith('/app/')) {
    owner = 'the Flatpak'
  } else if (real.startsWith('/nix/store/')) {
    owner = 'Nix'
  } else {
    const pkg = owningPackage(real)
    if (pkg) owner = `${pkg.manager} (${pkg.name})`
  }
  ownerCache = { path: real, owner }
  return owner
}

export function getLweStatus(): LweStatus {
  const found = findLweBinary()
  if (!found) return { installed: false }
  const version = isPrebuiltPath(found) ? readPrebuiltRelease()?.tag : undefined
  const managedBy = isPrebuiltPath(found) ? undefined : lwePackageOwner(found)
  return {
    installed: true,
    path: found,
    ...(version ? { version } : {}),
    ...(managedBy ? { managedBy } : {})
  }
}

export function resetLweDetection(): void {
  ownerCache = undefined
  invalidateCommandCache(LWE_BINARY)
  invalidateHelpText()
}

export function parseOsReleaseIds(release: string): string[] {
  const ids: string[] = []
  for (const line of release.split('\n')) {
    const match = /^(ID|ID_LIKE)=(.*)$/.exec(line.trim())
    if (match) ids.push(...match[2].replace(/^["']|["']$/g, '').toLowerCase().split(/\s+/).filter(Boolean))
  }
  return ids
}

export function detectDistro(): LinuxDistro {
  let ids: string[]
  try {
    ids = parseOsReleaseIds(fs.readFileSync('/etc/os-release', 'utf8'))
  } catch {
    return 'unknown'
  }
  return distroFromIds(ids)
}

export function distroFromIds(ids: string[]): LinuxDistro {
  for (const id of ids) {
    if (['fedora', 'nobara', 'rhel', 'centos'].includes(id)) return 'fedora'
    if (['arch', 'manjaro', 'endeavouros'].includes(id)) return 'arch'
    if (['debian', 'ubuntu', 'linuxmint', 'pop'].includes(id)) return 'debian'
    if (['suse', 'opensuse', 'opensuse-tumbleweed', 'opensuse-leap', 'opensuse-slowroll', 'sles'].includes(id)) return 'suse'
  }
  return 'unknown'
}

export function isOstreeSystem(): boolean {
  return fs.existsSync('/run/ostree-booted')
}

const DEPS_DEBIAN = [
  'git', 'build-essential', 'cmake', 'pkg-config',
  'libxrandr-dev', 'libxinerama-dev', 'libxcomposite-dev', 'libxdamage-dev', 'libxcursor-dev', 'libxi-dev',
  'libgl-dev', 'libglew-dev', 'freeglut3-dev', 'libsdl2-dev',
  'liblz4-dev', 'libavcodec-dev', 'libavformat-dev', 'libavutil-dev', 'libswscale-dev',
  'libxxf86vm-dev', 'libglm-dev', 'libglfw3-dev',
  'libmpv-dev', 'mpv', 'libpulse-dev', 'libpulse0', 'libfftw3-dev', 'libfreetype-dev', 'libharfbuzz-dev', 'libdbus-1-dev',
  'libwayland-dev', 'wayland-protocols', 'libegl1-mesa-dev',
  'libgmp-dev', 'patchelf',
  // V8 for scene scripts
  'libnode-dev'
]

// 'ffmpeg' conflicts with ffmpeg-free on Fedora
const DEPS_FEDORA = [
  'git', 'gcc', 'g++', 'cmake', 'pkg-config',
  'libXrandr-devel', 'libXinerama-devel', 'libXcomposite-devel', 'libXdamage-devel', 'libXcursor-devel', 'libXi-devel',
  'mesa-libGL-devel', 'glew-devel', 'freeglut-devel', 'SDL2-devel',
  'lz4-devel', 'ffmpeg-free-devel',
  'libXxf86vm-devel', 'glm-devel', 'glfw-devel',
  'mpv-devel', 'pulseaudio-libs-devel', 'fftw-devel', 'freetype-devel', 'harfbuzz-devel', 'dbus-devel',
  'wayland-devel', 'wayland-protocols-devel', 'mesa-libEGL-devel',
  'gmp-devel', 'patchelf'
]

/** Versioned nodejsNN-devel packages conflict: keep an installed one, else match the newest libnode */
export function nodeDevelPackage(installed: string[]): string | null {
  const names = installed.map((name) => name.trim())
  if (names.some((name) => /^nodejs\d*-devel$/.test(name))) return null

  let best: { name: string; version: number } | undefined
  for (const name of names) {
    const match = /^nodejs(\d*)-libs$/.exec(name)
    if (!match) continue
    const version = match[1] ? Number(match[1]) : 0
    if (!best || version > best.version) best = { name: `nodejs${match[1]}-devel`, version }
  }
  return best?.name ?? 'nodejs-devel'
}

function quotedPaths(paths: string[]): string {
  return paths.map((p) => JSON.stringify(p)).join(' ')
}

function installedNodePackages(): string[] {
  try {
    return execFileSync('rpm', ['-qa', '--qf', '%{NAME}\n', 'nodejs*-libs', 'nodejs*-devel'], {
      encoding: 'utf8',
      timeout: 10_000
    }).split('\n')
  } catch {
    return []
  }
}

// SDL2 comes from sdl2-compat, GLFW is libglfw-devel on Leap and glfw-devel on Tumbleweed and nodejs-devel is whichever
// Node.js is the default (V8 for scene scripts), all capabilities. FFmpeg's devel packages are ffmpeg-<N>-lib*-devel, see suseFfmpegDevel
const DEPS_SUSE = [
  'git', 'gcc', 'gcc-c++', 'cmake', 'pkgconf-pkg-config', 'make',
  'libXrandr-devel', 'libXinerama-devel', 'libXcomposite-devel', 'libXdamage-devel', 'libXcursor-devel', 'libXi-devel',
  'Mesa-libGL-devel', 'glew-devel', 'freeglut-devel', 'pkgconfig(sdl2)',
  'liblz4-devel',
  'libXxf86vm-devel', 'glm-devel', 'pkgconfig(glfw3)',
  'mpv-devel', 'libpulse-devel', 'fftw3-devel', 'freetype2-devel', 'harfbuzz-devel', 'dbus-1-devel',
  'wayland-devel', 'wayland-protocols-devel', 'Mesa-libEGL-devel',
  'gmp-devel', 'patchelf', 'nodejs-devel'
]

/**
 * Tumbleweed carries several FFmpeg versions side by side. The engine has to link the one libmpv uses, two FFmpeg
 * ABIs in one process resolve each other's symbols. Needs mpv-devel installed (it pulls libmpv2); null if unreadable.
 */
function suseFfmpegDevel(): string[] | null {
  try {
    const requires = execFileSync('rpm', ['-q', '--requires', 'libmpv2'], { encoding: 'utf8', timeout: 10_000 })
    const soname = /libavcodec\.so\.\d+/.exec(requires)?.[0]
    if (!soname) return null
    const version = execFileSync('rpm', ['-q', '--qf', '%{VERSION}\n', '--whatprovides', `${soname}()(64bit)`], {
      encoding: 'utf8',
      timeout: 10_000
    }).split('\n')[0]
    const major = /^(\d+)\./.exec(version)?.[1]
    if (!major) return null
    return ['avcodec', 'avformat', 'avutil', 'swscale', 'swresample'].map((lib) => `ffmpeg-${major}-lib${lib}-devel`)
  } catch {
    return null
  }
}

const DEPS_ARCH = [
  'git', 'base-devel', 'cmake', 'pkg-config',
  'glew', 'freeglut', 'sdl2', 'lz4', 'ffmpeg',
  'glm', 'glfw', 'mpv', 'libpulse', 'fftw', 'freetype2', 'harfbuzz', 'dbus',
  'libxrandr', 'libxinerama', 'libxcomposite', 'libxdamage', 'libxcursor', 'libxi', 'libxxf86vm',
  'wayland', 'wayland-protocols', 'mesa',
  'gmp', 'patchelf'
]

export async function installLweDeps(win: BrowserWindow): Promise<boolean> {
  const send = (progress: LweInstallProgress) => {
    win.webContents.send(IpcChannels.EVENT_LWE_INSTALL_PROGRESS, progress)
  }

  if (isFlatpak()) {
    send({ stage: 'error', message: t('lwe.flatpakManaged'), percentage: 0 })
    return false
  }

  const distro = detectDistro()
  if (distro === 'unknown') {
    send({
      stage: 'error',
      message: t('lwe.noDistroDeps'),
      percentage: 0
    })
    return false
  }

  if (isOstreeSystem()) {
    send({
      stage: 'error',
      message: t('lwe.imageBasedSystem'),
      percentage: 0
    })
    return false
  }

  let pkgManager: string
  let installArgs: string[]
  let packages: string[]

  switch (distro) {
    case 'debian':
      pkgManager = 'apt-get'
      installArgs = ['install', '-y']
      packages = DEPS_DEBIAN
      break
    case 'fedora':
      pkgManager = 'dnf'
      // don't fail on broken repos or renamed packages
      installArgs = ['install', '-y', '--skip-unavailable']
      const nodeDevel = nodeDevelPackage(installedNodePackages())
      packages = nodeDevel ? [...DEPS_FEDORA, nodeDevel] : DEPS_FEDORA
      break
    case 'suse':
      pkgManager = 'zypper'
      // --force-resolution: the minimal images ship busybox-diffutils, which conflicts with what -devel packages pull in
      installArgs = ['--non-interactive', 'install', '--no-recommends', '--force-resolution']
      packages = DEPS_SUSE
      break
    case 'arch':
      pkgManager = 'pacman'
      // a fresh install has no sync databases and every package would be "target not found"
      installArgs = pacmanHasSyncDatabases() ? ['-S', '--noconfirm', '--needed'] : ['-Sy', '--noconfirm', '--needed']
      packages = DEPS_ARCH
      break
  }

  const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'

  if (distro === 'suse') {
    try {
      await execFileAsync(elevate, [pkgManager, ...installArgs, 'mpv-devel'], { timeout: 600_000 })
    } catch (err) {
      send({ stage: 'error', message: t('lwe.depsFailed', { error: (err as Error).message }), percentage: 0 })
      return false
    }
    packages = [...packages, ...(suseFfmpegDevel() ?? ['pkgconfig(libavcodec)', 'pkgconfig(libavformat)', 'pkgconfig(libavutil)', 'pkgconfig(libswscale)', 'pkgconfig(libswresample)'])]
  }

  send({
    stage: 'installing-deps',
    message: t('lwe.installingPackages', { count: packages.length, manager: pkgManager }),
    percentage: 10
  })

  try {
    await execFileAsync(elevate, [pkgManager, ...installArgs, ...packages], {
      timeout: 600_000
    })
    // libnode is AUR only on Arch, the settings page has a button for the CI's prebuilt package; openSUSE Leap's Node.js packages have no shared library at all
    const libnodeMissing = distro === 'arch' && !fs.existsSync('/usr/lib/libnode.so')
    const suseNoV8 = distro === 'suse' && !fs.readdirSync('/usr/lib64').some((name) => name.startsWith('libnode.so'))
    send({
      stage: 'done',
      message: libnodeMissing
        ? t('lwe.depsInstalledNoV8')
        : suseNoV8
          ? t('lwe.depsInstalledNoV8Suse')
          : t('lwe.depsInstalled'),
      percentage: 100
    })
    return true
  } catch (err) {
    send({
      stage: 'error',
      message: t('lwe.depsFailed', { error: (err as Error).message }),
      percentage: 0
    })
    return false
  }
}

/** the repositories of pacman.conf's [sections] (no [options]), Include lines are not followed */
export function parsePacmanRepos(conf: string): string[] {
  return conf.split('\n')
    .map(line => /^\[([^\]]+)\]\s*$/.exec(line.trim())?.[1])
    .filter((name): name is string => name !== undefined && name !== 'options')
}

/** true when every configured repository has its database, one missing (Garuda ships a stale chaotic-aur one) breaks `-S` */
export function pacmanHasSyncDatabases(): boolean {
  try {
    const present = new Set(fs.readdirSync('/var/lib/pacman/sync'))
    let repos: string[] = []
    try {
      repos = execFileSync('pacman-conf', ['--repo-list'], { encoding: 'utf8' }).split('\n').map(name => name.trim()).filter(Boolean)
    } catch {
      repos = parsePacmanRepos(fs.readFileSync('/etc/pacman.conf', 'utf8'))
    }
    if (repos.length === 0) return [...present].some((name) => name.endsWith('.db'))
    return repos.every((repo) => present.has(`${repo}.db`))
  } catch {
    return false
  }
}

export async function installLwe(win: BrowserWindow): Promise<void> {
  const send = (progress: LweInstallProgress) => {
    win.webContents.send(IpcChannels.EVENT_LWE_INSTALL_PROGRESS, progress)
  }

  if (isFlatpak()) {
    send({ stage: 'error', message: t('lwe.flatpakManaged'), percentage: 0 })
    return
  }

  let isLocalDir = false

  try {
    send({ stage: 'cloning', message: t('lwe.checkingDeps'), percentage: 0 })

    const missingDeps: string[] = []
    for (const dep of ['git', 'cmake', 'make', 'pkg-config']) {
      if (!isCommandAvailable(dep)) missingDeps.push(dep)
    }

    if (missingDeps.length > 0) {
      send({
        stage: 'error',
        message: t('lwe.missingDeps', { deps: missingDeps.join(', ') }),
        percentage: 0
      })
      return
    }

    let repo = getLweRepoUrl() ?? DEFAULT_LWE_REPO
    if (repo.startsWith('~/')) repo = path.join(os.homedir(), repo.slice(2))
    const branch = getLweRepoBranch()

    isLocalDir = (() => {
      try { return fs.statSync(repo).isDirectory() } catch { return false }
    })()

    // keep CEF's ~2GB download and objects for the same local source
    const sourceMarker = path.join(BUILD_DIR, '.lwe-source-path')
    const canReuseBuildCache = isLocalDir && (() => {
      try { return fs.readFileSync(sourceMarker, 'utf8').trim() === repo } catch { return false }
    })()
    if (!canReuseBuildCache) {
      await removeBuildDir(BUILD_DIR)
    }
    // private, the install runs this tree's make as root
    fs.mkdirSync(BUILD_DIR, { recursive: true, mode: 0o700 })

    if (isLocalDir) {
      // copy the working tree so uncommitted edits are built
      send({ stage: 'cloning', message: t('lwe.copyingSource', { repo }), percentage: 5 })
      if (isCommandAvailable('rsync')) {
        // --no-times: old source mtimes could make make skip a changed file in a reused dir. --checksum: without it
        // every file differs in mtime from its copy and is transferred again, which made every file newer than its
        // object. Now only the files whose content changed are written (and get a fresh mtime), the rest stays old
        await execFileAsync('rsync', [
          '-a', '--no-times', '--checksum', '--delete', ...LOCAL_SOURCE_EXCLUDES.map((e) => `--exclude=${e}`),
          `${repo}/`, `${BUILD_DIR}/`
        ], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
      } else {
        // -m, same reason as --no-times
        await execFileAsync('bash', [
          '-c',
          'tar -C "$1" "${@:3}" -cf - . | tar -C "$2" -xmf -',
          'bash', repo, BUILD_DIR, ...LOCAL_SOURCE_EXCLUDES.map(tarExclude)
        ], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
      }
      fs.writeFileSync(sourceMarker, repo, 'utf8')
    } else {
      const cloneArgs = ['clone', '--depth', '1', '--recursive']
      if (branch) cloneArgs.push('--branch', branch)
      cloneArgs.push(repo, BUILD_DIR)

      send({
        stage: 'cloning',
        message: branch ? t('lwe.cloningBranch', { repo, branch }) : t('lwe.cloning', { repo }),
        percentage: 5
      })
      await execFileAsync('git', cloneArgs, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024
      })
    }

    // rsync -a gave it the source folder's mode
    fs.chmodSync(BUILD_DIR, 0o700)

    const cmakeBuild = path.join(BUILD_DIR, 'build')
    fs.mkdirSync(cmakeBuild, { recursive: true })
    if (dropPoisonedCmakeCache(cmakeBuild)) {
      send({ stage: 'building', message: t('lwe.discardingCache'), percentage: 20 })
    }

    const buildEnv = buildCleanBuildEnv()

    send({ stage: 'building', message: t('lwe.runningCmake'), percentage: 25 })
    await execFileAsync('cmake', [
      '..',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DCMAKE_INSTALL_PREFIX=/usr/local',
      '-DCMAKE_C_FLAGS=-Wno-error',
      '-DCMAKE_CXX_FLAGS=-Wno-error',
      ...parseCustomArgs(getLweCmakeArgs() ?? '')
    ], {
      cwd: cmakeBuild,
      env: buildEnv,
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8'
    })

    // the copy above only touches files whose content changed, so make's mtime check is right for them. Everything
    // else a reused build dir depends on (the cmake options, the compiler) is tied to a signature: when it changes
    // the objects are thrown away (the CEF SDK stays)
    const buildSignature = JSON.stringify([getLweCmakeArgs() ?? '', buildEnv.CC ?? '', buildEnv.CXX ?? '', process.arch])
    const signatureFile = path.join(cmakeBuild, '.lwe-build-signature')
    const previousSignature = (() => {
      try { return fs.readFileSync(signatureFile, 'utf8') } catch { return null }
    })()
    if (canReuseBuildCache && previousSignature !== buildSignature) {
      await execFileAsync('make', ['clean'], {
        cwd: cmakeBuild,
        env: buildEnv,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8'
      }).catch(() => { })
    }
    fs.writeFileSync(signatureFile, buildSignature, 'utf8')

    send({ stage: 'building', message: t('lwe.compiling'), percentage: 40 })
    const cores = Math.max(1, os.cpus().length - 1)
    await execFileAsync('make', ['-j', String(cores)], {
      cwd: cmakeBuild,
      env: buildEnv,
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8'
    })

    send({ stage: 'building', message: t('lwe.buildComplete'), percentage: 80 })

    send({ stage: 'installing', message: t('lwe.installingSudo'), percentage: 85 })

    const installTool = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
    // pkexec changes cwd and PATH
    const pathEnv = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'
    // install_manifest.txt lets uninstall remove exactly what was installed
    const manifestMarker = '###LWE_INSTALL_MANIFEST###'
    const reclaim = isLocalDir
      ? `chown -R ${process.getuid!()}:${process.getgid!()} ${JSON.stringify(BUILD_DIR)}`
      : `rm -rf ${JSON.stringify(BUILD_DIR)}`
    const binaryPath = '/usr/local/linux-wallpaperengine'
    const linkPath = '/usr/local/bin/linux-wallpaperengine'
    // one elevated script, one password prompt
    const installScript = `cd ${JSON.stringify(cmakeBuild)} && export PATH=${JSON.stringify(pathEnv)} && make install && patchelf --set-rpath /usr/local/lib64:/usr/local/lib /usr/local/linux-wallpaperengine 2>/dev/null; ldconfig; ln -sf ${JSON.stringify(binaryPath)} ${JSON.stringify(linkPath)} || true; echo ${manifestMarker}; cat install_manifest.txt 2>/dev/null; ${reclaim}`
    const { stdout: installOutput } = await execFileAsync(installTool, ['bash', '-c', installScript], {
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8'
    })

    const manifestIdx = installOutput.indexOf(manifestMarker)
    if (manifestIdx !== -1) {
      const installedFiles = installOutput.slice(manifestIdx + manifestMarker.length)
        .split('\n').map(l => l.trim()).filter(Boolean)
      if (installedFiles.length > 0) {
        writeLweManifest({ files: installedFiles, symlink: linkPath })
      }
    }

    // a downloaded release would shadow the new build
    fs.rmSync(getLwePrebuiltDir(), { recursive: true, force: true })
    resetLweDetection()

    const status = getLweStatus()
    if (status.installed) {
      send({ stage: 'done', message: t('lwe.installed'), percentage: 100 })
    } else {
      send({
        stage: 'error',
        message: t('lwe.notInPath'),
        percentage: 100
      })
    }
  } catch (err) {
    // a local repo keeps its build dir so a retry stays incremental
    if (!isLocalDir) {
      try {
        await removeBuildDir(BUILD_DIR)
      } catch { }

    }

    const e = err as Error & { stdout?: string; stderr?: string }
    const fullMsg = e.message ?? String(err)
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n')
    const lines = (combined || fullMsg).split('\n')

    const compilerErrors = lines.filter(
      (l: string) => /:\d+:\d+: (?:fatal )?error:/i.test(l) || /^\/.*error:/i.test(l) ||
        /undefined reference/i.test(l) || /ld returned/i.test(l) ||
        /collect2: error/i.test(l)
    )
    const otherErrors = lines.filter(
      (l: string) => /CMake Error/i.test(l) || /No such file or directory/i.test(l) ||
        /Permission denied/i.test(l) || /cannot create/i.test(l) ||
        /fatal:/i.test(l) || /failed to/i.test(l)
    )

    let excerpt: string
    if (compilerErrors.length > 0) {
      excerpt = compilerErrors.slice(0, 10).join('\n')
    } else if (otherErrors.length > 0) {
      excerpt = otherErrors.slice(0, 8).join('\n')
    } else {
      excerpt = lines.filter((l: string) => l.trim() && !/^make\[\d+\]: (Entering|Leaving)/i.test(l))
        .slice(-30).join('\n')
    }

    send({
      stage: 'error',
      message: `${t('lwe.buildFailed')}\n${excerpt.trim() || fullMsg}`,
      percentage: 0
    })
  }
}

export async function uninstallLwe(): Promise<{ ok: boolean; message: string }> {
  if (isFlatpak()) return { ok: false, message: t('lwe.flatpakManaged') }
  const status = getLweStatus()
  if (!status.installed || !status.path) {
    return { ok: false, message: t('lwe.notInstalled') }
  }
  if (status.managedBy) {
    return { ok: false, message: t('lwe.managedBy', { owner: status.managedBy }) }
  }

  await stopLwe()

  if (isPrebuiltPath(status.path)) {
    try {
      fs.rmSync(getLwePrebuiltDir(), { recursive: true, force: true })
    } catch (err) {
      return { ok: false, message: t('lwe.uninstallFailed', { error: (err as Error).message }) }
    }
    resetLweDetection()
    return { ok: true, message: t('lwe.uninstalled') }
  }

  const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'

  const manifest = readLweManifest()
  let filesToRemove: string[]
  let dirsToPrune: string[] = []

  if (manifest) {
    filesToRemove = [...manifest.files, manifest.symlink]
    // deepest first, so a dir only prunes once its own contents are gone
    dirsToPrune = [...new Set(manifest.files.map(f => path.dirname(f)))].sort((a, b) => b.length - a.length)
  } else {
    const binaryPath = status.path
    let realPath: string
    try {
      realPath = fs.realpathSync(binaryPath)
    } catch {
      realPath = binaryPath
    }

    filesToRemove = [realPath]
    if (realPath !== binaryPath) filesToRemove.push(binaryPath)

    const binDir = path.dirname(realPath)
    const libDir = path.join(binDir, 'lib')
    if (fs.existsSync(libDir)) {
      try {
        const entries = fs.readdirSync(libDir)
        if (entries.some(e => e.includes('cef') || e.includes('wallpaper'))) {
          filesToRemove.push(libDir)
        }
      } catch { }
    }
  }

  try {
    const script = dirsToPrune.length > 0
      ? `rm -f ${quotedPaths(filesToRemove)}; rmdir --ignore-fail-on-non-empty -p ${quotedPaths(dirsToPrune)} 2>/dev/null; ldconfig`
      : `rm -f ${quotedPaths(filesToRemove)}; ldconfig`
    await execFileAsync(elevate, ['bash', '-c', script], {
      timeout: 60_000,
      encoding: 'utf8'
    })

    try { fs.rmSync(getLweManifestPath(), { force: true }) } catch { }

    resetLweDetection()

    return { ok: true, message: t('lwe.uninstalled') }
  } catch (err) {
    return { ok: false, message: t('lwe.uninstallFailed', { error: (err as Error).message }) }
  }
}

function findWeAssetsDir(): string | undefined {
  const workshopPath = getWorkshopPath()
  // .../steamapps/workshop/content/431960 -> .../steamapps/common/wallpaper_engine/assets
  const steamappsIdx = workshopPath.lastIndexOf(path.join('steamapps', 'workshop'))
  if (steamappsIdx !== -1) {
    const steamappsRoot = workshopPath.substring(0, steamappsIdx + 'steamapps'.length)
    const assetsDir = path.join(steamappsRoot, 'common', 'wallpaper_engine', 'assets')
    if (fs.existsSync(assetsDir)) return assetsDir
  }

  return getSteamRoots()
    .map(root => path.join(root, 'steamapps', 'common', 'wallpaper_engine', 'assets'))
    .find(p => fs.existsSync(p))
}

function getLweLibDir(): string {
  const p = findLweBinary()
  if (!p) return '/usr/local'
  try {
    const resolved = fs.realpathSync(p)
    return path.dirname(resolved)
  } catch {
    return path.dirname(p)
  }
}

function getLweLdLibraryPath(): string {
  const binDir = getLweLibDir()
  const candidates = [
    // local builds keep their .so files next to the binary
    binDir,
    path.join(binDir, 'lib64'),
    path.join(binDir, 'lib'),
    '/usr/local/lib64',
    '/usr/local/lib'
  ]
  const paths = candidates.filter(p => {
    try { return fs.statSync(p).isDirectory() } catch { return false }
  })
  const existing = process.env.LD_LIBRARY_PATH
  if (existing) paths.push(existing)
  return paths.join(':')
}

function getLweBinaryPath(): string {
  const p = findLweBinary()
  if (!p) return LWE_BINARY
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

export function buildLweEnvVars(): string[] {
  const vars: string[] = []
  // a Nix build brings its own libraries
  const fromNix = getLweBinaryPath().startsWith('/nix/store/')

  if (fromNix) vars.push('-u', 'LD_LIBRARY_PATH', '-u', 'LD_PRELOAD')
  else vars.push(`LD_LIBRARY_PATH=${getLweLdLibraryPath()}`)

  // CEF's bundled libEGL.so next to the binary would shadow Mesa's and break Wayland
  const systemEgl = ['/lib64/libEGL.so.1', '/usr/lib64/libEGL.so.1', '/usr/lib/x86_64-linux-gnu/libEGL.so.1',
    '/usr/lib/libEGL.so.1']
    .find(p => fs.existsSync(p))
  if (systemEgl && !fromNix) vars.push(`LD_PRELOAD=${systemEgl}`)

  const waylandDisplay = getWaylandDisplay()
  if (waylandDisplay) vars.push(`WAYLAND_DISPLAY=${waylandDisplay}`)

  // picks X11/Wayland by this, often unset without a login manager
  const sessionType = process.env.XDG_SESSION_TYPE || (waylandDisplay ? 'wayland' : undefined)
  if (sessionType) vars.push(`XDG_SESSION_TYPE=${sessionType}`)

  for (const name of ['XDG_CURRENT_DESKTOP', 'HYPRLAND_INSTANCE_SIGNATURE', 'SWAYSOCK', 'NIRI_SOCKET']) {
    const value = process.env[name]
    if (value) vars.push(`${name}=${value}`)
  }

  if (process.env.DISPLAY) vars.push(`DISPLAY=${process.env.DISPLAY}`)

  vars.push(`XDG_RUNTIME_DIR=${getXdgRuntimeDir()}`)

  if (diagnosticStats) vars.push('LWE_FRAME_STATS=1')

  if (getScriptLimits()) vars.push('LWE_SCRIPT_TIMEOUT_MS=5000', 'LWE_SCRIPT_HEAP_MB=512', 'LWE_SCRIPT_BUFFER_MB=512')

  const loader = getLoader()
  if (!loader.textures) vars.push('LWE_NO_TEXTURE_PREFETCH=1')
  if (!loader.shaders) vars.push('LWE_NO_SHADER_WARM=1')
  if (loader.threads > 0) vars.push(`LWE_PREFETCH_THREADS=${loader.threads}`)

  return vars
}

function supportsObjectFlags(): boolean {
  return supportsFlag('--list-objects')
}

function supportsAudioSensitivity(): boolean {
  return supportsFlag('--list-audio-objects')
}

function supportsSoundVolume(): boolean {
  return supportsFlag('--sound-volume')
}

function supportsEffectFlags(): boolean {
  return supportsFlag('--list-effects')
}

function supportsDisableAnimations(): boolean {
  return supportsFlag('--disable-animations')
}

function supportsExpandCanvas(): boolean {
  return supportsFlag('--expand-canvas')
}

// shell-like: quotes anywhere in a token group whitespace and are dropped
export function parseCustomArgs(raw: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inToken = false
  let quote: string | null = null

  for (const ch of raw) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      inToken = true
    } else if (/\s/.test(ch)) {
      if (inToken) tokens.push(current)
      current = ''
      inToken = false
    } else {
      current += ch
      inToken = true
    }
  }
  if (inToken) tokens.push(current)
  return tokens
}

let helpText: string | null = null
let helpTextStamp = ''

function invalidateHelpText(): void {
  helpText = null
}

// cached --help is tied to the file, the binary can be replaced
function binaryStamp(binaryPath: string): string {
  try {
    const stat = fs.statSync(binaryPath)
    return `${binaryPath}:${stat.ino}:${stat.size}:${stat.mtimeMs}`
  } catch {
    return binaryPath
  }
}

// older builds ignore unknown flags, so unlisted ones are left out
function supportsFlag(flag: string): boolean {
  const binaryPath = getLweBinaryPath()
  const stamp = binaryStamp(binaryPath)
  if (helpText === null || stamp !== helpTextStamp) {
    helpTextStamp = stamp
    try {
      helpText = execFileSync('env', [...buildLweEnvVars(), binaryPath, '--help'], {
        timeout: 5_000,
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024
      })
    } catch {
      helpText = ''
    }
  }
  return helpText.includes(flag)
}

export function supportsSplitScreens(): boolean {
  return supportsFlag('--screen-slot')
}

/** One wallpaper of a split screen with its own display settings */
export interface LweSplitSlot {
  path: string
  scalingMode?: string
  zoom?: number
  offsetX?: number
  offsetY?: number
  cornerColor?: string
  imageAdjustments?: ImageAdjustments
}

export interface LweLaunchOptions {
  /** '*' = one engine for every screen */
  screen?: ScreenTarget
  /** --screen-slot on options.screen, display options become per slot */
  split?: { layout: SplitLayout; slots: LweSplitSlot[] }
  fps?: number
  volume?: number
  disabledObjects?: string[]
  enabledObjects?: string[]
  disabledEffects?: string[]
  enabledEffects?: string[]
  propertyOverrides?: Record<string, string>
  xrayMode?: XrayMode
  scalingMode?: string
  zoom?: number
  offsetX?: number
  offsetY?: number
  disableParallax?: boolean
  expandCanvas?: boolean
  repairAssets?: boolean
  cornerColor?: string
  imageAdjustments?: ImageAdjustments
  speed?: number
  videoSegments?: VideoSegment[]
  audioSensitivity?: Record<string, number>
  soundVolume?: Record<string, number>
  customArgs?: string
  engineFlags?: EngineFlags
  forceFresh?: boolean
}

const FALLBACK_WINDOW = '0x0x1920x1080'

function windowedGeometry(screen?: ScreenTarget): string {
  return getScreenGeometry(screen && screen !== ALL_SCREENS ? screen : undefined) ?? FALLBACK_WINDOW
}

export function getActiveScreens(): string[] {
  const all = getConnectedScreens()
  const off = new Set([...getDisabledScreens(), ...getMirroredScreens()])
  const active = all.filter((s) => !off.has(s))
  return active.length > 0 ? active : all
}

export function buildLweArgs(
  wallpaperPath: string,
  options: LweLaunchOptions,
  capture?: { window: string; screenshotPath: string; delayFrames: number }
): string[] {
  const args: string[] = []
  const assetsDir = findWeAssetsDir()
  if (assetsDir) args.push('--assets-dir', assetsDir)

  // before any --screen-root, so they apply to every screen
  if (supportsFlag('--image-filter')) args.push(...imageAdjustmentArgs(options.imageAdjustments))

  const wantsWindow = !!(options.engineFlags?.windowed || options.engineFlags?.windowBackground)
  const windowGeometry = capture ? capture.window : wantsWindow ? windowedGeometry(options.screen) : null
  if (windowGeometry) {
    args.push('--window', windowGeometry)
    // without it the engine's window is a normal one on top of everything
    if (!capture && options.engineFlags?.windowBackground && supportsFlag('--window-background')) {
      args.push('--window-background')
    } else if (!capture && supportsFlag('--window-normal')) {
      // otherwise the window has no frame and stays above every other window
      args.push('--window-normal')
    }
  } else if (options.split && options.screen && options.screen !== ALL_SCREENS) {
    // every option after a --screen-slot belongs to that slot
    for (const slot of options.split.slots) {
      args.push('--screen-slot', options.screen, '--bg', slot.path)
      if (slot.scalingMode) args.push('--scaling', slot.scalingMode)
      if (slot.zoom !== undefined) args.push('--zoom', String(slot.zoom))
      if (slot.offsetX !== undefined || slot.offsetY !== undefined) {
        args.push('--offset', `${slot.offsetX ?? 0},${slot.offsetY ?? 0}`)
      }
      if (slot.cornerColor) args.push('--corner-color', slot.cornerColor)
      if (supportsFlag('--image-filter')) args.push(...imageAdjustmentArgs(slot.imageAdjustments))
    }
    args.push('--split-layout', options.split.layout)
  } else if (options.screen && options.screen !== ALL_SCREENS) {
    args.push('--screen-root', options.screen)
  } else {
    for (const s of getActiveScreens()) args.push('--screen-root', s)
  }

  if (options.fps) args.push('--fps', String(options.fps))
  if (options.volume !== undefined) args.push('--volume', String(options.volume))
  const audioScreen = getAudioScreen()
  if (audioScreen) args.push('--audio-screen', audioScreen)
  const ambientVolume = getAmbientVolume()
  if (ambientVolume !== null) args.push('--ambient-volume', String(ambientVolume))
  const leds = getLeds()
  if (leds.enabled && supportsFlag('--leds-server')) {
    args.push('--leds-server', validLedServer(leds.server), '--leds-brightness', String(leds.brightness))
    if (!leds.boost) args.push('--leds-no-boost')
    if (leds.reduceFps) args.push('--leds-reduce-fps')
  }
  if (getDisablePuppetAnimation()) args.push('--render-debug', 'no-puppet-animation')
  const flags = options.engineFlags ?? {}
  if (flags.disableAnimations && supportsDisableAnimations()) args.push('--disable-animations')
  args.push(...filterSupportedArgs(engineFlagArgs(flags), supportsFlag))
  if (options.scalingMode) args.push('--scaling', options.scalingMode)
  if (options.zoom !== undefined) args.push('--zoom', String(options.zoom))
  if (options.offsetX !== undefined || options.offsetY !== undefined) {
    args.push('--offset', `${options.offsetX ?? 0},${options.offsetY ?? 0}`)
  }
  if (options.disableParallax) args.push('--disable-parallax')
  if (options.expandCanvas && supportsExpandCanvas()) args.push('--expand-canvas')
  if (options.repairAssets && supportsFlag('--repair-assets')) args.push('--repair-assets')
  if (options.cornerColor) args.push('--corner-color', options.cornerColor)
  if (options.speed !== undefined) args.push('--speed', String(options.speed))
  const segments = options.videoSegments ?? []
  if (segments.length > 0 && supportsFlag('--video-segments')) {
    args.push('--video-segments', formatVideoSegments(segments))
  } else if (segments.length === 1 && supportsFlag('--video-start')) {
    // fallback for engines without --video-segments
    args.push('--video-start', String(segments[0].start))
    if (segments[0].end !== undefined) args.push('--video-end', String(segments[0].end))
  }
  if ((options.disabledObjects?.length || options.enabledObjects?.length) && supportsObjectFlags()) {
    for (const id of options.disabledObjects ?? []) args.push('--disable-object', id)
    for (const id of options.enabledObjects ?? []) args.push('--enable-object', id)
  }
  if ((options.disabledEffects?.length || options.enabledEffects?.length) && supportsEffectFlags()) {
    for (const id of options.disabledEffects ?? []) args.push('--disable-effect', id)
    for (const id of options.enabledEffects ?? []) args.push('--enable-effect', id)
  }
  for (const [name, value] of Object.entries(options.propertyOverrides ?? {})) {
    args.push('--set-property', `${name}=${value}`)
  }
  if (supportsAudioSensitivity()) {
    // the engine prefers a specific id over "*", so both are always sent
    const defaultSensitivity = getDefaultAudioSensitivity()
    if (defaultSensitivity !== 1) args.push('--audio-sensitivity', `*=${defaultSensitivity}`)
    for (const [id, multiplier] of Object.entries(options.audioSensitivity ?? {})) {
      args.push('--audio-sensitivity', `${id}=${multiplier}`)
    }
  }
  if (supportsSoundVolume()) {
    for (const [id, volume] of Object.entries(options.soundVolume ?? {})) {
      args.push('--sound-volume', `${id}=${volume}`)
    }
  }
  if (options.customArgs?.trim()) {
    args.push(...parseCustomArgs(options.customArgs))
  }
  if (capture) {
    args.push('--screenshot', capture.screenshotPath, '--screenshot-delay', String(capture.delayFrames))
  }
  args.push(wallpaperPath)
  return args
}

function getControlFilePath(): string {
  return path.join(getXdgRuntimeDir(), 'lwe-control')
}

function screenFileSuffix(screen: ScreenTarget): string {
  return screen === ALL_SCREENS ? 'all' : screen.replace(/[^A-Za-z0-9._-]/g, '_')
}

/** One hotswap file per engine so engines can't read each other's */
function controlFileFor(screen: ScreenTarget): string {
  return path.join(getXdgRuntimeDir(), `lwe-control-${screenFileSuffix(screen)}`)
}

/** Mouse button state written by a desktop shell (--input-file) */
function inputFileFor(screen: ScreenTarget): string {
  return path.join(getXdgRuntimeDir(), `lwe-input-${screenFileSuffix(screen)}`)
}

function supportsInputFile(): boolean {
  return isWaylandSession() && supportsFlag('--input-file')
}

export function listInputFiles(screens: string[]): { screen: ScreenTarget; path: string }[] {
  if (!supportsInputFile()) return []
  return [ALL_SCREENS, ...screens].map((screen) => ({ screen, path: inputFileFor(screen) }))
}

/** Engines outlive the app, so they are recorded here and adopted after a restart */
function getInstancesFilePath(): string {
  return path.join(getXdgRuntimeDir(), 'lwe-instances.json')
}

function getLegacyPidFilePath(): string {
  return path.join(getXdgRuntimeDir(), 'lwe-pid')
}

interface LweInstance {
  screen: ScreenTarget
  pid: number
  /** null for a process adopted from a previous run */
  child: ChildProcess | null
  wallpaperPath: string
  launchKey: string
  /** wallpaperPath is only the first slot's */
  split: boolean
  startedAt: number
  swappedAt: number | null
  stopping: boolean
  log: string[]
  /** everything the engine printed since the launch, up to HISTORY_LINES_KEPT */
  history: string[]
  /** null: the engine reads the shared control file */
  controlFile: string | null
  /** Flatpak: the run whose sandbox the engine lives in, and its host pid */
  sandbox: string | null
  hostPid: number | null
}

export interface LweExitInfo {
  screen: ScreenTarget
  wallpaperPath: string
  split: boolean
  crashed: boolean
  phase: CrashPhase
  description: string
  log: string[]
}

const instances = new Map<ScreenTarget, LweInstance>()
let instancesLoaded = false
let adoptedPoll: ReturnType<typeof setInterval> | null = null
const exitListeners = new Set<(info: LweExitInfo) => void>()

const LOG_LINES_KEPT = 60
const HISTORY_LINES_KEPT = 5000
let diagnosticStats = false
let engineRenderer: string | undefined
// a crash this soon after a launch or hotswap is blamed on it
const CRASH_WINDOW_MS = 20_000
const CRASH_SIGNALS = new Set(['SIGSEGV', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGILL', 'SIGTRAP'])

const launchListeners = new Set<() => void>()

export function onLweLaunched(cb: () => void): () => void {
  launchListeners.add(cb)
  return () => launchListeners.delete(cb)
}

export function onLweExit(cb: (info: LweExitInfo) => void): () => void {
  exitListeners.add(cb)
  return () => exitListeners.delete(cb)
}

function persistInstances(): void {
  const entries = [...instances.values()].map((i) => ({
    screen: i.screen,
    pid: i.pid,
    wallpaperPath: i.wallpaperPath,
    launchKey: i.launchKey,
    split: i.split,
    startedAt: i.startedAt,
    controlFile: i.controlFile,
    sandbox: i.sandbox,
    hostPid: i.hostPid
  }))
  try {
    if (entries.length === 0) fs.rmSync(getInstancesFilePath(), { force: true })
    else fs.writeFileSync(getInstancesFilePath(), JSON.stringify(entries))
    fs.rmSync(getLegacyPidFilePath(), { force: true })
  } catch (err) {
    console.error('[LWE] Failed to write instances file:', err)
  }
}

/** Alive and still a linux-wallpaperengine process, not a recycled pid */
function isLweProcess(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }

  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    return isLweCommandLine(cmdline)
  } catch {
    // /proc unreadable, it is alive at least
    return true
  }
}

/** Engines of an earlier Flatpak run live in another pid namespace, only reachable through the host */
function inOtherSandbox(inst: Pick<LweInstance, 'sandbox'>): boolean {
  return isFlatpak() && inst.sandbox !== (flatpakInstanceId() ?? null)
}

const hostAliveCache = new Map<number, { alive: boolean; at: number }>()

// kept fresh by the adopted-engine poll so status queries rarely wait on flatpak-spawn
const HOST_ALIVE_TTL_MS = 5000

function rememberHostAlive(hostPid: number, cmdline: string | null | undefined): boolean {
  // undefined: the host couldn't be asked
  const alive = cmdline === undefined ? (hostAliveCache.get(hostPid)?.alive ?? true) : !!cmdline && isLweCommandLine(cmdline)
  hostAliveCache.set(hostPid, { alive, at: Date.now() })
  return alive
}

function isEngineAlive(inst: Pick<LweInstance, 'pid' | 'sandbox' | 'hostPid'>): boolean {
  if (!inOtherSandbox(inst)) return isLweProcess(inst.pid)
  if (inst.hostPid === null) return false
  const cached = hostAliveCache.get(inst.hostPid)
  if (cached) {
    // a stale answer is refreshed in the background instead of blocking the main process
    if (Date.now() - cached.at >= HOST_ALIVE_TTL_MS) void isEngineAliveAsync(inst)
    return cached.alive
  }
  return rememberHostAlive(inst.hostPid, hostProcessCommandLine(inst.hostPid))
}

async function isEngineAliveAsync(inst: Pick<LweInstance, 'pid' | 'sandbox' | 'hostPid'>): Promise<boolean> {
  if (!inOtherSandbox(inst)) return isLweProcess(inst.pid)
  if (inst.hostPid === null) return false
  return rememberHostAlive(inst.hostPid, await hostProcessCommandLineAsync(inst.hostPid))
}

function signalEngine(inst: Pick<LweInstance, 'pid' | 'sandbox' | 'hostPid'>, signal: NodeJS.Signals): void {
  if (!inOtherSandbox(inst)) {
    process.kill(inst.pid, signal)
    return
  }
  if (inst.hostPid === null) throw new Error('engine of an earlier Flatpak run without a known host pid')
  hostAliveCache.delete(inst.hostPid)
  killHostProcess(inst.hostPid, signal)
}

function adopt(
  screen: ScreenTarget,
  pid: number,
  wallpaperPath: string,
  key: string,
  split: boolean,
  startedAt: number,
  controlFile: string | null,
  sandbox: string | null,
  hostPid: number | null
): void {
  if (!Number.isInteger(pid) || !isEngineAlive({ pid, sandbox, hostPid })) return
  instances.set(screen, {
    screen,
    pid,
    child: null,
    wallpaperPath,
    launchKey: key,
    split,
    startedAt,
    swappedAt: null,
    stopping: false,
    log: [],
    history: [],
    controlFile,
    sandbox,
    hostPid
  })
}

interface InstanceEntry {
  screen: string
  pid: number
  wallpaperPath: string
  launchKey: string
  split?: boolean
  startedAt: number
  controlFile?: string | null
  sandbox?: string | null
  hostPid?: number | null
}

function readInstanceEntries(): InstanceEntry[] {
  try {
    return JSON.parse(fs.readFileSync(getInstancesFilePath(), 'utf8')) as InstanceEntry[]
  } catch {
    return []
  }
}

/** Asks the host about engines of an earlier Flatpak run before they are loaded, so loading doesn't block */
export async function checkEarlierRunEngines(): Promise<void> {
  if (instancesLoaded || !isFlatpak()) return
  await Promise.all(
    readInstanceEntries()
      .map((e) => ({ pid: e.pid, sandbox: e.sandbox ?? null, hostPid: e.hostPid ?? null }))
      .filter((e) => inOtherSandbox(e) && e.hostPid !== null)
      .map((e) => isEngineAliveAsync(e))
  )
}

function loadInstances(): void {
  if (instancesLoaded) return
  instancesLoaded = true

  try {
    for (const e of readInstanceEntries()) {
      adopt(e.screen, e.pid, e.wallpaperPath, e.launchKey, !!e.split, e.startedAt, e.controlFile ?? null, e.sandbox ?? null,
        e.hostPid ?? null)
    }
  } catch { /* written by an older version */ }

  try {
    const legacyPid = parseInt(fs.readFileSync(getLegacyPidFilePath(), 'utf8').trim(), 10)
    if (!instances.has(ALL_SCREENS)) adopt(ALL_SCREENS, legacyPid, '', '', false, Date.now(), null, null, null)
  } catch { /* no legacy pid file */ }

  persistInstances()
  watchAdoptedInstances()
}

// Node only reports exits of its own children, adopted ones are polled
function watchAdoptedInstances(): void {
  if (adoptedPoll) return
  let polling = false
  adoptedPoll = setInterval(async () => {
    if (polling) return
    polling = true
    let adopted = 0
    try {
      for (const inst of instances.values()) {
        if (inst.child) continue
        adopted++
        if (await isEngineAliveAsync(inst)) continue
        // replaced or stopped while the host was asked
        if (instances.get(inst.screen) !== inst) continue
        instances.delete(inst.screen)
        persistInstances()
        if (!inst.stopping) {
          // no exit status, a crash can't be told from a kill
          emitExit(inst, false, 'exited while the app was not watching it')
        }
      }
    } finally {
      polling = false
    }
    if (adopted === 0 && adoptedPoll) {
      clearInterval(adoptedPoll)
      adoptedPoll = null
    }
  }, 3000)
}

function crashPhase(inst: LweInstance): CrashPhase {
  const now = Date.now()
  if (inst.swappedAt !== null && now - inst.swappedAt < CRASH_WINDOW_MS) return 'hotswap'
  if (now - inst.startedAt < CRASH_WINDOW_MS) return 'launch'
  return 'runtime'
}

function emitExit(inst: LweInstance, crashed: boolean, description: string): void {
  const info: LweExitInfo = {
    screen: inst.screen,
    wallpaperPath: inst.wallpaperPath,
    split: inst.split,
    crashed,
    phase: crashPhase(inst),
    description,
    log: [...inst.log]
  }
  for (const cb of exitListeners) cb(info)
}

function liveInstance(screen: ScreenTarget): LweInstance | undefined {
  loadInstances()
  const inst = instances.get(screen)
  if (!inst) return undefined
  if (inst.child ? inst.child.exitCode === null && inst.child.signalCode === null : isEngineAlive(inst)) return inst
  instances.delete(screen)
  persistInstances()
  return undefined
}

function liveInstances(): LweInstance[] {
  loadInstances()
  return [...instances.keys()].map(liveInstance).filter((i): i is LweInstance => !!i)
}

export interface RunningInstance {
  screen: ScreenTarget
  wallpaperPath: string
  split: boolean
  pid: number
  startedAt: number
  swappedAt: number | null
}

export function getRunningInstances(): RunningInstance[] {
  return liveInstances().map(({ screen, wallpaperPath, split, pid, startedAt, swappedAt }) => ({
    screen,
    wallpaperPath,
    split,
    pid,
    startedAt,
    swappedAt
  }))
}

/** Engines started while this is on print per-frame timings (LWE_FRAME_STATS), which costs some speed */
export function setDiagnosticStats(on: boolean): void {
  diagnosticStats = on
}

/** The GL renderer the last engine reported, undefined before one did or for engines that don't say */
export function getEngineRenderer(): string | undefined {
  return engineRenderer
}

export interface EngineHistory {
  screen: ScreenTarget
  wallpaperPath: string
  pid: number
  startedAt: number
  lines: string[]
}

/** What the live engines printed since they started, adopted ones have no output */
export function getEngineHistory(): EngineHistory[] {
  return liveInstances().map(({ screen, wallpaperPath, pid, startedAt, history }) => ({
    screen,
    wallpaperPath,
    pid,
    startedAt,
    lines: [...history]
  }))
}

function supportsEffectHotswap(): boolean {
  return supportsFlag('effects=1')
}

function supportsAnimationHotswap(): boolean {
  return supportsFlag('disable-animations=on')
}

function supportsHwdecHotswap(): boolean {
  return supportsFlag('hwdec=<backend>')
}

function supportsHrtfHotswap(): boolean {
  return supportsFlag('hrtf=<mode>')
}

function supportsTransitionHotswap(): boolean {
  return supportsFlag('transition=<kind>')
}

function supportsPowerHotswap(): boolean {
  return supportsFlag('fps-battery=<fps|off>') && supportsFlag('idle-pause=<minutes>')
}

// what a hotswap can't change, a differing engine is restarted
function launchKey(options: LweLaunchOptions): string {
  const flags = options.engineFlags ?? {}
  return JSON.stringify({
    // a hotswap would put its wallpaper into every slot
    split: options.split ?? null,
    customArgs: options.customArgs?.trim() ?? '',
    disabledEffects: supportsEffectHotswap() ? [] : (options.disabledEffects ?? []),
    enabledEffects: supportsEffectHotswap() ? [] : (options.enabledEffects ?? []),
    disableAnimations: supportsAnimationHotswap() ? false : !!flags.disableAnimations,
    // read when the process starts, a hotswap can't change them
    scriptLimits: getScriptLimits(),
    loader: getLoader(),
    leds: getLeds(),
    disablePuppetAnimation: getDisablePuppetAnimation(),
    flags: engineFlagArgs({
      ...flags,
      ...(supportsHwdecHotswap() ? { hwdec: undefined } : {}),
      ...(supportsHrtfHotswap() ? { hrtf: undefined } : {}),
      ...(supportsTransitionHotswap() ? { transition: undefined, transitionDuration: undefined } : {}),
      ...(supportsPowerHotswap() ? { batteryFps: undefined, idlePause: undefined } : {})
    })
  })
}

export interface HotswapOptions extends HotswapSettings {
  path?: string
  fps?: number
  /** Either being present replaces the engine's effect lists */
  disabledEffects?: string[]
  enabledEffects?: string[]
  disableAnimations?: boolean
  hwdec?: HwdecBackend
  hrtf?: HrtfMode
  transition?: TransitionMode
  transitionDuration?: TransitionDuration
  batteryFps?: BatteryFps
  idlePause?: IdlePause
}

/** Object lists replace the engine's when present (even empty). Every property key is sent */
export function buildHotswapLines(options: HotswapOptions): string[] {
  const lines: string[] = []
  if (options.path !== undefined) lines.push(`path=${options.path}`)
  if (options.disabledObjects !== undefined || options.enabledObjects !== undefined) {
    lines.push('layers=1')
    for (const id of options.disabledObjects ?? []) lines.push(`disable-object=${id}`)
    for (const id of options.enabledObjects ?? []) lines.push(`enable-object=${id}`)
  }
  if (options.disabledEffects !== undefined || options.enabledEffects !== undefined) {
    lines.push('effects=1')
    for (const id of options.disabledEffects ?? []) lines.push(`disable-effect=${id}`)
    for (const id of options.enabledEffects ?? []) lines.push(`enable-effect=${id}`)
  }
  if (options.disableAnimations !== undefined) lines.push(`disable-animations=${options.disableAnimations ? 'on' : 'off'}`)
  if (options.hwdec !== undefined) lines.push(`hwdec=${options.hwdec}`)
  if (options.hrtf !== undefined) lines.push(`hrtf=${options.hrtf}`)
  if (options.transition !== undefined) lines.push(`transition=${options.transition}`)
  if (options.transitionDuration !== undefined) lines.push(`transition-duration=${options.transitionDuration}`)
  if (options.batteryFps !== undefined) lines.push(`fps-battery=${options.batteryFps}`)
  if (options.idlePause !== undefined) lines.push(`idle-pause=${options.idlePause}`)
  if (options.volume !== undefined) lines.push(`volume=${options.volume}`)
  if (options.fps !== undefined) lines.push(`fps=${options.fps}`)
  // on/off keeps engines without the disabled mode working
  if (options.xray !== undefined) {
    lines.push(`xray=${options.xray === 'full' ? 'on' : options.xray === 'normal' ? 'off' : options.xray}`)
  }
  if (options.scaling !== undefined) lines.push(`scaling=${options.scaling}`)
  if (options.zoom !== undefined) lines.push(`zoom=${options.zoom}`)
  if (options.offsetX !== undefined || options.offsetY !== undefined) {
    lines.push(`offset=${options.offsetX ?? 0},${options.offsetY ?? 0}`)
  }
  if (options.disableParallax !== undefined) lines.push(`disable-parallax=${options.disableParallax ? 'on' : 'off'}`)
  if (options.expandCanvas !== undefined) lines.push(`expand-canvas=${options.expandCanvas ? 'on' : 'off'}`)
  if (options.repairAssets !== undefined && supportsFlag('--repair-assets')) {
    lines.push(`repair-assets=${options.repairAssets ? 'on' : 'off'}`)
  }
  if (options.cornerColor !== undefined) lines.push(`corner-color=${options.cornerColor}`)
  lines.push(...imageAdjustmentLines(options.imageAdjustments))
  if (options.speed !== undefined) lines.push(`speed=${options.speed}`)
  if (options.videoSegments !== undefined) {
    lines.push(`video-segments=${options.videoSegments.length ? formatVideoSegments(options.videoSegments) : 'none'}`)
  }
  if (options.videoSeek !== undefined) lines.push(`video-seek=${options.videoSeek}`)
  if (options.audioScreen !== undefined) lines.push(`audio-screen=${options.audioScreen}`)
  if (options.ambientVolume !== undefined) lines.push(`ambient-volume=${options.ambientVolume}`)
  for (const [name, value] of Object.entries(options.propertyOverrides ?? {})) {
    lines.push(`property=${name}=${value}`)
  }
  for (const [id, multiplier] of Object.entries(options.audioSensitivity ?? {})) {
    lines.push(`audio-sensitivity=${id}=${multiplier}`)
  }
  for (const [id, volume] of Object.entries(options.soundVolume ?? {})) {
    lines.push(`sound-volume=${id}=${volume}`)
  }
  const whole = lines.filter((line) => !/[\r\n]/.test(line))
  if (whole.length !== lines.length) console.warn('[LWE] Left out control lines holding a line break')
  return whole
}

// engines sharing the control file must read a request before the next overwrites it
const HOTSWAP_SETTLE_MS = 1000
let lastSignal: { pid: number; at: number; file: string } | null = null
let signalQueue: Promise<unknown> = Promise.resolve()

function signalInstance(inst: LweInstance, lines: string[]): Promise<boolean> {
  const file = inst.controlFile ?? getControlFilePath()
  const send = async (): Promise<boolean> => {
    if (lastSignal && lastSignal.pid !== inst.pid && lastSignal.file === file) {
      const wait = lastSignal.at + HOTSWAP_SETTLE_MS - Date.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    }
    try {
      fs.writeFileSync(file, lines.join('\n') + '\n')
      signalEngine(inst, 'SIGUSR1')
      lastSignal = { pid: inst.pid, at: Date.now(), file }
      console.log(`[LWE] Hotswap sent to ${inst.screen}:`, lines.join(' '))
      return true
    } catch (err) {
      console.error('[LWE] Hotswap failed:', err)
      return false
    }
  }
  const result = signalQueue.then(send, send)
  signalQueue = result
  return result
}

/**
 * One change per call, engines hold a single pending request. Targets the screens, else engines showing
 * `wallpaperPath`, else all. xray has no launch flag, so it always goes here.
 */
export async function hotswapLweSettings(
  options: HotswapOptions,
  target: { screens?: ScreenTarget[]; wallpaperPath?: string } = {}
): Promise<boolean> {
  const lines = buildHotswapLines(options)
  if (lines.length === 0) return false

  let targets = liveInstances()
  if (target.screens) targets = targets.filter((i) => target.screens!.includes(i.screen))
  else if (target.wallpaperPath) targets = targets.filter((i) => i.wallpaperPath === target.wallpaperPath)
  if (targets.length === 0) return false

  let sent = false
  for (const inst of targets) {
    // a split screen's engine runs its first slot's wallpaper, settings for it go only there
    if (!(await signalInstance(inst, inst.split ? [`screen=${inst.screen}#1`, ...lines] : lines))) continue
    sent = true
    if (options.path !== undefined) {
      inst.wallpaperPath = options.path
      inst.swappedAt = Date.now()
    }
  }
  if (sent && options.path !== undefined) persistInstances()
  return sent
}

export function liveEngineFlagOptions(
  flags: EngineFlags
): Pick<HotswapOptions, 'hwdec' | 'hrtf' | 'transition' | 'transitionDuration' | 'batteryFps' | 'idlePause'> {
  return {
    ...(supportsHwdecHotswap() ? { hwdec: flags.hwdec ?? 'auto' } : {}),
    ...(supportsHrtfHotswap() ? { hrtf: flags.hrtf ?? 'auto' } : {}),
    ...(supportsTransitionHotswap()
      ? { transition: flags.transition ?? 'none', transitionDuration: flags.transitionDuration ?? '600' }
      : {}),
    ...(supportsPowerHotswap() ? { batteryFps: flags.batteryFps ?? 'off', idlePause: flags.idlePause ?? 'off' } : {})
  }
}

function hotswapOptionsFor(wallpaperPath: string, options: LweLaunchOptions): HotswapOptions {
  const defaultSensitivity = getDefaultAudioSensitivity()
  return {
    path: wallpaperPath,
    // a path swap drops the previous wallpaper's overrides
    disabledObjects: options.disabledObjects ?? [],
    enabledObjects: options.enabledObjects ?? [],
    fps: options.fps ?? DEFAULT_LWE_FPS,
    xray: options.xrayMode,
    scaling: options.scalingMode ?? 'default',
    zoom: options.zoom ?? 1,
    offsetX: options.offsetX ?? 0,
    offsetY: options.offsetY ?? 0,
    disableParallax: options.disableParallax ?? false,
    expandCanvas: options.expandCanvas ?? false,
    repairAssets: options.repairAssets ?? false,
    cornerColor: options.cornerColor ?? '000000',
    imageAdjustments: options.imageAdjustments,
    speed: options.speed ?? 1,
    // a path swap drops the trim
    videoSegments: options.videoSegments?.length ? options.videoSegments : undefined,
    propertyOverrides: options.propertyOverrides ?? {},
    audioSensitivity: {
      ...(defaultSensitivity !== 1 ? { '*': defaultSensitivity } : {}),
      ...options.audioSensitivity
    },
    soundVolume: options.soundVolume ?? {},
    ...(supportsEffectHotswap()
      ? { disabledEffects: options.disabledEffects ?? [], enabledEffects: options.enabledEffects ?? [] }
      : {}),
    ...(supportsAnimationHotswap() ? { disableAnimations: !!options.engineFlags?.disableAnimations } : {}),
    ...liveEngineFlagOptions(options.engineFlags ?? {})
  }
}

/** Hotswaps the engine on the screen when possible, else restarts it. Resolves once it survived 2s */
export async function launchLweAsync(wallpaperPath: string, options: LweLaunchOptions = {}): Promise<void> {
  const screen = options.screen ?? ALL_SCREENS
  const key = launchKey(options)

  // an all-screens engine and per-screen ones would overlap
  for (const inst of liveInstances()) {
    if ((screen === ALL_SCREENS) !== (inst.screen === ALL_SCREENS)) await stopLwe(inst.screen)
  }

  const existing = liveInstance(screen)
  const canHotswap =
    existing &&
    !options.forceFresh &&
    !options.customArgs?.trim() &&
    existing.launchKey === key &&
    (existing.controlFile !== null || liveInstances().length === 1)

  if (canHotswap && (await hotswapLweSettings(hotswapOptionsFor(wallpaperPath, options), { screens: [screen] }))) {
    return
  }

  await stopLwe(screen)

  const binaryPath = getLweBinaryPath()
  const controlFile = supportsFlag('--control-file') ? controlFileFor(screen) : null
  const inputFile = supportsInputFile() ? inputFileFor(screen) : null
  const lweArgs = [
    ...(controlFile ? ['--control-file', controlFile] : []),
    ...(inputFile ? ['--input-file', inputFile] : []),
    ...buildLweArgs(wallpaperPath, options)
  ]
  const envVars = buildLweEnvVars()

  // spawn's env option can lose vars with detached
  const spawnArgs = [...envVars, binaryPath, ...lweArgs]
  console.log('[LWE] Binary:', binaryPath)
  console.log('[LWE] Args:', lweArgs.join(' '))
  console.log('[LWE] Env:', envVars.join(' '))
  return new Promise((resolve, reject) => {
    const child = spawn('env', spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    })

    const inst: LweInstance = {
      screen,
      pid: child.pid ?? -1,
      child,
      wallpaperPath,
      launchKey: key,
      split: !!options.split,
      startedAt: Date.now(),
      swappedAt: null,
      stopping: false,
      log: [],
      history: [],
      controlFile,
      sandbox: flatpakInstanceId() ?? null,
      hostPid: null
    }
    if (child.pid !== undefined) {
      instances.set(screen, inst)
      persistInstances()
      if (isFlatpak()) {
        void hostPidOf(child.pid).then((hostPid) => {
          if (hostPid === undefined || instances.get(screen) !== inst) return
          inst.hostPid = hostPid
          persistInstances()
        })
      }
    }

    const collect = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
      const msg = chunk.toString('utf8').trim()
      if (!msg) return
      console.log(`[LWE ${stream}]`, msg)
      inst.log.push(...msg.split('\n'))
      if (inst.log.length > LOG_LINES_KEPT) inst.log.splice(0, inst.log.length - LOG_LINES_KEPT)
      const renderer = /OpenGL renderer: (.+)/.exec(msg)
      if (renderer) engineRenderer = renderer[1]
      inst.history.push(...msg.split('\n'))
      if (inst.history.length > HISTORY_LINES_KEPT) inst.history.splice(0, inst.history.length - HISTORY_LINES_KEPT)
    }
    child.stdout?.on('data', collect('stdout'))
    child.stderr?.on('data', collect('stderr'))

    let settled = false

    child.on('exit', (code, signal) => {
      // the old process's exit can arrive after its replacement registered
      const current = instances.get(screen) === inst
      if (current) {
        instances.delete(screen)
        persistInstances()
      }

      const crashed = (signal !== null && CRASH_SIGNALS.has(signal)) || (code !== null && code !== 0)
      const description = signal ? `killed by ${signal}` : `exit code ${code}`

      if (!settled) {
        settled = true
        if (crashed) {
          const msg = inst.log.length ? inst.log.slice(-3).join('\n') : description
          reject(new Error(`linux-wallpaperengine failed: ${msg}`))
        } else {
          resolve()
        }
      }

      if (current && !inst.stopping) emitExit(inst, crashed, description)
    })

    child.on('error', (err) => {
      if (instances.get(screen) === inst) {
        instances.delete(screen)
        persistInstances()
      }
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    child.unref()

    setTimeout(() => {
      if (!settled && instances.get(screen) === inst && child.exitCode === null) {
        settled = true
        for (const cb of launchListeners) cb()
        if (options.xrayMode && options.xrayMode !== 'normal') {
          void hotswapLweSettings({ xray: options.xrayMode }, { screens: [screen] })
        }
        resolve()
      }
    }, 2000)
  })
}

// "  123 - Layer Name (image)"
const OBJECT_LINE_RE = /^\s*(\S+)\s-\s(.*)\s\((image|particle|text|sound|unknown)\)\s*$/

function parseLweObjectList(output: string): LweSceneObject[] {
  const objects: LweSceneObject[] = []
  for (const line of output.split('\n')) {
    const m = line.match(OBJECT_LINE_RE)
    if (m) objects.push({ id: m[1], name: m[2], type: m[3] as LweSceneObject['type'] })
  }
  return objects
}

async function runLweList<T>(
  wallpaperPath: string,
  flag: string,
  supported: (() => boolean) | null,
  parse: (output: string) => T[],
  label: string
): Promise<T[]> {
  const status = getLweStatus()
  if (!status.installed) throw new Error('linux-wallpaperengine is not installed.')
  // older builds ignore unknown flags and render instead of exiting
  if (supported && !supported()) return []

  const args = [flag]
  const assetsDir = findWeAssetsDir()
  if (assetsDir) args.push('--assets-dir', assetsDir)
  args.push(wallpaperPath)

  try {
    const { stdout } = await execFileAsync('env', [...buildLweEnvVars(), getLweBinaryPath(), ...args], {
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8'
    })
    return parse(stdout)
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string }
    const msg = (e.stderr || e.stdout || e.message || String(err)).trim().split('\n').slice(0, 3).join('\n')
    throw new Error(`Failed to list ${label}: ${msg}`, { cause: err })
  }
}

export function listLweObjects(wallpaperPath: string): Promise<LweSceneObject[]> {
  return runLweList(wallpaperPath, '--list-objects', () => supportsObjectFlags(), parseLweObjectList, 'wallpaper objects')
}

export async function listLweFonts(wallpaperPath: string): Promise<LweFontNeed[]> {
  const status = getLweStatus()
  if (!status.installed) return []
  // older builds ignore unknown flags and render the wallpaper instead of exiting
  if (!supportsFlag('--list-fonts')) return []

  const args = ['--list-fonts']
  const assetsDir = findWeAssetsDir()
  if (assetsDir) args.push('--assets-dir', assetsDir)
  args.push(wallpaperPath)

  const { stdout } = await execFileAsync('env', [...buildLweEnvVars(), getLweBinaryPath(), ...args], {
    timeout: 15_000,
    maxBuffer: 5 * 1024 * 1024,
    encoding: 'utf8'
  })
  return parseLweFontList(stdout)
}

// `  42 - Bloom (object=17 objectName="body" group="Lighting")`
const EFFECT_LINE_RE = /^\s*(\S+)\s-\s(.*)\s\(object=(\S+)\sobjectName="(.*)"\sgroup="(.*)"\)\s*$/

function parseLweEffectList(output: string): LweSceneEffect[] {
  const effects: LweSceneEffect[] = []
  for (const line of output.split('\n')) {
    const m = line.match(EFFECT_LINE_RE)
    if (m) effects.push({ id: m[1], name: m[2], objectId: m[3], objectName: m[4], group: m[5] })
  }
  return effects
}

export function listLweEffects(wallpaperPath: string): Promise<LweSceneEffect[]> {
  return runLweList(wallpaperPath, '--list-effects', () => supportsEffectFlags(), parseLweEffectList, 'wallpaper effects')
}

// "  24 - transbig (scale): minvalue=0.9 maxvalue=1.1 frequency=0 smoothing=10"
const AUDIO_OBJECT_LINE_RE =
  /^\s*(\S+)\s-\s(.*)\s\((.+)\):\sminvalue=(\S+)\smaxvalue=(\S+)\sfrequency=(\S+)\ssmoothing=(\S+)\s*$/

function parseLweAudioObjectList(output: string): LweAudioObject[] {
  const objects: LweAudioObject[] = []
  for (const line of output.split('\n')) {
    const m = line.match(AUDIO_OBJECT_LINE_RE)
    if (m) {
      objects.push({
        objectId: m[1],
        objectName: m[2],
        property: m[3],
        minvalue: parseFloat(m[4]),
        maxvalue: parseFloat(m[5]),
        frequency: parseFloat(m[6]),
        smoothing: parseFloat(m[7])
      })
    }
  }
  return objects
}

export function listLweAudioObjects(wallpaperPath: string): Promise<LweAudioObject[]> {
  return runLweList(wallpaperPath, '--list-audio-objects', () => supportsAudioSensitivity(), parseLweAudioObjectList, 'audio-reactive objects')
}

// --list-properties output:
//   clock_font - combo
//   	Text: ui_clock_font
//   	Value: impact
//   Values:
//   		segoe ui = ui_clock_font_4
// combo values can contain spaces, split only on " = "

const PROPERTY_HEADER_RE =
  /^(\S+) - (slider|boolean|color|combo|text|scene texture|file|textinput|usershortcut)$/
const PROPERTY_DETAIL_RE = /^\t(Text|Value|Min|Max|Step): (.*)$/
const PROPERTY_COMBO_OPTION_RE = /^\t\t(.+?) = (.*)$/

function parseLweProperties(output: string): LweProperty[] {
  const properties: LweProperty[] = []
  let current: LweProperty | null = null

  for (const line of output.split('\n')) {
    const header = line.match(PROPERTY_HEADER_RE)
    if (header) {
      if (current) properties.push(current)
      const type = header[2] === 'scene texture' ? 'scene-texture' : (header[2] as LweProperty['type'])
      current = { name: header[1], type, value: '' }
      continue
    }
    if (!current) continue

    const comboOption = line.match(PROPERTY_COMBO_OPTION_RE)
    if (comboOption) {
      current.options ??= []
      current.options.push({ value: comboOption[1], label: comboOption[2] })
      continue
    }

    const detail = line.match(PROPERTY_DETAIL_RE)
    if (detail) {
      const [, key, value] = detail
      if (key === 'Text') current.text = value
      else if (key === 'Value') current.value = value
      else if (key === 'Min') current.min = parseFloat(value)
      else if (key === 'Max') current.max = parseFloat(value)
      else if (key === 'Step') current.step = parseFloat(value)
    }
  }
  if (current) properties.push(current)
  return properties
}

export function listLweProperties(wallpaperPath: string): Promise<LweProperty[]> {
  return runLweList(wallpaperPath, '--list-properties', null, parseLweProperties, 'wallpaper properties')
}

type EngineProcess = Pick<LweInstance, 'pid' | 'sandbox' | 'hostPid'>

/** Node has no waitpid() for a process it didn't spawn */
async function pollUntilGone(target: EngineProcess, timeoutMs: number): Promise<boolean> {
  const other = inOtherSandbox(target)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (other) {
      if (!(await isEngineAliveAsync(target))) return true
    } else {
      try {
        process.kill(target.pid, 0)
      } catch {
        return true
      }
    }
    // every check of another sandbox's engine is a flatpak-spawn round trip
    await new Promise((resolve) => setTimeout(resolve, other ? 100 : 25))
  }
  return false
}

/** SIGKILL after the grace period; a replacement would race it for the audio device */
async function waitForExit(target: EngineProcess, timeoutMs = 2000): Promise<void> {
  if (await pollUntilGone(target, timeoutMs)) return

  try {
    signalEngine(target, 'SIGKILL')
  } catch { }
  await pollUntilGone(target, 500)
}

/** One screen's engine, or every engine this app started */
export async function stopLwe(screen?: ScreenTarget): Promise<void> {
  loadInstances()
  const targets = screen === undefined ? [...instances.values()] : [instances.get(screen)].filter((i) => !!i)

  await Promise.all(
    targets.map(async (inst) => {
      inst.stopping = true
      try {
        signalEngine(inst, 'SIGTERM')
      } catch { }
      await waitForExit(inst)
      if (inst.controlFile) fs.rmSync(inst.controlFile, { force: true })
      fs.rmSync(inputFileFor(inst.screen), { force: true })
      if (instances.get(inst.screen) === inst) instances.delete(inst.screen)
    })
  )
  persistInstances()
}

export function isLweRunning(screen?: ScreenTarget): boolean {
  return screen === undefined ? liveInstances().length > 0 : !!liveInstance(screen)
}

/** Including engines this app isn't tracking */
export async function killAllLweProcesses(): Promise<{ ok: boolean; message: string }> {
  loadInstances()
  for (const inst of instances.values()) inst.stopping = true
  instances.clear()
  persistInstances()

  // by the program's own name, not by the name showing up anywhere in a command line (an editor on the repo folder,
  // git, make): the pattern is anchored, so flatpak-spawn's own command line doesn't match either
  const [file, args] = hostCommand('pkill', ['-9', '-f', '-c', LWE_PROCESS_PATTERN])
  try {
    const { stdout } = await execFileAsync(file, args)
    const count = parseInt(stdout.trim(), 10) || 0
    return { ok: true, message: t('lwe.killed', { count }) }
  } catch (err) {
    const code = (err as { code?: number }).code
    // exit 1 = nothing matched
    if (code === 1) {
      return { ok: true, message: t('lwe.noProcesses') }
    }
    return { ok: false, message: t('lwe.killFailed', { error: (err as Error).message }) }
  }
}

const SCREENSHOT_TIMEOUT_MS = 45_000

export async function captureLweScreenshot(
  wallpaperPath: string,
  options: LweLaunchOptions,
  outPath: string,
  size = { width: 1280, height: 720 }
): Promise<void> {
  if (!getLweStatus().installed) throw new Error('linux-wallpaperengine is not installed.')
  fs.rmSync(outPath, { force: true })

  const args = buildLweArgs(
    wallpaperPath,
    {
      ...options,
      fps: 60,
      volume: 0,
      engineFlags: { ...options.engineFlags, silent: true, fullscreenPause: 'off', pauseOnFocus: false, pauseOnMaximized: false, disableMouse: true }
    },
    { window: `0x0x${size.width}x${size.height}`, screenshotPath: outPath, delayFrames: 120 }
  )
  // the window is X11, without an X server render offscreen
  const headless = process.env.DISPLAY ? [] : ['XDG_SESSION_TYPE=headless']
  const child = spawn('env', [...buildLweEnvVars(), ...headless, getLweBinaryPath(), ...args], {
    stdio: ['ignore', 'ignore', 'pipe']
  })
  const stderr: string[] = []
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString('utf8'))
  })

  try {
    const deadline = Date.now() + SCREENSHOT_TIMEOUT_MS
    let lastSize = -1
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      if (child.exitCode !== null || child.signalCode !== null) {
        const msg = stderr.join('').trim().split('\n').slice(-3).join('\n')
        throw new Error(`linux-wallpaperengine exited before taking the screenshot${msg ? `: ${msg}` : ''}`)
      }
      // done once the size held still for a poll

      const current = fs.existsSync(outPath) ? fs.statSync(outPath).size : -1
      if (current > 0 && current === lastSize) return
      lastSize = current
    }
    throw new Error('Timed out waiting for the screenshot')
  } finally {
    child.kill('SIGTERM')
    if (child.pid !== undefined) await waitForExit({ pid: child.pid, sandbox: flatpakInstanceId() ?? null, hostPid: null }, 3000)
  }
}
