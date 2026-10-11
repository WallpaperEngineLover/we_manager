import { describe, expect, it } from 'vitest'
import { compositorAutostartLine, isWlrootsStyle, parseDesktopEnv } from './desktop'

describe('parseDesktopEnv', () => {
  it('knows the desktops by XDG_CURRENT_DESKTOP', () => {
    expect(parseDesktopEnv('GNOME')).toBe('gnome')
    expect(parseDesktopEnv('ubuntu:GNOME')).toBe('gnome')
    expect(parseDesktopEnv('KDE')).toBe('kde')
    expect(parseDesktopEnv('COSMIC')).toBe('cosmic')
    expect(parseDesktopEnv('Hyprland')).toBe('hyprland')
    expect(parseDesktopEnv('sway')).toBe('sway')
    expect(parseDesktopEnv('niri')).toBe('niri')
    expect(parseDesktopEnv('river')).toBe('river')
    expect(parseDesktopEnv('labwc:wlroots')).toBe('labwc')
    expect(parseDesktopEnv('Wayfire')).toBe('wayfire')
    expect(parseDesktopEnv('X-Cinnamon')).toBe('other')
    expect(parseDesktopEnv(undefined)).toBe('other')
  })

  it('falls back to the compositor sockets when the name is missing', () => {
    expect(parseDesktopEnv(undefined, { HYPRLAND_INSTANCE_SIGNATURE: 'abc' })).toBe('hyprland')
    expect(parseDesktopEnv('', { SWAYSOCK: '/run/user/1000/sway-ipc.sock' })).toBe('sway')
    expect(parseDesktopEnv(undefined, { NIRI_SOCKET: '/run/user/1000/niri.sock' })).toBe('niri')
    expect(parseDesktopEnv('KDE', { NIRI_SOCKET: '/run/user/1000/niri.sock' })).toBe('kde')
    expect(parseDesktopEnv(undefined, { SWAYSOCK: '' })).toBe('other')
  })
})

describe('isWlrootsStyle', () => {
  it('covers the layer-shell compositors without a shell of their own', () => {
    for (const env of ['hyprland', 'sway', 'niri', 'river', 'labwc', 'wayfire'] as const) {
      expect(isWlrootsStyle(env)).toBe(true)
    }
    for (const env of ['gnome', 'kde', 'cosmic', 'other'] as const) {
      expect(isWlrootsStyle(env)).toBe(false)
    }
  })
})

describe('compositorAutostartLine', () => {
  const exe = '/opt/WE Manager/we-manager'

  it('writes the line of each compositor config', () => {
    expect(compositorAutostartLine('hyprland', '/usr/bin/we-manager')).toBe('exec-once = /usr/bin/we-manager --minimized')
    expect(compositorAutostartLine('sway', '/usr/bin/we-manager')).toBe('exec /usr/bin/we-manager --minimized')
    expect(compositorAutostartLine('niri', '/usr/bin/we-manager')).toBe(
      'spawn-at-startup "/usr/bin/we-manager" "--minimized"'
    )
    expect(compositorAutostartLine('river', '/usr/bin/we-manager')).toBe('/usr/bin/we-manager --minimized')
  })

  it('quotes a path with spaces for the shell and for KDL', () => {
    expect(compositorAutostartLine('hyprland', exe)).toBe(`exec-once = '/opt/WE Manager/we-manager' --minimized`)
    expect(compositorAutostartLine('niri', exe)).toBe('spawn-at-startup "/opt/WE Manager/we-manager" "--minimized"')
    expect(compositorAutostartLine('sway', `/home/it's/app.AppImage`)).toBe(
      `exec '/home/it'\\''s/app.AppImage' --minimized`
    )
  })

  it('has nothing for sessions that run the autostart entry themselves', () => {
    expect(compositorAutostartLine('kde', '/usr/bin/we-manager')).toBeNull()
    expect(compositorAutostartLine('gnome', '/usr/bin/we-manager')).toBeNull()
    expect(compositorAutostartLine('cosmic', '/usr/bin/we-manager')).toBeNull()
    expect(compositorAutostartLine('other', '/usr/bin/we-manager')).toBeNull()
  })
})
