import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import Store from 'electron-store'
import { getConnectedScreens } from '../utils/platform'

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
    // Dev: source tree
    path.join(__dirname, '..', '..', 'src', 'main', 'services', 'desktop-icons-overlay.py'),
    // Prod: bundled in resources
    path.join(process.resourcesPath ?? '', 'desktop-icons-overlay.py'),
    // Fallback: next to compiled output
    path.join(__dirname, 'desktop-icons-overlay.py')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

function findLayerShellLib(): string {
  const candidates = [
    '/usr/lib64/libgtk4-layer-shell.so',
    '/usr/lib/libgtk4-layer-shell.so',
    '/usr/lib/x86_64-linux-gnu/libgtk4-layer-shell.so'
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]
}

/** Build env vars for the overlay — Electron runs under XWayland so we must pass Wayland env explicitly. */
function buildOverlayEnvVars(): string[] {
  const vars: string[] = []

  vars.push(`LD_PRELOAD=${findLayerShellLib()}`)

  // Force GTK4 to use Wayland backend (otherwise it falls back to X11 where layer-shell doesn't work)
  vars.push('GDK_BACKEND=wayland')

  // Wayland display — Electron often lacks this since it runs under XWayland
  const waylandDisplay = process.env.WAYLAND_DISPLAY
    || (process.env.XDG_SESSION_TYPE === 'wayland' ? 'wayland-0' : undefined)
  if (waylandDisplay) vars.push(`WAYLAND_DISPLAY=${waylandDisplay}`)

  // XDG_RUNTIME_DIR is needed for the Wayland socket
  const xdgRuntime = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`
  vars.push(`XDG_RUNTIME_DIR=${xdgRuntime}`)

  // Pass DISPLAY through for XWayland fallback
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

  // Spawn one overlay per screen
  const targets = screens.length > 0 ? screens : [undefined]
  for (const screen of targets) {
    const args = ['python3', scriptPath]
    if (screen) args.push(screen)

    const child = spawn('env', [...envVars, ...args], {
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

/** Call on app quit to clean up overlay processes. */
export function cleanupDesktopIcons(): void {
  stopDesktopIconsOverlay()
}
