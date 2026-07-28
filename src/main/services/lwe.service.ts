import { execFile, spawn, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { LweStatus, LweInstallProgress, LinuxDistro } from '@shared/types'
import {
  isCommandAvailable,
  invalidateCommandCache,
  whichCommand,
  getConnectedScreens,
  getWaylandDisplay,
  getXdgRuntimeDir
} from '../utils/platform'
import { getWorkshopPath } from '../utils/paths'
import { getLweRepoUrl, getLweRepoBranch } from './config.service'
import { DEFAULT_LWE_REPO } from '@shared/constants'

const execFileAsync = promisify(execFile)

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

    // Clean previous build
    if (fs.existsSync(BUILD_DIR)) {
      fs.rmSync(BUILD_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 60 })
    }

    // Clone from the configured repo (custom fork or local path), or the official repo.
    // Local paths are expanded so git clone sees an absolute path.
    let repo = getLweRepoUrl() ?? DEFAULT_LWE_REPO
    if (repo.startsWith('~/')) repo = path.join(os.homedir(), repo.slice(2))
    const branch = getLweRepoBranch()
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

    // Create build dir
    const cmakeBuild = path.join(BUILD_DIR, 'build')
    fs.mkdirSync(cmakeBuild, { recursive: true })

    // cmake configure downloads CEF on first run, which can take several minutes
    send({ stage: 'building', message: 'Running cmake (downloading CEF if needed, may take a few minutes)...', percentage: 25 })
    await execFileAsync('cmake', [
      '..',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DCMAKE_INSTALL_PREFIX=/usr/local',
      '-DCMAKE_C_FLAGS=-Wno-error',
      '-DCMAKE_CXX_FLAGS=-Wno-error'
    ], {
      cwd: cmakeBuild,
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8'
    })

    // Build
    send({ stage: 'building', message: 'Compiling (this may take a few minutes)...', percentage: 40 })
    const cores = Math.max(1, os.cpus().length - 1)
    await execFileAsync('make', ['-j', String(cores)], {
      cwd: cmakeBuild,
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
    // After install, fix RUNPATH to avoid CEF's libEGL.so shadowing the system Mesa EGL,
    // and run ldconfig so the linker cache picks up the new shared libs.
    const installScript = `cd ${JSON.stringify(cmakeBuild)} && export PATH=${JSON.stringify(pathEnv)} && make install && patchelf --set-rpath /usr/local/lib64:/usr/local/lib /usr/local/linux-wallpaperengine 2>/dev/null; ldconfig`
    await execFileAsync(installTool, ['bash', '-c', installScript], {
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8'
    })

    // Symlink binary into PATH so `linux-wallpaperengine` is found
    const binaryPath = '/usr/local/linux-wallpaperengine'
    const linkPath = '/usr/local/bin/linux-wallpaperengine'
    try {
      await execFileAsync(installTool, ['ln', '-sf', binaryPath, linkPath], {
        timeout: 10_000,
        encoding: 'utf8',
        maxBuffer: 65536
      })
    } catch {
      // Non-fatal: user may already have it in PATH or can add /usr/local to PATH
    }

    // Cleanup build dir
    fs.rmSync(BUILD_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 60 })

    // Invalidate cache so next status check re-detects
    invalidateCommandCache(LWE_BINARY)

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
    try {
      if (fs.existsSync(BUILD_DIR)) {
        fs.rmSync(BUILD_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 60 })
      }
    } catch { /* ignore cleanup errors */ }

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

  // Stop any running instance first
  stopLwe()

  const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
  const binaryPath = status.path

  // Resolve symlink to find the real binary location
  let realPath: string
  try {
    realPath = fs.realpathSync(binaryPath)
  } catch {
    realPath = binaryPath
  }

  // Collect all files to remove (binary, symlink if different, known lib dir)
  const filesToRemove: string[] = [realPath]
  if (realPath !== binaryPath) filesToRemove.push(binaryPath)

  // Check for LWE lib directory next to the real binary (cmake install puts libs there)
  const binDir = path.dirname(realPath)
  const libDir = path.join(binDir, 'lib')
  if (fs.existsSync(libDir)) {
    // Only remove if it looks like it belongs to LWE (contains libcef or similar)
    try {
      const entries = fs.readdirSync(libDir)
      if (entries.some(e => e.includes('cef') || e.includes('wallpaper'))) {
        filesToRemove.push(libDir)
      }
    } catch { /* ignore */ }
  }

  try {
    await execFileAsync(elevate, ['rm', '-rf', ...filesToRemove], {
      timeout: 30_000,
      encoding: 'utf8'
    })

    // Invalidate caches
    invalidateCommandCache(LWE_BINARY)

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
  // Only include paths that actually exist
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

  // DISPLAY for X11/XWayland
  if (process.env.DISPLAY) vars.push(`DISPLAY=${process.env.DISPLAY}`)

  // XDG_RUNTIME_DIR is needed for the Wayland socket
  vars.push(`XDG_RUNTIME_DIR=${getXdgRuntimeDir()}`)

  return vars
}

/** Build the common LWE args (assets dir, screen roots, fps, volume). */
function buildLweArgs(
  wallpaperPath: string,
  options: { screenRoot?: string; fps?: number; volume?: number }
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
  args.push(wallpaperPath)
  return args
}

/** Control file used for hot-reload signalling. */
function getControlFilePath(): string {
  return path.join(getXdgRuntimeDir(), 'lwe-control')
}

/** Hot-reload: write new wallpaper path to control file and send SIGUSR1. */
function hotReloadLwe(wallpaperPath: string): boolean {
  if (!activeProcess || activeProcess.exitCode !== null) return false

  try {
    fs.writeFileSync(getControlFilePath(), wallpaperPath + '\n')
    activeProcess.kill('SIGUSR1')
    console.log('[LWE] Hot-reload signal sent for:', wallpaperPath)
    return true
  } catch (err) {
    console.error('[LWE] Hot-reload failed:', err)
    return false
  }
}

/** Launch LWE and resolve after 2s if still running; reject if it exits with error (so UI can show message). */
export function launchLweAsync(
  wallpaperPath: string,
  options: { screenRoot?: string; fps?: number; volume?: number } = {}
): Promise<void> {
  // Hot-reload if already running
  if (isLweRunning() && hotReloadLwe(wallpaperPath)) {
    return Promise.resolve()
  }

  stopLwe()

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
    const cleanup = () => {
      activeProcess = null
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
        resolve()
      }
    }, 2000)
  })
}

export function stopLwe(): void {
  if (activeProcess) {
    try {
      activeProcess.kill('SIGTERM')
    } catch { /* already dead */ }
    activeProcess = null
  }
}

export function isLweRunning(): boolean {
  return activeProcess !== null && activeProcess.exitCode === null
}

/** Force-kill every linux-wallpaperengine process on the system, including ones this app isn't tracking. */
export async function killAllLweProcesses(): Promise<{ ok: boolean; message: string }> {
  activeProcess = null

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
