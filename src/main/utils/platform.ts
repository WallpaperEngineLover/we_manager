import { execSync } from 'child_process'
import { parseDesktopEnv, type DesktopEnvironment } from '@shared/desktop'
import { hostShell } from './flatpak'

export type DisplayServer = 'wayland' | 'x11' | 'unknown'
export type { DesktopEnvironment }

export function detectDisplayServer(): DisplayServer {
  if (process.platform === 'win32' || process.platform === 'darwin') return 'unknown'
  if (process.env.WAYLAND_DISPLAY) return 'wayland'
  if (process.env.DISPLAY) return 'x11'
  return 'unknown'
}

export function detectDesktopEnv(): DesktopEnvironment {
  if (process.platform === 'win32' || process.platform === 'darwin') return 'other'
  return parseDesktopEnv(process.env.XDG_CURRENT_DESKTOP, process.env)
}

/** children of an AppImage inherit APPIMAGE and APPDIR too */
export function runningAppImage(): string | undefined {
  const { APPIMAGE, APPDIR } = process.env
  return APPIMAGE && APPDIR && process.execPath.startsWith(APPDIR) ? APPIMAGE : undefined
}

/** Electron often runs under XWayland without WAYLAND_DISPLAY, so the session type counts too. */
export function isWaylandSession(): boolean {
  return !!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland'
}

/**
 * WAYLAND_DISPLAY of the user session. Electron often runs under XWayland
 * without it set, so fall back to the session type and loginctl.
 */
export function getWaylandDisplay(): string | undefined {
  if (process.env.WAYLAND_DISPLAY) return process.env.WAYLAND_DISPLAY
  if (process.env.XDG_SESSION_TYPE === 'wayland') return 'wayland-0'

  try {
    const sessionType = execSync(
      'loginctl show-session $(loginctl 2>/dev/null | grep $USER | head -1 | awk \'{print $1}\') -p Type --value 2>/dev/null',
      { encoding: 'utf8', timeout: 3000 }
    ).trim()
    if (sessionType === 'wayland') return 'wayland-0'
  } catch { }

  return undefined
}

export function getXdgRuntimeDir(): string {
  return process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`
}

function parseJson(output: string): unknown {
  try {
    return JSON.parse(output)
  } catch {
    return null
  }
}

/** `hyprctl monitors -j`: an array of monitors, a disabled one has no output to draw on */
export function parseHyprctlMonitors(output: string): string[] {
  const monitors = parseJson(output)
  if (!Array.isArray(monitors)) return []
  return monitors
    .filter(m => m && typeof m.name === 'string' && m.name && m.disabled !== true)
    .map(m => m.name)
}

/** `swaymsg -t get_outputs -r`: an array of outputs, inactive ones are switched off */
export function parseSwayOutputs(output: string): string[] {
  const outputs = parseJson(output)
  if (!Array.isArray(outputs)) return []
  return outputs
    .filter(o => o && typeof o.name === 'string' && o.name && o.active !== false)
    .map(o => o.name)
}

/** `niri msg --json outputs`: an object keyed by output name, a disabled one has no current mode */
export function parseNiriOutputs(output: string): string[] {
  const outputs = parseJson(output)
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return []
  return Object.entries(outputs)
    .filter(([, o]) => (o as { current_mode?: unknown } | null)?.current_mode !== null)
    .map(([name]) => name)
}

const COMPOSITOR_QUERIES: { marker: string; command: string; parse: (output: string) => string[] }[] = [
  { marker: 'HYPRLAND_INSTANCE_SIGNATURE', command: 'hyprctl monitors -j', parse: parseHyprctlMonitors },
  { marker: 'SWAYSOCK', command: 'swaymsg -t get_outputs -r', parse: parseSwayOutputs },
  { marker: 'NIRI_SOCKET', command: 'niri msg --json outputs', parse: parseNiriOutputs }
]

export function getConnectedScreens(): string[] {
  if (process.platform !== 'linux') return []

  // On Wayland, we MUST use native Wayland output names (not xrandr/XWayland names)
  if (isWaylandSession()) {
    // the compositor's own IPC knows which outputs are enabled
    for (const { marker, command, parse } of COMPOSITOR_QUERIES) {
      if (!process.env[marker]) continue
      try {
        const output = execSync(hostShell(`${command} 2>/dev/null`), { encoding: 'utf8', timeout: 5000 })
        const screens = parse(output)
        if (screens.length > 0) return screens
      } catch { }
    }

    try {
      const output = execSync(hostShell('wlr-randr 2>/dev/null'), { encoding: 'utf8', timeout: 5000 })
      const screens = output
        .split('\n')
        .filter(line => /^[A-Za-z]/.test(line) && !line.startsWith(' '))
        .map(line => line.split(/\s+/)[0])
        .filter(Boolean)
      if (screens.length > 0) return screens
    } catch { }

    try {
      const output = execSync(hostShell('kscreen-doctor --outputs 2>/dev/null'), { encoding: 'utf8', timeout: 5000 })
      const clean = output.replace(/\x1b\[[0-9;]*m/g, '')
      const screens = clean
        .split('\n')
        .map(line => {
          const m = line.match(/Output:\s+\d+\s+(\S+)/)
          return m ? m[1] : null
        })
        .filter((s): s is string => s !== null)
      if (screens.length > 0) return screens
    } catch { }

    try {
      const output = execSync(
        hostShell("gdbus call --session --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig --method org.gnome.Mutter.DisplayConfig.GetCurrentState 2>/dev/null"),
        { encoding: 'utf8', timeout: 5000 }
      )
      const screens = [...output.matchAll(/connector:\s*'([^']+)'/gi)].map(m => m[1])
      if (screens.length > 0) return screens
    } catch { }
  }

  try {
    const output = execSync(hostShell('xrandr --query 2>/dev/null'), { encoding: 'utf8', timeout: 5000 })
    const screens = output
      .split('\n')
      .filter(line => / connected/i.test(line))
      .map(line => line.split(/\s+/)[0])
      .filter(Boolean)
    if (screens.length > 0) return screens
  } catch { }

  return []
}

/** `NAME connected [primary] WxH+X+Y` lines of xrandr, as the engine's XxYxWxH */
export function parseXrandrGeometries(output: string): Map<string, string> {
  const geometries = new Map<string, string>()
  for (const line of output.split('\n')) {
    const m = line.match(/^(\S+) connected (?:primary )?(\d+)x(\d+)\+(\d+)\+(\d+)/)
    if (m) geometries.set(m[1], `${m[4]}x${m[5]}x${m[2]}x${m[3]}`)
  }
  return geometries
}

/** Geometry of the named screen, else of the first one */
export function getScreenGeometry(screen?: string): string | null {
  try {
    const output = execSync(hostShell('xrandr --query 2>/dev/null'), { encoding: 'utf8', timeout: 5000 })
    const geometries = parseXrandrGeometries(output)
    return (screen && geometries.get(screen)) || geometries.values().next().value || null
  } catch {
    return null
  }
}

/** Answer of a NameHasOwner call, from busctl (`b true`) or gdbus (`(true,)`), null when it is neither */
export function parseNameHasOwner(output: string): boolean | null {
  const m = output.trim().match(/^(?:b\s+|\(\s*)(true|false)\b/)
  return m ? m[1] === 'true' : null
}

const NAME_HAS_OWNER_COMMANDS = [
  'busctl --user call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus NameHasOwner s org.kde.StatusNotifierWatcher',
  'gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.kde.StatusNotifierWatcher'
]

const TRAY_HOST_CACHE_MS = 15_000
let trayHostCache: { value: boolean; at: number } | null = null

/**
 * Whether something on the session bus can show a StatusNotifier icon. Without one a window hidden
 * to the tray has no way back. Assumes yes when neither busctl nor gdbus can tell.
 */
export function hasStatusNotifierHost(maxAgeMs = TRAY_HOST_CACHE_MS): boolean {
  if (process.platform !== 'linux') return true
  if (trayHostCache && Date.now() - trayHostCache.at < maxAgeMs) return trayHostCache.value

  let value = true
  for (const command of NAME_HAS_OWNER_COMMANDS) {
    try {
      const output = execSync(hostShell(`${command} 2>/dev/null`), { encoding: 'utf8', timeout: 2000 })
      const owned = parseNameHasOwner(output)
      if (owned !== null) {
        value = owned
        break
      }
    } catch { }
  }
  trayHostCache = { value, at: Date.now() }
  return value
}

const commandCache = new Map<string, boolean>()

export function isCommandAvailable(cmd: string): boolean {
  if (commandCache.has(cmd)) return commandCache.get(cmd)!
  try {
    const checker = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
    execSync(checker, { stdio: 'ignore' })
    commandCache.set(cmd, true)
    return true
  } catch {
    commandCache.set(cmd, false)
    return false
  }
}

export function invalidateCommandCache(cmd: string): void {
  commandCache.delete(cmd)
}

export function whichCommand(cmd: string): string | undefined {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which'
    return execSync(`${checker} ${cmd}`, { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}
