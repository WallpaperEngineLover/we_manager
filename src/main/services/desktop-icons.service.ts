import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import Store from 'electron-store'
import { app } from 'electron'
import { getConnectedScreens, getWaylandDisplay, getXdgRuntimeDir } from '../utils/platform'
import { isFlatpak } from '../utils/flatpak'

interface DesktopIconsStoreSchema {
  desktopIconsEnabled: boolean
}

const store = new Store<DesktopIconsStoreSchema>({
  defaults: { desktopIconsEnabled: false }
})

let overlayProcesses: ChildProcess[] = []

function getOverlayScriptPath(): string {
  // In dev: __dirname is out/main, project root is two levels up
  // In prod: script is copied to resources/
  const candidates = [
    path.join(__dirname, '..', '..', 'src', 'main', 'services', 'desktop-icons-overlay.py'),
    path.join(process.resourcesPath ?? '', 'desktop-icons-overlay.py'),
    // Fallback: next to compiled output
    path.join(__dirname, 'desktop-icons-overlay.py')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

const LAYER_SHELL_LIBS = [
  '/usr/lib64/libgtk4-layer-shell.so',
  '/usr/lib/libgtk4-layer-shell.so',
  '/usr/lib/x86_64-linux-gnu/libgtk4-layer-shell.so'
]

function findLayerShellLib(): string {
  return LAYER_SHELL_LIBS.find((p) => fs.existsSync(p)) ?? LAYER_SHELL_LIBS[0]
}

/** The overlay needs the host's Python, GTK4 and gtk4-layer-shell, so it runs on the host from a copy of the script */
function flatpakOverlayCommand(scriptPath: string, envVars: string[], screen?: string): [string, string[]] {
  const hostScript = path.join(app.getPath('userData'), 'desktop-icons-overlay.py')
  fs.copyFileSync(scriptPath, hostScript)
  const findLib = `for lib in ${LAYER_SHELL_LIBS.join(' ')}; do [ -e "$lib" ] && export LD_PRELOAD="$lib" && break; done`
  const args = ['--host', ...envVars.filter((v) => !v.startsWith('LD_PRELOAD=')).map((v) => `--env=${v}`),
    'sh', '-c', `${findLib}; exec python3 "$@"`, 'sh', hostScript]
  if (screen) args.push(screen)
  return ['flatpak-spawn', args]
}

/** Env vars for the overlay; Electron runs under XWayland so the Wayland env must be passed explicitly. */
function buildOverlayEnvVars(): string[] {
  const vars: string[] = []

  vars.push(`LD_PRELOAD=${findLayerShellLib()}`)

  // Force GTK4 onto the Wayland backend (layer-shell does not work under X11)
  vars.push('GDK_BACKEND=wayland')

  const waylandDisplay = getWaylandDisplay()
  if (waylandDisplay) vars.push(`WAYLAND_DISPLAY=${waylandDisplay}`)

  // XDG_RUNTIME_DIR is needed for the Wayland socket
  vars.push(`XDG_RUNTIME_DIR=${getXdgRuntimeDir()}`)

  // DISPLAY for the XWayland fallback
  if (process.env.DISPLAY) vars.push(`DISPLAY=${process.env.DISPLAY}`)

  return vars
}

export function startDesktopIconsOverlay(): void {
  stopDesktopIconsOverlay()

  const scriptPath = getOverlayScriptPath()
  if (!fs.existsSync(scriptPath)) {
    console.error('[DesktopIcons] Overlay script not found:', scriptPath)
    return
  }

  const envVars = buildOverlayEnvVars()
  const screens = getConnectedScreens()

  const targets = screens.length > 0 ? screens : [undefined]
  for (const screen of targets) {
    const args = ['python3', scriptPath]
    if (screen) args.push(screen)

    const [command, commandArgs] = isFlatpak()
      ? flatpakOverlayCommand(scriptPath, envVars, screen)
      : ['env', [...envVars, ...args]]
    const child = spawn(command, commandArgs, {
      stdio: 'ignore',
      detached: true
    })
    child.on('exit', () => {
      overlayProcesses = overlayProcesses.filter((p) => p !== child)
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
      /* already dead */
    }
  }
  overlayProcesses = []
}

export function setDesktopIconsEnabled(enabled: boolean): void {
  store.set('desktopIconsEnabled', enabled)
  if (enabled) {
    startDesktopIconsOverlay()
  } else {
    stopDesktopIconsOverlay()
  }
}

export function getDesktopIconsEnabled(): boolean {
  return store.get('desktopIconsEnabled', false)
}

/** Call on app startup to restore overlay if it was enabled. */
export function initDesktopIcons(): void {
  if (getDesktopIconsEnabled()) {
    startDesktopIconsOverlay()
  }
}

export function cleanupDesktopIcons(): void {
  stopDesktopIconsOverlay()
}
