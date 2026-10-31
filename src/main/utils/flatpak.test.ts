import { afterEach, describe, expect, it, vi } from 'vitest'

const savedId = process.env.FLATPAK_ID
const SESSION = ['WAYLAND_DISPLAY', 'DISPLAY', 'XDG_CURRENT_DESKTOP', 'XDG_SESSION_TYPE', 'HYPRLAND_INSTANCE_SIGNATURE',
  'SWAYSOCK', 'NIRI_SOCKET']
const savedSession = Object.fromEntries(SESSION.map((name) => [name, process.env[name]]))

async function load(flatpakId?: string): Promise<typeof import('./flatpak')> {
  vi.resetModules()
  if (flatpakId) process.env.FLATPAK_ID = flatpakId
  else delete process.env.FLATPAK_ID
  return import('./flatpak')
}

afterEach(() => {
  if (savedId) process.env.FLATPAK_ID = savedId
  else delete process.env.FLATPAK_ID
  for (const name of SESSION) {
    if (savedSession[name] === undefined) delete process.env[name]
    else process.env[name] = savedSession[name]
  }
})

function setSession(values: Record<string, string>): void {
  for (const name of SESSION) delete process.env[name]
  Object.assign(process.env, values)
}

describe('hostCommand', () => {
  it('runs the program itself outside a Flatpak', async () => {
    const { hostCommand, isFlatpak } = await load()
    expect(isFlatpak()).toBe(false)
    expect(hostCommand('kscreen-doctor', ['--outputs'])).toEqual(['kscreen-doctor', ['--outputs']])
  })

  it('goes through flatpak-spawn inside one', async () => {
    setSession({})
    const { hostCommand, isFlatpak } = await load('io.github.WallpaperEngineLover.we_manager')
    expect(isFlatpak()).toBe(true)
    expect(hostCommand('qdbus', ['org.kde.plasmashell'])).toEqual(['flatpak-spawn', ['--host', 'qdbus', 'org.kde.plasmashell']])
  })
})

describe('session variables for host programs', () => {
  it('passes the session to the host, whose helper may not have it', async () => {
    setSession({ WAYLAND_DISPLAY: 'wayland-1', HYPRLAND_INSTANCE_SIGNATURE: 'abc_1_2', XDG_CURRENT_DESKTOP: 'Hyprland' })
    const { hostCommand } = await load('io.github.WallpaperEngineLover.we_manager')
    expect(hostCommand('hyprctl', ['monitors', '-j'])).toEqual(['flatpak-spawn', ['--host', '--env=WAYLAND_DISPLAY=wayland-1',
      '--env=XDG_CURRENT_DESKTOP=Hyprland', '--env=HYPRLAND_INSTANCE_SIGNATURE=abc_1_2', 'hyprctl', 'monitors', '-j']])
  })

  it("keeps the sandbox's X display away from the host", async () => {
    setSession({ DISPLAY: ':99.0', XDG_SESSION_TYPE: 'x11' })
    const { hostCommand } = await load('io.github.WallpaperEngineLover.we_manager')
    expect(hostCommand('xrandr')).toEqual(['flatpak-spawn', ['--host', '--env=XDG_SESSION_TYPE=x11', 'xrandr']])
  })

  it('leaves them alone outside a Flatpak', async () => {
    setSession({ WAYLAND_DISPLAY: 'wayland-1' })
    const { hostCommand } = await load()
    expect(hostCommand('wlr-randr')).toEqual(['wlr-randr', []])
  })
})

describe('toHostPath', () => {
  it('maps /app through app-path from /.flatpak-info', async () => {
    const { hostAppPath, toHostPath } = await load()
    const appPath = hostAppPath('[Application]\nname=io.x\n\n[Instance]\napp-path=/var/lib/flatpak/app/io.x/x86_64/stable/abc/files\n')
    expect(appPath).toBe('/var/lib/flatpak/app/io.x/x86_64/stable/abc/files')
    expect(toHostPath('/app/bin/gnome-shell-extension', appPath)).toBe('/var/lib/flatpak/app/io.x/x86_64/stable/abc/files/bin/gnome-shell-extension')
    expect(toHostPath('/usr/bin/x', appPath)).toBeUndefined()
  })
})

describe('flatpakInstanceId', () => {
  it('reads the instance id of this run from /.flatpak-info', async () => {
    const { flatpakInstanceId } = await load()
    expect(flatpakInstanceId('[Application]\nname=io.x\n\n[Instance]\ninstance-id=2524426249\napp-path=/a\n')).toBe('2524426249')
    expect(flatpakInstanceId('')).toBeUndefined()
  })
})
