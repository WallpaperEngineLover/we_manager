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

const DEPS_DEBIAN = [
  'build-essential', 'cmake', 'pkg-config',
  'libxrandr-dev', 'libxinerama-dev', 'libxcursor-dev', 'libxi-dev',
  'libgl-dev', 'libglew-dev', 'freeglut3-dev', 'libsdl2-dev',
  'liblz4-dev', 'libavcodec-dev', 'libavformat-dev', 'libavutil-dev', 'libswscale-dev',
  'libxxf86vm-dev', 'libglm-dev', 'libglfw3-dev',
  'libmpv-dev', 'libpulse-dev', 'libfftw3-dev'
]

const DEPS_FEDORA = [
  'gcc', 'g++', 'cmake', 'pkg-config',
  'libXrandr-devel', 'libXinerama-devel', 'libXcursor-devel', 'libXi-devel',
  'mesa-libGL-devel', 'glew-devel', 'freeglut-devel', 'SDL2-devel',
  'lz4-devel', 'ffmpeg-free-devel',
  'libXxf86vm-devel', 'glm-devel', 'glfw-devel',
  'mpv-devel', 'pulseaudio-libs-devel', 'fftw-devel'
]

const DEPS_ARCH = [
  'base-devel', 'cmake', 'pkg-config',
  'glew', 'freeglut', 'sdl2', 'lz4', 'ffmpeg',
  'glm', 'glfw', 'mpv', 'libpulse', 'fftw',
  'libxrandr', 'libxinerama', 'libxcursor', 'libxi', 'libxxf86vm'
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
      installArgs = ['install', '-y']
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

    // CMake configure — disable -Werror so upstream warnings don't break the build on newer GCC
    send({ stage: 'building', message: 'Running cmake configure...', percentage: 25 })
    await execFileAsync('cmake', [
      '..',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DCMAKE_C_FLAGS=-Wno-error',
      '-DCMAKE_CXX_FLAGS=-Wno-error'
    ], {
      cwd: cmakeBuild,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024
    })

    // Build
    send({ stage: 'building', message: 'Compiling (this may take a few minutes)...', percentage: 40 })
    const cores = Math.max(1, os.cpus().length - 1)
    await execFileAsync('make', ['-j', String(cores)], {
      cwd: cmakeBuild,
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024
    })

    send({ stage: 'building', message: 'Build complete.', percentage: 80 })

    // Install — needs sudo via graphical prompt
    send({ stage: 'installing', message: 'Installing (sudo required)...', percentage: 85 })

    const installTool = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
    await execFileAsync(installTool, ['make', 'install'], {
      cwd: cmakeBuild,
      timeout: 120_000
    })

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

    // Extract a short, useful error from potentially huge compiler output
    const fullMsg = (err as Error).message ?? String(err)
    const stderr = (err as { stderr?: string }).stderr
    const errorSource = stderr || fullMsg

    // Find actual error lines (not warnings)
    const errorLines = errorSource.split('\n').filter(
      (l: string) => /error:/i.test(l) || /fatal/i.test(l) || /make.*\*\*\*/i.test(l)
    )
    const shortMsg = errorLines.length > 0
      ? errorLines.slice(-3).join('\n')
      : errorSource.split('\n').slice(-5).join('\n')

    send({
      stage: 'error',
      message: `Build failed:\n${shortMsg}`,
      percentage: 0
    })
  }
}

export function launchLwe(
  wallpaperPath: string,
  options: { screenRoot?: string; fps?: number } = {}
): ChildProcess {
  stopLwe()

  const args: string[] = []

  if (options.screenRoot) {
    args.push('--screen-root', options.screenRoot)
  }
  if (options.fps) {
    args.push('--fps', String(options.fps))
  }

  args.push(wallpaperPath)

  activeProcess = spawn(LWE_BINARY, args, {
    stdio: 'ignore',
    detached: true
  })

  activeProcess.on('exit', () => {
    activeProcess = null
  })

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
