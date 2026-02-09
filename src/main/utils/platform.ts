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
