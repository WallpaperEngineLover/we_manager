import { execSync } from 'child_process'

export type DisplayServer = 'wayland' | 'x11' | 'unknown'
export type DesktopEnvironment = 'gnome' | 'kde' | 'hyprland' | 'sway' | 'other'

export function detectDisplayServer(): DisplayServer {
  if (process.platform === 'win32' || process.platform === 'darwin') return 'unknown'
  if (process.env.WAYLAND_DISPLAY) return 'wayland'
  if (process.env.DISPLAY) return 'x11'
  return 'unknown'
}

export function detectDesktopEnv(): DesktopEnvironment {
  if (process.platform === 'win32' || process.platform === 'darwin') return 'other'
  const xdg = (process.env.XDG_CURRENT_DESKTOP ?? '').toLowerCase()
  if (xdg.includes('gnome')) return 'gnome'
  if (xdg.includes('kde')) return 'kde'
  if (xdg.includes('hyprland')) return 'hyprland'
  if (xdg.includes('sway')) return 'sway'
  return 'other'
}

/** Detect connected screen/output names for use with linux-wallpaperengine --screen-root. */
export function getConnectedScreens(): string[] {
  if (process.platform !== 'linux') return []

  const isWayland = !!process.env.WAYLAND_DISPLAY

  // On Wayland, we MUST use native Wayland output names (not xrandr/XWayland names)
  if (isWayland) {
    // wlr-randr (wlroots compositors: hyprland, sway, etc.)
    try {
      const output = execSync('wlr-randr 2>/dev/null', { encoding: 'utf8', timeout: 5000 })
      const screens = output
        .split('\n')
        .filter(line => /^[A-Za-z]/.test(line) && !line.startsWith(' '))
        .map(line => line.split(/\s+/)[0])
        .filter(Boolean)
      if (screens.length > 0) return screens
    } catch { /* not available */ }

    // KDE Plasma Wayland: kscreen-doctor
    try {
      const output = execSync('kscreen-doctor --outputs 2>/dev/null', { encoding: 'utf8', timeout: 5000 })
      const screens = output
        .split('\n')
        .map(line => {
          const m = line.match(/Output:\s+\d+\s+(\S+)/)
          return m ? m[1] : null
        })
        .filter((s): s is string => s !== null)
      if (screens.length > 0) return screens
    } catch { /* not available */ }

    // GNOME Wayland: gnome-randr or mutter output names via gdbus
    try {
      const output = execSync(
        "gdbus call --session --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig --method org.gnome.Mutter.DisplayConfig.GetCurrentState 2>/dev/null",
        { encoding: 'utf8', timeout: 5000 }
      )
      const screens = [...output.matchAll(/connector:\s*'([^']+)'/gi)].map(m => m[1])
      if (screens.length > 0) return screens
    } catch { /* not available */ }
  }

  // X11: use xrandr
  try {
    const output = execSync('xrandr --query 2>/dev/null', { encoding: 'utf8', timeout: 5000 })
    const screens = output
      .split('\n')
      .filter(line => / connected/i.test(line))
      .map(line => line.split(/\s+/)[0])
      .filter(Boolean)
    if (screens.length > 0) return screens
  } catch { /* xrandr not available */ }

  return []
}

// Cache results so we only call which/where once per session
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
