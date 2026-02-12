import { execFile, spawn, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { LweStatus, LweInstallProgress, LinuxDistro } from '@shared/types'
import { isCommandAvailable, invalidateCommandCache, whichCommand } from '../utils/platform'

const execFileAsync = promisify(execFile)

const LWE_BINARY = 'linux-wallpaperengine'
const LWE_REPO = 'https://github.com/Almamu/linux-wallpaperengine.git'
const BUILD_DIR = path.join(os.tmpdir(), 'lwe-build')

let activeProcess: ChildProcess | null = null

export function getLweStatus(): LweStatus {
  const installed = isCommandAvailable(LWE_BINARY)
  if (!installed) return { installed: false }

  return {
    installed: true,
    path: whichCommand(LWE_BINARY)
  }
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
  'libgmp-dev'
]

// Fedora/Nobara: do not add 'ffmpeg' — conflicts with ffmpeg-free; use ffmpeg-free-devel only
const DEPS_FEDORA = [
  'gcc', 'g++', 'cmake', 'pkg-config',
  'libXrandr-devel', 'libXinerama-devel', 'libXcursor-devel', 'libXi-devel',
  'mesa-libGL-devel', 'glew-devel', 'freeglut-devel', 'SDL2-devel',
  'lz4-devel', 'ffmpeg-free-devel',
  'libXxf86vm-devel', 'glm-devel', 'glfw-devel',
  'mpv-devel', 'pulseaudio-libs-devel', 'fftw-devel',
  'wayland-devel', 'wayland-protocols-devel', 'mesa-libEGL-devel',
  'gmp-devel'
]

const DEPS_ARCH = [
  'base-devel', 'cmake', 'pkg-config',
  'glew', 'freeglut', 'sdl2', 'lz4', 'ffmpeg',
  'glm', 'glfw', 'mpv', 'libpulse', 'fftw',
  'libxrandr', 'libxinerama', 'libxcursor', 'libxi', 'libxxf86vm',
  'wayland', 'wayland-protocols', 'mesa',
  'gmp'
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
      message: 'Build dependencies installed successfully!',
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
      fs.rmSync(BUILD_DIR, { recursive: true, force: true })
    }

    // Clone
    send({ stage: 'cloning', message: 'Cloning linux-wallpaperengine...', percentage: 5 })
    await execFileAsync('git', ['clone', '--depth', '1', '--recursive', LWE_REPO, BUILD_DIR], {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024
    })

    // Create build dir
    const cmakeBuild = path.join(BUILD_DIR, 'build')
    fs.mkdirSync(cmakeBuild, { recursive: true })

    // CMake configure — CEF download can take several minutes; install to /usr/local and symlink into PATH
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

    // Install — needs sudo via graphical prompt (binary ends up at /usr/local/linux-wallpaperengine)
    send({ stage: 'installing', message: 'Installing (sudo required)...', percentage: 85 })

    const installTool = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
    // pkexec often runs the command in a different cwd (e.g. / or root's home), so run install
    // inside a shell that cd's to the build dir first; PATH preserved for make
    const pathEnv = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'
    const installScript = `cd ${JSON.stringify(cmakeBuild)} && export PATH=${JSON.stringify(pathEnv)} && make install`
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
    fs.rmSync(BUILD_DIR, { recursive: true, force: true })

    // Invalidate cache so next status check re-detects
    invalidateCommandCache(LWE_BINARY)

    const status = getLweStatus()
    if (status.installed) {
      send({ stage: 'done', message: 'linux-wallpaperengine installed successfully!', percentage: 100 })
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
        fs.rmSync(BUILD_DIR, { recursive: true, force: true })
      }
    } catch { /* ignore cleanup errors */ }

    // Capture both stdout and stderr (Node provides these on execFile error when encoding/maxBuffer set)
    const e = err as Error & { stdout?: string; stderr?: string }
    const fullMsg = e.message ?? String(err)
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n')
    const lines = (combined || fullMsg).split('\n')

    // 1. Real compiler/linker errors (highest priority)
    const compilerErrors = lines.filter(
      (l: string) => /:\d+:\d+: (?:fatal )?error:/i.test(l) || /^\/.*error:/i.test(l) ||
        /undefined reference/i.test(l) || /ld returned/i.test(l) ||
        /collect2: error/i.test(l)
    )

    // 2. CMake / install / permission errors
    const otherErrors = lines.filter(
      (l: string) => /CMake Error/i.test(l) || /No such file or directory/i.test(l) ||
        /Permission denied/i.test(l) || /cannot create/i.test(l) ||
        /fatal:/i.test(l) || /failed to/i.test(l)
    )

    let excerpt: string
    if (compilerErrors.length > 0) {
      // Show the first few real compiler errors (most useful)
      excerpt = compilerErrors.slice(0, 10).join('\n')
    } else if (otherErrors.length > 0) {
      excerpt = otherErrors.slice(0, 8).join('\n')
    } else {
      // Fallback: show last 30 lines (skip empty/make-summary-only lines)
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

/** Directory containing the LWE binary; used for LD_LIBRARY_PATH. */
function getLweLibDir(): string {
  const p = whichCommand(LWE_BINARY)
  if (!p) return '/usr/local'
  try {
    const resolved = fs.realpathSync(p)
    return path.dirname(resolved)
  } catch {
    return path.dirname(p)
  }
}

/** LD_LIBRARY_PATH value so the loader finds LWE's .so files (binary dir + lib subdir). */
function getLweLdLibraryPath(): string {
  const libDir = getLweLibDir()
  const paths = [libDir, path.join(libDir, 'lib')]
  const existing = process.env.LD_LIBRARY_PATH
  if (existing) paths.push(existing)
  return paths.join(':')
}

/** Full path to LWE binary (resolved symlink). */
function getLweBinaryPath(): string {
  const p = whichCommand(LWE_BINARY)
  if (!p) return LWE_BINARY
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

/** Launch LWE and resolve after 2s if still running; reject if it exits with error (so UI can show message). */
export function launchLweAsync(
  wallpaperPath: string,
  options: { screenRoot?: string; fps?: number } = {}
): Promise<void> {
  stopLwe()

  const args: string[] = []
  if (options.screenRoot) args.push('--screen-root', options.screenRoot)
  if (options.fps) args.push('--fps', String(options.fps))
  args.push(wallpaperPath)

  // Run via 'env' so LD_LIBRARY_PATH is set for the dynamic linker (some environments don't pass our env to the child)
  const ldPath = getLweLdLibraryPath()
  const binaryPath = getLweBinaryPath()
  const spawnArgs = [`LD_LIBRARY_PATH=${ldPath}`, binaryPath, ...args]

  return new Promise((resolve, reject) => {
    const child = spawn('env', spawnArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true
    })
    activeProcess = child

    const stderrChunks: Buffer[] = []
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
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

/** Sync launch (no wait); use launchLweAsync in handlers so startup failures are visible. */
export function launchLwe(
  wallpaperPath: string,
  options: { screenRoot?: string; fps?: number } = {}
): ChildProcess {
  stopLwe()
  const args: string[] = []
  if (options.screenRoot) args.push('--screen-root', options.screenRoot)
  if (options.fps) args.push('--fps', String(options.fps))
  args.push(wallpaperPath)
  const ldPath = getLweLdLibraryPath()
  const binaryPath = getLweBinaryPath()
  activeProcess = spawn('env', [`LD_LIBRARY_PATH=${ldPath}`, binaryPath, ...args], { stdio: 'ignore', detached: true })
  activeProcess.on('exit', () => { activeProcess = null })
  activeProcess.unref()
  return activeProcess
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
