export type DesktopEnvironment =
  | 'gnome'
  | 'kde'
  | 'cosmic'
  | 'hyprland'
  | 'sway'
  | 'niri'
  | 'river'
  | 'labwc'
  | 'wayfire'
  | 'other'

const WLROOTS_STYLE: DesktopEnvironment[] = ['hyprland', 'sway', 'niri', 'river', 'labwc', 'wayfire']

/** Compositors that draw wallpapers through wlr-layer-shell and ship no desktop shell of their own */
export function isWlrootsStyle(env: DesktopEnvironment): boolean {
  return WLROOTS_STYLE.includes(env)
}

const BY_XDG_NAME: [string, DesktopEnvironment][] = [
  ['gnome', 'gnome'],
  ['kde', 'kde'],
  ['cosmic', 'cosmic'],
  ['hyprland', 'hyprland'],
  ['sway', 'sway'],
  ['niri', 'niri'],
  ['river', 'river'],
  ['labwc', 'labwc'],
  ['wayfire', 'wayfire']
]

/** Falls back to the compositor sockets when XDG_CURRENT_DESKTOP is unset */
export function parseDesktopEnv(
  xdgCurrentDesktop: string | undefined,
  env: Record<string, string | undefined> = {}
): DesktopEnvironment {
  const xdg = (xdgCurrentDesktop ?? '').toLowerCase()
  for (const [name, desktop] of BY_XDG_NAME) {
    if (xdg.includes(name)) return desktop
  }
  if (env.HYPRLAND_INSTANCE_SIGNATURE) return 'hyprland'
  if (env.SWAYSOCK) return 'sway'
  if (env.NIRI_SOCKET) return 'niri'
  return 'other'
}

function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`
}

function kdlString(text: string): string {
  return `"${text.replace(/[\\"]/g, '\\$&')}"`
}

/** Line for the compositor config's startup section, null when the session runs ~/.config/autostart itself */
export function compositorAutostartLine(env: DesktopEnvironment, exePath: string): string | null {
  if (!isWlrootsStyle(env)) return null
  const command = `${shellWord(exePath)} --minimized`
  if (env === 'hyprland') return `exec-once = ${command}`
  if (env === 'sway') return `exec ${command}`
  if (env === 'niri') return `spawn-at-startup ${kdlString(exePath)} ${kdlString('--minimized')}`
  return command
}
