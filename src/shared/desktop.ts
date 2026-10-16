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

/** layer-shell compositors without a desktop shell */
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

/** Compositor startup line, null when the session runs ~/.config/autostart itself */

export function compositorAutostartLine(env: DesktopEnvironment, launch: string | string[]): string | null {
  if (!isWlrootsStyle(env)) return null
  const words = [...(typeof launch === 'string' ? [launch] : launch), '--minimized']
  const command = words.map(shellWord).join(' ')
  if (env === 'hyprland') return `exec-once = ${command}`
  if (env === 'sway') return `exec ${command}`
  if (env === 'niri') return `spawn-at-startup ${words.map(kdlString).join(' ')}`
  return command
}
