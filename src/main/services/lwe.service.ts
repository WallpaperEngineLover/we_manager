import { execFile, execFileSync, spawn, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  LweStatus,
  LweInstallProgress,
  LinuxDistro,
  LweSceneObject,
  LweProperty,
  LweAudioObject,
  LweSceneEffect
} from '@shared/types'
import {
  isCommandAvailable,
  invalidateCommandCache,
  whichCommand,
  getConnectedScreens,
  getWaylandDisplay,
  getXdgRuntimeDir
} from '../utils/platform'
import { getWorkshopPath, getLweManifestPath } from '../utils/paths'
import {
  getLweRepoUrl,
  getLweRepoBranch,
  getLweCmakeArgs,
  getAudioScreen,
  getAmbientVolume,
  getDefaultAudioSensitivity,
  getDisablePuppetAnimation,
  getDisableAnimations
} from './config.service'
import { DEFAULT_LWE_REPO } from '@shared/constants'

const execFileAsync = promisify(execFile)

/**
 * Env for spawning the engine's own cmake/make, stripped of AppImage runtime vars. When
 * we_manager itself runs as an AppImage, AppRun sets LD_LIBRARY_PATH (and friends) to point into
 * its own ephemeral /tmp/.mount_XXXXXXX mount so its bundled Electron libs resolve - inheriting
 * that into the engine's build lets CMake's library search pick up we_manager's own bundled
 * libEGL.so etc. and cache that dead path in CMakeCache.txt once the mount is gone.
 */
function buildCleanBuildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of ['LD_LIBRARY_PATH', 'LD_PRELOAD', 'APPDIR', 'APPIMAGE', 'OWD', 'ARGV0']) {
    delete env[key]
  }
  return env
}

const LWE_BINARY = 'linux-wallpaperengine'
const BUILD_DIR = path.join(os.tmpdir(), 'lwe-build')

/** Common install locations checked before falling back to $PATH. */
const LWE_SEARCH_PATHS = [
  // local fork builds take precedence over system installs
  path.join(os.homedir(), 'projects', 'private', 'linux-wallpaperengine', 'build', 'output', 'linux-wallpaperengine'),
  path.join(os.homedir(), 'projects', 'linux-wallpaperengine', 'build', 'output', 'linux-wallpaperengine'),
  '/usr/local/bin/linux-wallpaperengine',
  '/usr/local/linux-wallpaperengine',
  '/usr/bin/linux-wallpaperengine',
  path.join(os.homedir(), '.local', 'bin', 'linux-wallpaperengine'),
  path.join(os.homedir(), 'bin', 'linux-wallpaperengine'),
  '/opt/linux-wallpaperengine/linux-wallpaperengine'
]

let activeProcess: ChildProcess | null = null

async function removeBuildDir(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) return
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 60 })
    return
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EACCES' && code !== 'ENOTEMPTY' && code !== 'EPERM') throw err
  }
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
  } catch { /* non-fatal */ }
}

function parseExtraCmakeArgs(raw: string | null): string[] {
  if (!raw) return []
  const args: string[] = []
  let current = ''
  let quote: string | null = null
  let inToken = false
  for (const ch of raw) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      inToken = true
      continue
    }
    if (/\s/.test(ch)) {
      if (inToken) { args.push(current); current = ''; inToken = false }
      continue
    }
    current += ch
    inToken = true
  }
  if (inToken) args.push(current)
  return args
}

function findLweBinary(): string | undefined {
  for (const p of LWE_SEARCH_PATHS) {
    try {
      fs.accessSync(p, fs.constants.X_OK)
      return p
    } catch { /* keep looking */ }
  }
  return whichCommand(LWE_BINARY)
}

export function getLweStatus(): LweStatus {
  const found = findLweBinary()
  return found ? { installed: true, path: found } : { installed: false }
}

export function detectDistro(): LinuxDistro {
  try {
    const release = fs.readFileSync('/etc/os-release', 'utf8').toLowerCase()
    if (release.includes('id=fedora') || release.includes('id=nobara') || release.includes('id=rhel') || release.includes('id=centos')) return 'fedora'
    if (release.includes('id=arch') || release.includes('id=manjaro') || release.includes('id=endeavouros')) return 'arch'
    if (release.includes('id=debian') || release.includes('id=ubuntu') || release.includes('id=linuxmint') || release.includes('id=pop')) return 'debian'
  } catch { /* no os-release */ }
  return 'unknown'
}

// Aligned with https://github.com/Almamu/linux-wallpaperengine (README + Wayland + FBOProvider gmpxx)
const DEPS_DEBIAN = [
  'build-essential', 'cmake', 'pkg-config',
  'libxrandr-dev', 'libxinerama-dev', 'libxcursor-dev', 'libxi-dev',
  'libgl-dev', 'libglew-dev', 'freeglut3-dev', 'libsdl2-dev',
  'liblz4-dev', 'libavcodec-dev', 'libavformat-dev', 'libavutil-dev', 'libswscale-dev',
  'libxxf86vm-dev', 'libglm-dev', 'libglfw3-dev',
  'libmpv-dev', 'mpv', 'libpulse-dev', 'libpulse0', 'libfftw3-dev',
  'libwayland-dev', 'wayland-protocols', 'libegl1-mesa-dev',
  'libgmp-dev', 'patchelf'
]

// Fedora/Nobara: 'ffmpeg' conflicts with ffmpeg-free, so only ffmpeg-free-devel is listed
const DEPS_FEDORA = [
  'gcc', 'g++', 'cmake', 'pkg-config',
  'libXrandr-devel', 'libXinerama-devel', 'libXcursor-devel', 'libXi-devel',
  'mesa-libGL-devel', 'glew-devel', 'freeglut-devel', 'SDL2-devel',
  'lz4-devel', 'ffmpeg-free-devel',
  'libXxf86vm-devel', 'glm-devel', 'glfw-devel',
  'mpv-devel', 'pulseaudio-libs-devel', 'fftw-devel',
  'wayland-devel', 'wayland-protocols-devel', 'mesa-libEGL-devel',
  'gmp-devel', 'patchelf'
]

const DEPS_ARCH = [
  'base-devel', 'cmake', 'pkg-config',
  'glew', 'freeglut', 'sdl2', 'lz4', 'ffmpeg',
  'glm', 'glfw', 'mpv', 'libpulse', 'fftw',
  'libxrandr', 'libxinerama', 'libxcursor', 'libxi', 'libxxf86vm',
  'wayland', 'wayland-protocols', 'mesa',
  'gmp', 'patchelf'
]

export async function installLweDeps(win: BrowserWindow): Promise<void> {
  const send = (progress: LweInstallProgress) => {
    win.webContents.send(IpcChannels.EVENT_LWE_INSTALL_PROGRESS, progress)
  }

  const distro = detectDistro()
  if (distro === 'unknown') {
    send({
      stage: 'error',
      message: 'Could not detect your Linux distribution. Please install build dependencies manually.',
      percentage: 0
    })
    return
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
      // --skip-unavailable: avoid failing on missing/broken repos (e.g. Cursor 403) or package renames
      installArgs = ['install', '-y', '--skip-unavailable']
      packages = DEPS_FEDORA
      break
    case 'arch':
      pkgManager = 'pacman'
      installArgs = ['-S', '--noconfirm', '--needed']
      packages = DEPS_ARCH
      break
  }

  const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'

  send({
    stage: 'installing-deps',
    message: `Installing ${packages.length} packages via ${pkgManager} (sudo required)...`,
    percentage: 10
  })

  try {
    await execFileAsync(elevate, [pkgManager, ...installArgs, ...packages], {
      timeout: 600_000
    })
    send({
      stage: 'done',
      message: 'Build dependencies installed.',
      percentage: 100
    })
  } catch (err) {
    send({
      stage: 'error',
      message: `Failed to install dependencies: ${(err as Error).message}`,
      percentage: 0
    })
  }
}

export async function installLwe(win: BrowserWindow): Promise<void> {
  const send = (progress: LweInstallProgress) => {
    win.webContents.send(IpcChannels.EVENT_LWE_INSTALL_PROGRESS, progress)
  }

  // read by the catch handler to decide whether to preserve or wipe the build cache
  let isLocalDir = false

  try {
    send({ stage: 'cloning', message: 'Checking build dependencies...', percentage: 0 })

    const missingDeps: string[] = []
    for (const dep of ['git', 'cmake', 'make', 'pkg-config']) {
      if (!isCommandAvailable(dep)) missingDeps.push(dep)
    }

    if (missingDeps.length > 0) {
      send({
        stage: 'error',
        message: `Missing build dependencies: ${missingDeps.join(', ')}. Please install them first.`,
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

    // Reuse the previous build dir when it's the same local source, so CEF's ~2GB download
    // and compiled objects survive between iterations instead of a full rebuild every time.
    const sourceMarker = path.join(BUILD_DIR, '.lwe-source-path')
    const canReuseBuildCache = isLocalDir && (() => {
      try { return fs.readFileSync(sourceMarker, 'utf8').trim() === repo } catch { return false }
    })()
    if (!canReuseBuildCache) {
      await removeBuildDir(BUILD_DIR)
    }

    if (isLocalDir) {
      // Copy the working tree instead of `git clone`, so uncommitted edits don't need a commit first.
      send({ stage: 'cloning', message: `Copying local source from ${repo}...`, percentage: 5 })
      fs.mkdirSync(BUILD_DIR, { recursive: true })
      if (isCommandAvailable('rsync')) {
        // --delete so files removed from the source don't linger in a reused build dir.
        // --no-times overrides -a's mtime preservation - the build dir is reused incrementally
        // (see canReuseBuildCache above), so a stale source mtime can make `make` skip
        // recompiling a changed file.
        await execFileAsync('rsync', [
          '-a', '--no-times', '--delete', '--exclude=/.git', '--exclude=/build',
          `${repo}/`, `${BUILD_DIR}/`
        ], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
      } else {
        // -m on extraction, same reason as --no-times above.
        await execFileAsync('bash', [
          '-c',
          `tar -C ${JSON.stringify(repo)} --exclude=.git --exclude=build -cf - . | tar -C ${JSON.stringify(BUILD_DIR)} -xmf -`
        ], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
      }
      fs.writeFileSync(sourceMarker, repo, 'utf8')
    } else {
      const cloneArgs = ['clone', '--depth', '1', '--recursive']
      if (branch) cloneArgs.push('--branch', branch)
      cloneArgs.push(repo, BUILD_DIR)

      send({
        stage: 'cloning',
        message: `Cloning ${repo}${branch ? ` (${branch})` : ''}...`,
        percentage: 5
      })
      await execFileAsync('git', cloneArgs, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024
      })
    }

    const cmakeBuild = path.join(BUILD_DIR, 'build')
    fs.mkdirSync(cmakeBuild, { recursive: true })

    const buildEnv = buildCleanBuildEnv()

    // cmake configure downloads CEF on first run, which can take several minutes
    send({ stage: 'building', message: 'Running cmake (downloading CEF if needed, may take a few minutes)...', percentage: 25 })
    await execFileAsync('cmake', [
      '..',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DCMAKE_INSTALL_PREFIX=/usr/local',
      '-DCMAKE_C_FLAGS=-Wno-error',
      '-DCMAKE_CXX_FLAGS=-Wno-error',
      ...parseExtraCmakeArgs(getLweCmakeArgs())
    ], {
      cwd: cmakeBuild,
      env: buildEnv,
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8'
    })

    // Forces every source file to recompile regardless of mtimes, so a reused build dir (see
    // canReuseBuildCache above) can never silently skip a changed file - `make`'s mtime-based
    // staleness check is what caused us to ship a stale binary before. This only discards compiled
    // objects, not the downloaded CEF SDK, so it's cheap.
    if (canReuseBuildCache) {
      await execFileAsync('make', ['clean'], {
        cwd: cmakeBuild,
        env: buildEnv,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8'
      }).catch(() => { /* nothing to clean on a fresh build dir - ignore */ })
    }

    send({ stage: 'building', message: 'Compiling (this may take a few minutes)...', percentage: 40 })
    const cores = Math.max(1, os.cpus().length - 1)
    await execFileAsync('make', ['-j', String(cores)], {
      cwd: cmakeBuild,
      env: buildEnv,
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8'
    })

    send({ stage: 'building', message: 'Build complete.', percentage: 80 })

    // make install puts the binary at /usr/local/linux-wallpaperengine
    send({ stage: 'installing', message: 'Installing (sudo required)...', percentage: 85 })

    const installTool = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
    // pkexec often runs the command in a different cwd (e.g. / or root's home), so run install
    // inside a shell that cd's to the build dir first; PATH preserved for make
    const pathEnv = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'
    // install_manifest.txt lists every file `make install` placed; capture it so uninstall
    // can remove exactly those files instead of guessing.
    const manifestMarker = '###LWE_INSTALL_MANIFEST###'
    // Local repo: hand the build dir back to the invoking user instead of deleting it, so the
    // next unprivileged cmake/make can still write into what `make install` (root) just touched.
    const reclaim = isLocalDir
      ? `chown -R ${process.getuid!()}:${process.getgid!()} ${JSON.stringify(BUILD_DIR)}`
      : `rm -rf ${JSON.stringify(BUILD_DIR)}`
    const binaryPath = '/usr/local/linux-wallpaperengine'
    const linkPath = '/usr/local/bin/linux-wallpaperengine'
    // Symlinking is folded into this same elevated script (instead of a second pkexec/sudo call)
    // so the whole install only prompts for a password once.
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

    // Invalidate cache so next status check re-detects
    invalidateCommandCache(LWE_BINARY)
    invalidateObjectFlagsSupport()
    invalidateAudioSensitivitySupport()
    invalidateSoundVolumeSupport()
    invalidateEffectFlagsSupport()
    invalidateDisableAnimationsSupport()

    const status = getLweStatus()
    if (status.installed) {
      send({ stage: 'done', message: 'linux-wallpaperengine installed.', percentage: 100 })
    } else {
      send({
        stage: 'error',
        message: 'Build completed but binary not found in PATH. You may need to add /usr/local/bin to your PATH.',
        percentage: 100
      })
    }
  } catch (err) {
    // Failures here happen before the elevated install step, so the build dir isn't root-tainted -
    // leave it for a local repo so a fix-and-retry stays incremental.
    if (!isLocalDir) {
      try {
        await removeBuildDir(BUILD_DIR)
      } catch { /* ignore cleanup errors */ }
    }

    // execFile puts stdout/stderr on the error object when encoding/maxBuffer are set
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

    // Prefer compiler/linker errors, then cmake/install errors, then the tail of the log
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
      message: `Build failed:\n${excerpt.trim() || fullMsg}`,
      percentage: 0
    })
  }
}

export async function uninstallLwe(): Promise<{ ok: boolean; message: string }> {
  const status = getLweStatus()
  if (!status.installed || !status.path) {
    return { ok: false, message: 'linux-wallpaperengine is not installed.' }
  }

  await stopLwe()

  const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'

  const manifest = readLweManifest()
  let filesToRemove: string[]
  let dirsToPrune: string[] = []

  if (manifest) {
    filesToRemove = [...manifest.files, manifest.symlink]
    // deepest first, so a dir only prunes once its own contents are gone
    dirsToPrune = [...new Set(manifest.files.map(f => path.dirname(f)))].sort((a, b) => b.length - a.length)
  } else {
    // no manifest (pre-dates this, or lost): binary + lib dir only, won't clean up CEF resources
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
      } catch { /* ignore */ }
    }
  }

  try {
    const quoted = (paths: string[]) => paths.map(p => JSON.stringify(p)).join(' ')
    const script = dirsToPrune.length > 0
      ? `rm -f ${quoted(filesToRemove)}; rmdir --ignore-fail-on-non-empty -p ${quoted(dirsToPrune)} 2>/dev/null; ldconfig`
      : `rm -f ${quoted(filesToRemove)}; ldconfig`
    await execFileAsync(elevate, ['bash', '-c', script], {
      timeout: 60_000,
      encoding: 'utf8'
    })

    try { fs.rmSync(getLweManifestPath(), { force: true }) } catch { /* ignore */ }

    invalidateCommandCache(LWE_BINARY)
    invalidateObjectFlagsSupport()
    invalidateAudioSensitivitySupport()
    invalidateSoundVolumeSupport()
    invalidateEffectFlagsSupport()
    invalidateDisableAnimationsSupport()

    return { ok: true, message: 'linux-wallpaperengine has been uninstalled.' }
  } catch (err) {
    return { ok: false, message: `Uninstall failed: ${(err as Error).message}` }
  }
}

/** Find the Wallpaper Engine assets directory from the Steam install. */
function findWeAssetsDir(): string | undefined {
  const workshopPath = getWorkshopPath()
  // Workshop path looks like: .../steamapps/workshop/content/431960
  // Assets are at:            .../steamapps/common/wallpaper_engine/assets
  const steamappsIdx = workshopPath.lastIndexOf(path.join('steamapps', 'workshop'))
  if (steamappsIdx !== -1) {
    const steamappsRoot = workshopPath.substring(0, steamappsIdx + 'steamapps'.length)
    const assetsDir = path.join(steamappsRoot, 'common', 'wallpaper_engine', 'assets')
    if (fs.existsSync(assetsDir)) return assetsDir
  }

  // Fallback: scan common Steam locations
  const home = os.homedir()
  const candidates = [
    path.join(home, '.steam', 'steam', 'steamapps', 'common', 'wallpaper_engine', 'assets'),
    path.join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'wallpaper_engine', 'assets')
  ]
  return candidates.find(p => fs.existsSync(p))
}

/** Directory containing the LWE binary; used for LD_LIBRARY_PATH. */
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

/** LD_LIBRARY_PATH value so the loader finds LWE's .so files. */
function getLweLdLibraryPath(): string {
  const binDir = getLweLibDir()
  const candidates = [
    // For local/fork builds, the .so files live next to the binary
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

/** Full path to LWE binary (resolved symlink). */
function getLweBinaryPath(): string {
  const p = findLweBinary()
  if (!p) return LWE_BINARY
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

/** Build env vars that must be set for LWE, as KEY=VALUE strings for use with `env` command. */
function buildLweEnvVars(): string[] {
  const vars: string[] = []

  vars.push(`LD_LIBRARY_PATH=${getLweLdLibraryPath()}`)

  // CEF bundles its own libEGL.so alongside the LWE binary. LD_LIBRARY_PATH includes the
  // binary's directory so CEF's EGL shadows Mesa's system EGL, breaking Wayland rendering.
  // Force the system EGL via LD_PRELOAD so Mesa's implementation is always used.
  const systemEgl = ['/lib64/libEGL.so.1', '/usr/lib64/libEGL.so.1', '/usr/lib/libEGL.so.1']
    .find(p => fs.existsSync(p))
  if (systemEgl) vars.push(`LD_PRELOAD=${systemEgl}`)

  const waylandDisplay = getWaylandDisplay()
  if (waylandDisplay) vars.push(`WAYLAND_DISPLAY=${waylandDisplay}`)

  // XDG_SESSION_TYPE is how LWE decides between X11 and Wayland drivers
  const sessionType = process.env.XDG_SESSION_TYPE
  if (sessionType) vars.push(`XDG_SESSION_TYPE=${sessionType}`)

  if (process.env.DISPLAY) vars.push(`DISPLAY=${process.env.DISPLAY}`)

  // XDG_RUNTIME_DIR is needed for the Wayland socket
  vars.push(`XDG_RUNTIME_DIR=${getXdgRuntimeDir()}`)

  return vars
}

// Not every linux-wallpaperengine build has --list-objects/--disable-object/--enable-object
// (they're recent additions), so probe --help once and cache the result rather than assuming.
let objectFlagsSupported: boolean | null = null

function invalidateObjectFlagsSupport(): void {
  objectFlagsSupported = null
}

function supportsObjectFlags(): boolean {
  if (objectFlagsSupported !== null) return objectFlagsSupported
  try {
    const binaryPath = getLweBinaryPath()
    const envVars = buildLweEnvVars()
    const stdout = execFileSync('env', [...envVars, binaryPath, '--help'], {
      timeout: 5_000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024
    })
    objectFlagsSupported = stdout.includes('--list-objects')
  } catch {
    objectFlagsSupported = false
  }
  return objectFlagsSupported
}

// --list-audio-objects/--audio-sensitivity are even more recent than --list-objects, so they get
// their own cached probe rather than assuming a build new enough for one is new enough for both.
let audioSensitivitySupported: boolean | null = null

function invalidateAudioSensitivitySupport(): void {
  audioSensitivitySupported = null
}

function supportsAudioSensitivity(): boolean {
  if (audioSensitivitySupported !== null) return audioSensitivitySupported
  try {
    const binaryPath = getLweBinaryPath()
    const envVars = buildLweEnvVars()
    const stdout = execFileSync('env', [...envVars, binaryPath, '--help'], {
      timeout: 5_000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024
    })
    audioSensitivitySupported = stdout.includes('--list-audio-objects')
  } catch {
    audioSensitivitySupported = false
  }
  return audioSensitivitySupported
}

// --sound-volume is newer still - its own probe rather than assuming a build with
// --list-audio-objects also has it.
let soundVolumeSupported: boolean | null = null

function invalidateSoundVolumeSupport(): void {
  soundVolumeSupported = null
}

function supportsSoundVolume(): boolean {
  if (soundVolumeSupported !== null) return soundVolumeSupported
  try {
    const binaryPath = getLweBinaryPath()
    const envVars = buildLweEnvVars()
    const stdout = execFileSync('env', [...envVars, binaryPath, '--help'], {
      timeout: 5_000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024
    })
    soundVolumeSupported = stdout.includes('--sound-volume')
  } catch {
    soundVolumeSupported = false
  }
  return soundVolumeSupported
}

let effectFlagsSupported: boolean | null = null

function invalidateEffectFlagsSupport(): void {
  effectFlagsSupported = null
}

function supportsEffectFlags(): boolean {
  if (effectFlagsSupported !== null) return effectFlagsSupported
  try {
    const binaryPath = getLweBinaryPath()
    const envVars = buildLweEnvVars()
    const stdout = execFileSync('env', [...envVars, binaryPath, '--help'], {
      timeout: 5_000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024
    })
    effectFlagsSupported = stdout.includes('--list-effects')
  } catch {
    effectFlagsSupported = false
  }
  return effectFlagsSupported
}

let disableAnimationsSupported: boolean | null = null

function invalidateDisableAnimationsSupport(): void {
  disableAnimationsSupported = null
}

function supportsDisableAnimations(): boolean {
  if (disableAnimationsSupported !== null) return disableAnimationsSupported
  try {
    const binaryPath = getLweBinaryPath()
    const envVars = buildLweEnvVars()
    const stdout = execFileSync('env', [...envVars, binaryPath, '--help'], {
      timeout: 5_000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024
    })
    disableAnimationsSupported = stdout.includes('--disable-animations')
  } catch {
    disableAnimationsSupported = false
  }
  return disableAnimationsSupported
}

export function parseCustomArgs(raw: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3])
  }
  return tokens
}

/** Build the common LWE args (assets dir, screen roots, fps, volume, object overrides). */
function buildLweArgs(
  wallpaperPath: string,
  options: {
    screenRoot?: string
    fps?: number
    volume?: number
    disabledObjects?: string[]
    enabledObjects?: string[]
    disabledEffects?: string[]
    enabledEffects?: string[]
    propertyOverrides?: Record<string, string>
    scalingMode?: string
    zoom?: number
    offsetX?: number
    offsetY?: number
    disableParallax?: boolean
    cornerColor?: string
    speed?: number
    audioSensitivity?: Record<string, number>
    soundVolume?: Record<string, number>
    customArgs?: string
  }
): string[] {
  const args: string[] = []
  const assetsDir = findWeAssetsDir()
  if (assetsDir) args.push('--assets-dir', assetsDir)

  // --screen-root uses layer-shell (Wayland) or root-window overlay (X11)
  if (options.screenRoot) {
    args.push('--screen-root', options.screenRoot)
  } else {
    const screens = getConnectedScreens()
    for (const s of screens) args.push('--screen-root', s)
  }

  if (options.fps) args.push('--fps', String(options.fps))
  if (options.volume !== undefined) args.push('--volume', String(options.volume))
  // Global, not per-wallpaper - pulled from config.service instead of options.
  const audioScreen = getAudioScreen()
  if (audioScreen) args.push('--audio-screen', audioScreen)
  const ambientVolume = getAmbientVolume()
  if (ambientVolume !== null) args.push('--ambient-volume', String(ambientVolume))
  if (getDisablePuppetAnimation()) args.push('--render-debug', 'no-puppet-animation')
  if (getDisableAnimations() && supportsDisableAnimations()) args.push('--disable-animations')
  if (options.scalingMode) args.push('--scaling', options.scalingMode)
  if (options.zoom !== undefined) args.push('--zoom', String(options.zoom))
  if (options.offsetX !== undefined || options.offsetY !== undefined) {
    args.push('--offset', `${options.offsetX ?? 0},${options.offsetY ?? 0}`)
  }
  if (options.disableParallax) args.push('--disable-parallax')
  if (options.cornerColor) args.push('--corner-color', options.cornerColor)
  if (options.speed !== undefined) args.push('--speed', String(options.speed))
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
    // Global default (config.service) applies to every audio-reactive object via the "*"
    // wildcard; per-wallpaper overrides in options.audioSensitivity are matched first by the
    // engine (specific id/name always wins over "*"), so both can be sent unconditionally.
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
  args.push(wallpaperPath)
  return args
}

/** Control file used for hot-reload signalling. */
function getControlFilePath(): string {
  return path.join(getXdgRuntimeDir(), 'lwe-control')
}

/**
 * Tracks a still-running LWE process across app restarts. `activeProcess` is an in-memory handle
 * that dies with this Electron process, but the LWE child is spawned detached/unref'd so it
 * survives independently - after the app is closed and reopened, `activeProcess` comes back null
 * even though the OS process is still alive. resolveActivePid() below covers that gap.
 */
function getPidFilePath(): string {
  return path.join(getXdgRuntimeDir(), 'lwe-pid')
}

function writePidFile(pid: number): void {
  try {
    fs.writeFileSync(getPidFilePath(), String(pid))
  } catch (err) {
    console.error('[LWE] Failed to write pid file:', err)
  }
}

function clearPidFile(): void {
  try {
    fs.rmSync(getPidFilePath(), { force: true })
  } catch { /* best effort */ }
}

/** True if `pid` is alive and actually looks like a linux-wallpaperengine process (not a recycled PID). */
function isLweProcess(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }

  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    return cmdline.includes(LWE_BINARY)
  } catch {
    // /proc unreadable (e.g. owned by another user) - we already know it's alive, best effort
    return true
  }
}

/**
 * Resolves the PID to signal for hotswap/stop, preferring the in-memory child handle (cheap,
 * exact) and falling back to the persisted pid file (recovers tracking after an app restart).
 */
function resolveActivePid(): number | null {
  if (activeProcess && activeProcess.exitCode === null && activeProcess.pid !== undefined) {
    return activeProcess.pid
  }

  let stored: number | null = null
  try {
    stored = parseInt(fs.readFileSync(getPidFilePath(), 'utf8').trim(), 10)
  } catch {
    return null
  }

  if (!Number.isInteger(stored) || !isLweProcess(stored)) {
    clearPidFile()
    return null
  }

  return stored
}

/**
 * Pushes a background swap and/or layer/volume/xray/scaling/zoom/offset/parallax changes to an already-
 * running instance via the extended key=value control file. All fields are optional and
 * independent - only the ones provided get written. All fields for one logical change must go
 * through a single call: the engine has only one pending-request slot, so two calls in quick
 * succession can race and silently drop whichever one wrote last. disabledObjects/enabledObjects
 * being present (even as empty arrays) is what tells the engine to replace its override lists -
 * omit both to leave layers untouched. xray is a live-only setting with no launch-time equivalent,
 * so it has to be pushed here even right after a fresh launch. cornerColor is a hex
 * "RRGGBB"/"RRGGBBAA" string, only visible where the engine's clamp mode is border (the default).
 * propertyOverrides sends every key in the map, not just changed ones, since the engine only
 * reapplies whatever's currently in its settings map on reload.
 */
export function hotswapLweSettings(options: {
  path?: string
  disabledObjects?: string[]
  enabledObjects?: string[]
  volume?: number
  xray?: boolean
  scaling?: string
  zoom?: number
  offsetX?: number
  offsetY?: number
  disableParallax?: boolean
  cornerColor?: string
  speed?: number
  propertyOverrides?: Record<string, string>
  /** Empty string clears the restriction back to "every screen can produce audio" */
  audioScreen?: string
  ambientVolume?: number
  /** Object id (or "*" for every audio-reactive object with no more specific entry) -> multiplier */
  audioSensitivity?: Record<string, number>
  /** Sound object id -> volume (0-1), applied live without a reload */
  soundVolume?: Record<string, number>
}): boolean {
  const pid = resolveActivePid()
  if (pid === null) return false

  const lines: string[] = []
  if (options.path !== undefined) lines.push(`path=${options.path}`)
  if (options.disabledObjects !== undefined || options.enabledObjects !== undefined) {
    lines.push('layers=1')
    for (const id of options.disabledObjects ?? []) lines.push(`disable-object=${id}`)
    for (const id of options.enabledObjects ?? []) lines.push(`enable-object=${id}`)
  }
  if (options.volume !== undefined) lines.push(`volume=${options.volume}`)
  if (options.xray !== undefined) lines.push(`xray=${options.xray ? 'on' : 'off'}`)
  if (options.scaling !== undefined) lines.push(`scaling=${options.scaling}`)
  if (options.zoom !== undefined) lines.push(`zoom=${options.zoom}`)
  if (options.offsetX !== undefined || options.offsetY !== undefined) {
    lines.push(`offset=${options.offsetX ?? 0},${options.offsetY ?? 0}`)
  }
  if (options.disableParallax !== undefined) lines.push(`disable-parallax=${options.disableParallax ? 'on' : 'off'}`)
  if (options.cornerColor !== undefined) lines.push(`corner-color=${options.cornerColor}`)
  if (options.speed !== undefined) lines.push(`speed=${options.speed}`)
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
  if (lines.length === 0) return false

  try {
    fs.writeFileSync(getControlFilePath(), lines.join('\n') + '\n')
    process.kill(pid, 'SIGUSR1')
    console.log('[LWE] Hotswap settings sent:', lines.join(' '))
    return true
  } catch (err) {
    console.error('[LWE] Hotswap settings failed:', err)
    return false
  }
}

/** Launch LWE and resolve after 2s if still running; reject if it exits with error (so UI can show message). */
export async function launchLweAsync(
  wallpaperPath: string,
  options: {
    screenRoot?: string
    fps?: number
    volume?: number
    disabledObjects?: string[]
    enabledObjects?: string[]
    disabledEffects?: string[]
    enabledEffects?: string[]
    propertyOverrides?: Record<string, string>
    xrayFullReveal?: boolean
    scalingMode?: string
    zoom?: number
    offsetX?: number
    offsetY?: number
    disableParallax?: boolean
    cornerColor?: string
    speed?: number
    audioSensitivity?: Record<string, number>
    soundVolume?: Record<string, number>
    customArgs?: string
  } = {}
): Promise<void> {
  // Hot-reload if already running. xray has no launch flag and the running instance keeps its own
  // xray state across a background swap, so it needs an explicit push even when off. Scaling/zoom/
  // parallax/cornerColor/speed/propertyOverrides do have launch flags, but hot-reload doesn't
  // restart the process - the running instance keeps whatever the previous wallpaper set, so they
  // need the same explicit push, defaulting to "no override" when the new wallpaper doesn't set them.
  // customArgs and effect overrides have no hotswap control-file key, so they always force a restart
  const defaultSensitivity = getDefaultAudioSensitivity()
  if (
    isLweRunning() &&
    !options.customArgs?.trim() &&
    !options.disabledEffects?.length &&
    !options.enabledEffects?.length &&
    hotswapLweSettings({
      path: wallpaperPath,
      xray: options.xrayFullReveal,
      scaling: options.scalingMode ?? 'default',
      zoom: options.zoom ?? 1,
      offsetX: options.offsetX ?? 0,
      offsetY: options.offsetY ?? 0,
      disableParallax: options.disableParallax ?? false,
      cornerColor: options.cornerColor ?? '000000',
      speed: options.speed ?? 1,
      propertyOverrides: options.propertyOverrides ?? {},
      audioSensitivity: {
        ...(defaultSensitivity !== 1 ? { '*': defaultSensitivity } : {}),
        ...options.audioSensitivity
      },
      soundVolume: options.soundVolume ?? {}
    })
  ) {
    return
  }

  await stopLwe()

  const binaryPath = getLweBinaryPath()
  const lweArgs = buildLweArgs(wallpaperPath, options)
  const envVars = buildLweEnvVars()

  // Spawn via `env` to set env vars explicitly, matching how LWE works from the terminal.
  // The env option on spawn can lose vars when combined with detached/setsid.
  const spawnArgs = [...envVars, binaryPath, ...lweArgs]
  console.log('[LWE] Binary:', binaryPath)
  console.log('[LWE] Args:', lweArgs.join(' '))
  console.log('[LWE] Env:', envVars.join(' '))
  return new Promise((resolve, reject) => {
    const child = spawn('env', spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    })
    activeProcess = child
    if (child.pid !== undefined) writePidFile(child.pid)

    const stderrChunks: Buffer[] = []
    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        const msg = chunk.toString('utf8').trim()
        if (msg) console.log('[LWE stdout]', msg)
      })
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk)
        const msg = chunk.toString('utf8').trim()
        if (msg) console.log('[LWE stderr]', msg)
      })
    }

    let settled = false
    // A rapid stop+relaunch can leave the old process still shutting down (CEF/GL
    // teardown isn't instant) when its exit event finally arrives - only clear
    // activeProcess if it's still pointing at this child, not a newer one that
    // superseded it, otherwise the newer launch's own "still running" resolve
    // check below never passes and its promise hangs forever.
    const cleanup = () => {
      if (activeProcess === child) {
        activeProcess = null
        clearPidFile()
      }
    }

    child.on('exit', (code) => {
      cleanup()
      if (settled) return
      settled = true
      if (code !== 0 && code !== null) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
        const msg = stderr ? stderr.split('\n').slice(0, 3).join('\n') : `Exit code ${code}`
        reject(new Error(`linux-wallpaperengine failed: ${msg}`))
      } else {
        resolve()
      }
    })

    child.on('error', (err) => {
      cleanup()
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    child.unref()

    // If still running after 2s, consider it started successfully
    setTimeout(() => {
      if (!settled && activeProcess === child && child.exitCode === null) {
        settled = true
        if (options.xrayFullReveal) hotswapLweSettings({ xray: true })
        resolve()
      }
    }, 2000)
  })
}

// Matches lines like "  123 - Layer Name (image)" printed by --list-objects
const OBJECT_LINE_RE = /^\s*(\S+)\s-\s(.*)\s\((image|particle|text|sound|unknown)\)\s*$/

function parseLweObjectList(output: string): LweSceneObject[] {
  const objects: LweSceneObject[] = []
  for (const line of output.split('\n')) {
    const m = line.match(OBJECT_LINE_RE)
    if (m) objects.push({ id: m[1], name: m[2], type: m[3] as LweSceneObject['type'] })
  }
  return objects
}

// Returns [] for non-scene wallpapers (video/web print no objects)
export async function listLweObjects(wallpaperPath: string): Promise<LweSceneObject[]> {
  const status = getLweStatus()
  if (!status.installed) throw new Error('linux-wallpaperengine is not installed.')
  // Older builds silently ignore unknown flags and fall through to actually rendering the
  // wallpaper instead of exiting, so this must never be sent to a binary that doesn't support it.
  if (!supportsObjectFlags()) return []

  const binaryPath = getLweBinaryPath()
  const args = ['--list-objects']
  const assetsDir = findWeAssetsDir()
  if (assetsDir) args.push('--assets-dir', assetsDir)
  args.push(wallpaperPath)

  const envVars = buildLweEnvVars()
  try {
    const { stdout } = await execFileAsync('env', [...envVars, binaryPath, ...args], {
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8'
    })
    return parseLweObjectList(stdout)
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string }
    const msg = (e.stderr || e.stdout || e.message || String(err)).trim().split('\n').slice(0, 3).join('\n')
    throw new Error(`Failed to list wallpaper objects: ${msg}`)
  }
}

// Matches lines like `  42 - Bloom (object=17 objectName="body" group="Lighting")` printed by --list-effects
const EFFECT_LINE_RE = /^\s*(\S+)\s-\s(.*)\s\(object=(\S+)\sobjectName="(.*)"\sgroup="(.*)"\)\s*$/

function parseLweEffectList(output: string): LweSceneEffect[] {
  const effects: LweSceneEffect[] = []
  for (const line of output.split('\n')) {
    const m = line.match(EFFECT_LINE_RE)
    if (m) effects.push({ id: m[1], name: m[2], objectId: m[3], objectName: m[4], group: m[5] })
  }
  return effects
}

export async function listLweEffects(wallpaperPath: string): Promise<LweSceneEffect[]> {
  const status = getLweStatus()
  if (!status.installed) throw new Error('linux-wallpaperengine is not installed.')
  // older builds ignore unknown flags and render the wallpaper instead of exiting
  if (!supportsEffectFlags()) return []

  const binaryPath = getLweBinaryPath()
  const args = ['--list-effects']
  const assetsDir = findWeAssetsDir()
  if (assetsDir) args.push('--assets-dir', assetsDir)
  args.push(wallpaperPath)

  const envVars = buildLweEnvVars()
  try {
    const { stdout } = await execFileAsync('env', [...envVars, binaryPath, ...args], {
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8'
    })
    return parseLweEffectList(stdout)
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string }
    const msg = (e.stderr || e.stdout || e.message || String(err)).trim().split('\n').slice(0, 3).join('\n')
    throw new Error(`Failed to list wallpaper effects: ${msg}`)
  }
}

// Matches lines like "  24 - transbig (scale): minvalue=0.9 maxvalue=1.1 frequency=0 smoothing=10"
// printed by --list-audio-objects
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

// Returns [] for wallpapers with no audio-reactive scripted properties (most wallpapers)
export async function listLweAudioObjects(wallpaperPath: string): Promise<LweAudioObject[]> {
  const status = getLweStatus()
  if (!status.installed) throw new Error('linux-wallpaperengine is not installed.')
  // Same reasoning as supportsObjectFlags(): older builds silently ignore unknown flags and fall
  // through to actually rendering the wallpaper instead of exiting.
  if (!supportsAudioSensitivity()) return []

  const binaryPath = getLweBinaryPath()
  const args = ['--list-audio-objects']
  const assetsDir = findWeAssetsDir()
  if (assetsDir) args.push('--assets-dir', assetsDir)
  args.push(wallpaperPath)

  const envVars = buildLweEnvVars()
  try {
    const { stdout } = await execFileAsync('env', [...envVars, binaryPath, ...args], {
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8'
    })
    return parseLweAudioObjectList(stdout)
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string }
    const msg = (e.stderr || e.stdout || e.message || String(err)).trim().split('\n').slice(0, 3).join('\n')
    throw new Error(`Failed to list audio-reactive objects: ${msg}`)
  }
}

// Parses --list-properties output, e.g.:
//   background_edit_brightness - slider
//   	Text: Brightness
//   	Min: 0
//   	Max: 200
//   	Step: 0
//   	Value: 100.000000
//
//   clock_font - combo
//   	Text: ui_clock_font
//   	Value: impact
//   Values:
//   		segoe ui = ui_clock_font_4
// Combo option values (before " = ") can contain spaces (e.g. font names), so that
// line can't be split on whitespace - only on the literal " = " separator.
const PROPERTY_HEADER_RE =
  /^(\S+) - (slider|boolean|color|combo|text|scene texture|file|textinput)$/
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

export async function listLweProperties(wallpaperPath: string): Promise<LweProperty[]> {
  const status = getLweStatus()
  if (!status.installed) throw new Error('linux-wallpaperengine is not installed.')

  const binaryPath = getLweBinaryPath()
  const args = ['--list-properties']
  const assetsDir = findWeAssetsDir()
  if (assetsDir) args.push('--assets-dir', assetsDir)
  args.push(wallpaperPath)

  const envVars = buildLweEnvVars()
  try {
    const { stdout } = await execFileAsync('env', [...envVars, binaryPath, ...args], {
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8'
    })
    return parseLweProperties(stdout)
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string }
    const msg = (e.stderr || e.stdout || e.message || String(err)).trim().split('\n').slice(0, 3).join('\n')
    throw new Error(`Failed to list wallpaper properties: ${msg}`)
  }
}

/** Polls until `pid` is gone, since Node has no waitpid() for a process it didn't spawn itself. */
async function pollUntilGone(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return false
}

/**
 * Waits for `pid` to actually exit (escalating to SIGKILL if it ignores the grace period) instead
 * of just firing SIGTERM and returning. Matters because launchLweAsync spawns a replacement right
 * after calling stopLwe() - without waiting, the new process can race the old one's teardown for
 * the same resources (e.g. the audio device), which is silent and easy to miss since it only
 * shows up as "audio doesn't work on this particular launch."
 */
async function waitForPidExit(pid: number, timeoutMs = 2000): Promise<void> {
  if (await pollUntilGone(pid, timeoutMs)) return

  try {
    process.kill(pid, 'SIGKILL')
  } catch { /* already dead */ }
  await pollUntilGone(pid, 500)
}

export async function stopLwe(): Promise<void> {
  const pid = resolveActivePid()
  if (pid !== null) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch { /* already dead */ }
    await waitForPidExit(pid)
  }
  activeProcess = null
  clearPidFile()
}

export function isLweRunning(): boolean {
  return resolveActivePid() !== null
}

/** Force-kill every linux-wallpaperengine process on the system, including ones this app isn't tracking. */
export async function killAllLweProcesses(): Promise<{ ok: boolean; message: string }> {
  activeProcess = null
  clearPidFile()

  try {
    const { stdout } = await execFileAsync('pkill', ['-9', '-f', '-c', LWE_BINARY])
    const count = parseInt(stdout.trim(), 10) || 0
    return { ok: true, message: `Killed ${count} process${count === 1 ? '' : 'es'}.` }
  } catch (err) {
    const code = (err as { code?: number }).code
    // pkill exits 1 when nothing matched, that's not a failure here
    if (code === 1) {
      return { ok: true, message: 'No running processes found.' }
    }
    return { ok: false, message: `Failed to kill processes: ${(err as Error).message}` }
  }
}
