import { execFile, execFileSync, spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { openStore } from '../utils/safeStore'
import { app } from 'electron'
import { detectDesktopEnv, getWaylandDisplay, getXdgRuntimeDir, isCommandAvailable, isWaylandSession } from '../utils/platform'
import { hostCommand, isFlatpak, isHostCommandAvailable } from '../utils/flatpak'
import { distroFromIds, getActiveScreens, isOstreeSystem, parseOsReleaseIds, onLweLaunched } from './lwe.service'
import type { DesktopIconsStatus, LinuxDistro } from '@shared/types'

interface DesktopIconsStoreSchema {
  desktopIconsEnabled: boolean
}

const store = openStore<DesktopIconsStoreSchema>({
  defaults: { desktopIconsEnabled: false }
})

let overlayProcesses: ChildProcess[] = []

function getOverlayScriptPath(): string {
  // In dev: __dirname is out/main, project root is two levels up
  // In prod: script is copied to resources/
  const candidates = [
    path.join(__dirname, '..', '..', 'src', 'main', 'services', 'desktop-icons-overlay.py'),
    path.join(process.resourcesPath ?? '', 'desktop-icons-overlay.py'),
    path.join(__dirname, 'desktop-icons-overlay.py')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

const LAYER_SHELL_DIRS = [
  '/usr/lib64',
  '/usr/lib',
  '/usr/lib/x86_64-linux-gnu',
  '/usr/lib/aarch64-linux-gnu',
  '/usr/local/lib64',
  '/usr/local/lib',
  '/lib64',
  '/lib'
]
const LAYER_SHELL_NAMES = ['libgtk4-layer-shell.so.0', 'libgtk4-layer-shell.so']
const LAYER_SHELL_LIBS = LAYER_SHELL_DIRS.flatMap((dir) => LAYER_SHELL_NAMES.map((name) => `${dir}/${name}`))

const PACKAGES: Record<string, string> = {
  fedora: 'sudo dnf install gtk4-layer-shell python3-gobject python3-cairo',
  arch: 'sudo pacman -S gtk4-layer-shell python-gobject python-cairo',
  debian: 'sudo apt install gir1.2-gtk4layershell-1.0 libgtk4-layer-shell0 python3-gi python3-gi-cairo gir1.2-gtk-4.0',
  suse: 'sudo zypper install libgtk4-layer-shell0 typelib-1_0-Gtk4LayerShell-1_0 python3-gobject python3-cairo typelib-1_0-Gtk-4_0'
}

const WAYLAND_DEV: Record<string, string> = { fedora: 'wayland-devel', debian: 'libwayland-dev', suse: 'wayland-devel' }

function withWaylandDev(command: string | undefined): string | undefined {
  const dev = WAYLAND_DEV[hostDistro()]
  return command && dev ? `${command} ${dev}` : command
}

/** In a Flatpak /etc/os-release is the runtime's, the packages go onto the host */
let cachedHostIds: string[] | undefined

function hostOsReleaseIds(): string[] {
  if (cachedHostIds) return cachedHostIds
  try {
    if (!isFlatpak()) {
      cachedHostIds = parseOsReleaseIds(fs.readFileSync('/etc/os-release', 'utf8'))
    } else {
      const [file, args] = hostCommand('cat', ['/etc/os-release'])
      cachedHostIds = parseOsReleaseIds(execFileSync(file, args, { encoding: 'utf8', timeout: 5000 }))
    }
  } catch {
    cachedHostIds = []
  }
  return cachedHostIds
}

function hostDistro(): LinuxDistro {
  return distroFromIds(hostOsReleaseIds())
}

/** Leap 16's repositories have no gtk4-layer-shell at all, neither the library nor the typelib */
function hostIsOpenSuseLeap(): boolean {
  return hostOsReleaseIds().includes('opensuse-leap')
}

function hostIsImmutable(): boolean {
  if (!isFlatpak()) return isOstreeSystem()
  try {
    const [file, args] = hostCommand('test', ['-e', '/run/ostree-booted'])
    execFileSync(file, args, { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

const INSTALL_ARGS: Record<string, string[]> = {
  fedora: ['dnf', 'install', '-y', 'gtk4-layer-shell', 'python3-gobject', 'python3-cairo'],
  arch: ['pacman', '-S', '--needed', '--noconfirm', 'gtk4-layer-shell', 'python-gobject', 'python-cairo'],
  debian: ['apt-get', 'install', '-y', 'gir1.2-gtk4layershell-1.0', 'libgtk4-layer-shell0', 'python3-gi', 'python3-gi-cairo', 'gir1.2-gtk-4.0'],
  suse: ['zypper', '--non-interactive', 'install', 'libgtk4-layer-shell0', 'typelib-1_0-Gtk4LayerShell-1_0', 'python3-gobject', 'python3-cairo', 'typelib-1_0-Gtk-4_0']
}

export function installDesktopIconsDependencies(): Promise<{ ok: boolean; error?: string }> {
  const install = INSTALL_ARGS[hostDistro()]
  if (!install) return Promise.resolve({ ok: false, error: 'unknown-distro' })
  if (hostIsImmutable()) return Promise.resolve({ ok: false, error: 'immutable' })
  const hasPkexec = isFlatpak() ? isHostCommandAvailable('pkexec') : isCommandAvailable('pkexec')
  if (!hasPkexec) return Promise.resolve({ ok: false, error: 'no-pkexec' })

  const [file, args] = hostCommand('pkexec', install)
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 10 * 60 * 1000, encoding: 'utf8' }, (err, _stdout, stderr) => {
      if (err) {
        // 126 and 127 are pkexec's dismissed and not-authorized codes
        const code = (err as { code?: number }).code
        if (code === 126 || code === 127) return resolve({ ok: false, error: 'cancelled' })
        return resolve({ ok: false, error: stderr.trim().split('\n').slice(-4).join('\n') || err.message })
      }
      startFailure = null
      if (getDesktopIconsEnabled()) startDesktopIconsOverlay()
      resolve({ ok: true })
    })
  })
}

const WAYLAND_CLIENT = 'libwayland-client'

/** gtk4-layer-shell 1.0.x dlopen()s the plain libwayland-client.so, which only the -devel package has (Fedora 39: "failed to dlopen libwayland") */
function waylandClientLinkDir(): string {
  return path.join(app.getPath('userData'), 'overlay-lib')
}

function ensureWaylandClientLink(): string | undefined {
  const target = LAYER_SHELL_DIRS.map((dir) => `${dir}/${WAYLAND_CLIENT}.so.0`).find((p) => fs.existsSync(p))
  if (!target) return undefined
  const dir = waylandClientLinkDir()
  const link = path.join(dir, `${WAYLAND_CLIENT}.so`)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.rmSync(link, { force: true })
    fs.symlinkSync(target, link)
    return dir
  } catch {
    return undefined
  }
}

/** The runtime library is libgtk4-layer-shell.so.0, the plain .so name only comes with the -devel package */
function findLayerShellLib(): string | undefined {
  const found = LAYER_SHELL_LIBS.find((p) => fs.existsSync(p))
  if (found) return found
  for (const ldconfig of ['ldconfig', '/sbin/ldconfig', '/usr/sbin/ldconfig']) {
    try {
      const out = execFileSync(ldconfig, ['-p'], { encoding: 'utf8', timeout: 3000 })
      const line = out.split('\n').find((l) => l.includes('libgtk4-layer-shell.so'))
      const target = line?.split('=>')[1]?.trim()
      if (target && fs.existsSync(target)) return target
    } catch {
    }
  }
  return undefined
}

/** The overlay needs the host's Python, GTK4 and gtk4-layer-shell, so it runs on the host from a copy of the script */
function flatpakOverlayCommand(scriptPath: string, envVars: string[], screen?: string): [string, string[]] {
  const hostScript = path.join(app.getPath('userData'), 'desktop-icons-overlay.py')
  fs.copyFileSync(scriptPath, hostScript)
  const linkDir = waylandClientLinkDir()
  const linkLib = `mkdir -p "${linkDir}"; for lib in ${LAYER_SHELL_DIRS.map((dir) => `${dir}/${WAYLAND_CLIENT}.so.0`).join(' ')}; do [ -e "$lib" ] && ln -sf "$lib" "${linkDir}/${WAYLAND_CLIENT}.so" && export LD_LIBRARY_PATH="${linkDir}\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" && break; done`
  const findLib = `${linkLib}; for lib in ${LAYER_SHELL_LIBS.join(' ')} $(ldconfig -p 2>/dev/null | sed -n 's/.*libgtk4-layer-shell.so.* => //p'); do [ -e "$lib" ] && export LD_PRELOAD="$lib" && break; done`
  const args = ['--host', ...envVars.filter((v) => !v.startsWith('LD_PRELOAD=')).map((v) => `--env=${v}`),
    'sh', '-c', `${findLib}; exec python3 "$@"`, 'sh', hostScript]
  if (screen) args.push(screen)
  return ['flatpak-spawn', args]
}

/** Env vars for the overlay; Electron runs under XWayland so the Wayland env must be passed explicitly. */
function buildOverlayEnvVars(layerShellLib: string | undefined): string[] {
  const vars: string[] = []

  const linkDir = isFlatpak() ? undefined : ensureWaylandClientLink()
  if (linkDir) vars.push(`LD_LIBRARY_PATH=${linkDir}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`)

  if (layerShellLib) vars.push(`LD_PRELOAD=${layerShellLib}`)

  // Force GTK4 onto the Wayland backend (layer-shell does not work under X11)
  vars.push('GDK_BACKEND=wayland')

  const waylandDisplay = getWaylandDisplay()
  if (waylandDisplay) vars.push(`WAYLAND_DISPLAY=${waylandDisplay}`)

  vars.push(`XDG_RUNTIME_DIR=${getXdgRuntimeDir()}`)

  if (process.env.DISPLAY) vars.push(`DISPLAY=${process.env.DISPLAY}`)

  return vars
}

const EXIT_MISSING_MODULES = 2
const EXIT_NO_LAYER_SHELL = 3
const EXIT_NO_MONITOR = 4
const EXIT_MONITORS_CHANGED = 5
let restartTimer: NodeJS.Timeout | undefined
const STDERR_LINES = 8

let startFailure: { problem: 'missing-modules' | 'failed'; detail: string; command?: string } | null = null

/** Only Plasma's Folder View sits below the engine's surface; other desktops draw their icons above it themselves */
function unsupportedReason(): 'not-kde' | 'not-wayland' | null {
  if (detectDesktopEnv() !== 'kde') return 'not-kde'
  if (!isWaylandSession()) return 'not-wayland'
  return null
}

export function getDesktopIconsStatus(): DesktopIconsStatus {
  const enabled = getDesktopIconsEnabled()
  const unsupported = unsupportedReason()
  if (unsupported) return { enabled, problem: unsupported }
  const command = PACKAGES[hostDistro()]
  if (!isFlatpak() && !findLayerShellLib()) {
    if (hostIsOpenSuseLeap()) return { enabled, problem: 'unavailable-distro' }
    return { enabled, problem: 'missing-lib', command }
  }
  if (startFailure) return { enabled, problem: startFailure.problem, detail: startFailure.detail, command: startFailure.command ?? command }
  return { enabled }
}

export function startDesktopIconsOverlay(): void {
  stopDesktopIconsOverlay()
  startFailure = null

  if (unsupportedReason()) return

  const scriptPath = getOverlayScriptPath()
  if (!fs.existsSync(scriptPath)) {
    console.error('[DesktopIcons] Overlay script not found:', scriptPath)
    startFailure = { problem: 'failed', detail: 'script not found' }
    return
  }

  const layerShellLib = isFlatpak() ? undefined : findLayerShellLib()
  if (!isFlatpak() && !layerShellLib) {
    console.error('[DesktopIcons] libgtk4-layer-shell not found')
    return
  }

  const envVars = buildOverlayEnvVars(layerShellLib)
  const screens = getActiveScreens()

  const targets = screens.length > 0 ? screens : [undefined]
  for (const screen of targets) {
    const args = ['python3', scriptPath]
    if (screen) args.push(screen)

    const [command, commandArgs] = isFlatpak()
      ? flatpakOverlayCommand(scriptPath, envVars, screen)
      : ['env', [...envVars, ...args]]
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true
    })
    const errors: string[] = []
    child.stderr?.on('data', (chunk: Buffer) => {
      errors.push(...chunk.toString('utf8').split('\n').filter(Boolean))
      if (errors.length > STDERR_LINES) errors.splice(0, errors.length - STDERR_LINES)
    })
    child.on('exit', (code, signal) => {
      const mine = overlayProcesses.includes(child)
      overlayProcesses = overlayProcesses.filter((p) => p !== child)
      if (mine && errors.some((line) => line.includes('failed to dlopen libwayland'))) {
        startFailure = { problem: 'failed', detail: errors.join('\n'), command: withWaylandDev(PACKAGES[hostDistro()]) }
        return
      }
      if (!mine || signal || code === 0 || code === null) return
      if (code === EXIT_NO_MONITOR) return
      if (code === EXIT_MONITORS_CHANGED) {
        clearTimeout(restartTimer)
        restartTimer = setTimeout(() => {
          if (getDesktopIconsEnabled()) startDesktopIconsOverlay()
        }, 500)
        return
      }
      const detail = errors.join('\n')
      console.error(`[DesktopIcons] Overlay for ${screen ?? 'default screen'} exited with ${code}: ${detail}`)
      startFailure = { problem: code === EXIT_MISSING_MODULES ? 'missing-modules' : 'failed', detail }
      if (code === EXIT_NO_LAYER_SHELL) startFailure.detail = detail || 'the compositor has no layer-shell'
    })
    child.unref()
    overlayProcesses.push(child)
  }

  console.log(`[DesktopIcons] Started ${targets.length} overlay(s)`)
}

export function stopDesktopIconsOverlay(): void {
  for (const child of overlayProcesses) {
    try {
      child.kill('SIGTERM')
    } catch {
    }
  }
  overlayProcesses = []
}

export function setDesktopIconsEnabled(enabled: boolean): void {
  store.set('desktopIconsEnabled', enabled)
  if (enabled) {
    startDesktopIconsOverlay()
  } else {
    startFailure = null
    stopDesktopIconsOverlay()
  }
}

/** The engine and the overlay share the bottom layer and the later surface is drawn on top, so the overlay has to map after the wallpaper */
export function raiseDesktopIconsOverlay(): void {
  if (getDesktopIconsEnabled()) startDesktopIconsOverlay()
}

export function getDesktopIconsEnabled(): boolean {
  return store.get('desktopIconsEnabled', false)
}

export function initDesktopIcons(): void {
  onLweLaunched(raiseDesktopIconsOverlay)
  if (getDesktopIconsEnabled()) {
    startDesktopIconsOverlay()
  }
}

export function cleanupDesktopIcons(): void {
  stopDesktopIconsOverlay()
}
