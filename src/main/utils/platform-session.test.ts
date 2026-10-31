import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execSync = vi.fn<(command: string, options?: Record<string, unknown>) => string>()
vi.mock('child_process', () => ({
  execSync: (command: string, options?: Record<string, unknown>) => execSync(command, options),
  execFileSync: (file: string, args: string[], options?: Record<string, unknown>) => execSync([file, ...args].join(' '), options)
}))

const platform = await import('./platform')

const SESSION_VARIABLES = ['WAYLAND_DISPLAY', 'DISPLAY', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'XDG_RUNTIME_DIR', 'APPIMAGE', 'APPDIR',
  'HYPRLAND_INSTANCE_SIGNATURE', 'SWAYSOCK', 'NIRI_SOCKET']

function clearSession(): void {
  for (const name of SESSION_VARIABLES) vi.stubEnv(name, '')
}

function answer(answers: Record<string, string>): void {
  execSync.mockImplementation((command: string) => {
    const known = Object.keys(answers).find((name) => command.includes(name))
    if (!known) throw new Error(`${command}: not found`)
    return answers[known]
  })
}

function asPlatform(name: NodeJS.Platform): void {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(name)
}

beforeEach(clearSession)

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  execSync.mockReset()
})

describe('detectDisplayServer', () => {
  it('prefers Wayland over X11 and knows when there is neither', () => {
    expect(platform.detectDisplayServer()).toBe('unknown')
    vi.stubEnv('DISPLAY', ':0')
    expect(platform.detectDisplayServer()).toBe('x11')
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-0')
    expect(platform.detectDisplayServer()).toBe('wayland')
  })

  it('does not guess on other systems', () => {
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-0')
    asPlatform('win32')
    expect(platform.detectDisplayServer()).toBe('unknown')
    asPlatform('darwin')
    expect(platform.detectDisplayServer()).toBe('unknown')
  })
})

describe('detectDesktopEnv', () => {
  it('reads XDG_CURRENT_DESKTOP, then the compositor markers', () => {
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'KDE')
    expect(platform.detectDesktopEnv()).toBe('kde')
    vi.stubEnv('XDG_CURRENT_DESKTOP', '')
    vi.stubEnv('SWAYSOCK', '/run/sway.sock')
    expect(platform.detectDesktopEnv()).toBe('sway')
  })

  it('is other on systems without these desktops', () => {
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'KDE')
    asPlatform('win32')
    expect(platform.detectDesktopEnv()).toBe('other')
    asPlatform('darwin')
    expect(platform.detectDesktopEnv()).toBe('other')
  })
})

describe('runningAppImage', () => {
  it('needs both variables and the executable inside the mount', () => {
    vi.stubEnv('APPIMAGE', '/home/u/WE.AppImage')
    vi.stubEnv('APPDIR', '/tmp/.mount_x')
    expect(platform.runningAppImage()).toBeUndefined()
    vi.stubEnv('APPDIR', path.dirname(process.execPath))
    expect(platform.runningAppImage()).toBe('/home/u/WE.AppImage')
    vi.stubEnv('APPIMAGE', '')
    expect(platform.runningAppImage()).toBeUndefined()
    vi.stubEnv('APPIMAGE', '/home/u/WE.AppImage')
    vi.stubEnv('APPDIR', '')
    expect(platform.runningAppImage()).toBeUndefined()
  })
})

describe('Wayland session detection', () => {
  it('counts WAYLAND_DISPLAY and the session type', () => {
    expect(platform.isWaylandSession()).toBe(false)
    vi.stubEnv('XDG_SESSION_TYPE', 'x11')
    expect(platform.isWaylandSession()).toBe(false)
    vi.stubEnv('XDG_SESSION_TYPE', 'wayland')
    expect(platform.isWaylandSession()).toBe(true)
    vi.stubEnv('XDG_SESSION_TYPE', '')
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-3')
    expect(platform.isWaylandSession()).toBe(true)
  })

  it('takes the display from the environment first', () => {
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-3')
    expect(platform.getWaylandDisplay()).toBe('wayland-3')
    expect(execSync).not.toHaveBeenCalled()
  })

  it('assumes wayland-0 for a Wayland session under XWayland', () => {
    vi.stubEnv('XDG_SESSION_TYPE', 'wayland')
    expect(platform.getWaylandDisplay()).toBe('wayland-0')
    expect(execSync).not.toHaveBeenCalled()
  })

  it('asks loginctl as the last resort', () => {
    execSync.mockReturnValue('wayland\n')
    expect(platform.getWaylandDisplay()).toBe('wayland-0')
    expect(execSync.mock.calls[0][0]).toContain('loginctl show-session')
    expect(execSync.mock.calls[0][1]).toEqual({ encoding: 'utf8', timeout: 3000 })
    execSync.mockReturnValue('x11\n')
    expect(platform.getWaylandDisplay()).toBeUndefined()
    execSync.mockImplementation(() => {
      throw new Error('no loginctl')
    })
    expect(platform.getWaylandDisplay()).toBeUndefined()
  })
})

describe('getXdgRuntimeDir', () => {
  it('uses the variable, else the per-user folder', () => {
    vi.stubEnv('XDG_RUNTIME_DIR', '/run/custom')
    expect(platform.getXdgRuntimeDir()).toBe('/run/custom')
    vi.stubEnv('XDG_RUNTIME_DIR', '')
    expect(platform.getXdgRuntimeDir()).toBe(`/run/user/${process.getuid?.() ?? 1000}`)
  })
})

describe.skipIf(process.platform !== 'linux')('getMirroredScreens', () => {
  const kscreen = JSON.stringify({ outputs: [{ name: 'DP-1', replicationSource: 0 }, { name: 'HDMI-A-1', replicationSource: 1 }] })

  it('asks kscreen-doctor in a Plasma Wayland session', () => {
    vi.stubEnv('XDG_SESSION_TYPE', 'wayland')
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'KDE')
    answer({ 'kscreen-doctor -j': kscreen })
    expect(platform.getMirroredScreens()).toEqual(['HDMI-A-1'])
    expect(execSync.mock.calls[0][1]).toEqual({ encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
  })

  it('stays out of other sessions and survives a failing tool', () => {
    answer({ 'kscreen-doctor -j': kscreen })
    expect(platform.getMirroredScreens()).toEqual([])
    vi.stubEnv('XDG_SESSION_TYPE', 'wayland')
    expect(platform.getMirroredScreens()).toEqual([])
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'KDE')
    answer({})
    expect(platform.getMirroredScreens()).toEqual([])
    asPlatform('darwin')
    answer({ 'kscreen-doctor -j': kscreen })
    expect(platform.getMirroredScreens()).toEqual([])
  })
})

describe.skipIf(process.platform !== 'linux')('getConnectedScreens beyond the compositor tools', () => {
  it('reads kscreen-doctor, stripping its colours', () => {
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-0')
    answer({ 'kscreen-doctor --outputs': '\x1b[01;32mOutput: \x1b[0m1 DP-1 enabled\nOutput: 2 HDMI-A-1 enabled\nnoise\n' })
    expect(platform.getConnectedScreens()).toEqual(['DP-1', 'HDMI-A-1'])
  })

  it('reads the connectors out of GNOME\'s display state', () => {
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-0')
    answer({ gdbus: "(uint32 4, [(('DP-1', 'DEL', 'U2720Q', '123'), [], {}), (('eDP-1', 'AUO', 'x', 'y'), [], {})], [], {})" })
    expect(platform.getConnectedScreens()).toEqual(['DP-1', 'eDP-1'])
  })

  it('lists a connector once even when GNOME names it twice', () => {
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-0')
    answer({ gdbus: "(('DP-1', 'A', 'B', 'C'), []), (('DP-1', 'A', 'B', 'C'), [])" })
    expect(platform.getConnectedScreens()).toEqual(['DP-1'])
  })

  it('falls back to xrandr, also in a plain X11 session', () => {
    const xrandr = 'Screen 0: minimum 8 x 8\nDP-1 connected primary 1920x1080+0+0\nHDMI-1 disconnected\nHDMI-2 connected 1280x720+1920+0\n'
    answer({ 'xrandr --query': xrandr })
    expect(platform.getConnectedScreens()).toEqual(['DP-1', 'HDMI-2'])
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-0')
    expect(platform.getConnectedScreens()).toEqual(['DP-1', 'HDMI-2'])
  })

  it('has nothing without any tool, and nothing off Linux', () => {
    answer({})
    expect(platform.getConnectedScreens()).toEqual([])
    asPlatform('win32')
    answer({ 'xrandr --query': 'DP-1 connected\n' })
    expect(platform.getConnectedScreens()).toEqual([])
  })

  it('goes on to the next tool when one prints no outputs', () => {
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-0')
    answer({ 'wlr-randr': '  indented only\n', 'kscreen-doctor --outputs': 'Output: 1 DP-1\n' })
    expect(platform.getConnectedScreens()).toEqual(['DP-1'])
  })
})

describe('getScreenGeometry', () => {
  const xrandr = 'DP-1 connected primary 2560x1440+1920+0\nHDMI-1 connected 1920x1080+0+0\n'

  it('gives the named screen, else the first one', () => {
    answer({ xrandr })
    expect(platform.getScreenGeometry('HDMI-1')).toBe('0x0x1920x1080')
    expect(platform.getScreenGeometry('missing')).toBe('1920x0x2560x1440')
    expect(platform.getScreenGeometry()).toBe('1920x0x2560x1440')
  })

  it('is null without a screen or a tool', () => {
    answer({ xrandr: 'nothing here\n' })
    expect(platform.getScreenGeometry()).toBeNull()
    answer({})
    expect(platform.getScreenGeometry('DP-1')).toBeNull()
  })
})

describe('parsers on edge input', () => {
  it('ignores xrandr lines that are not an output geometry', () => {
    expect([...platform.parseXrandrGeometries('DP-1 connected 1920x1080\n  1920x1080 60.00*\n')]).toEqual([])
  })

  it('reads a gdbus answer with spaces and nothing else', () => {
    expect(platform.parseNameHasOwner('(true,)')).toBe(true)
    expect(platform.parseNameHasOwner('( false ,)')).toBe(false)
    expect(platform.parseNameHasOwner('b  true')).toBe(true)
    expect(platform.parseNameHasOwner('b trueish')).toBeNull()
    expect(platform.parseNameHasOwner('x true')).toBeNull()
  })

  it('treats a kscreen answer without outputs or names as empty', () => {
    expect(platform.parseKscreenMirrors(JSON.stringify({ outputs: [{ replicationSource: 3 }, { name: '', replicationSource: 3 }] }))).toEqual([])
  })

  it('keeps a niri output whose current_mode is missing from the report', () => {
    expect(platform.parseNiriOutputs('{"a":{"current_mode":null},"b":{}}')).toEqual(['b'])
    expect(platform.parseNiriOutputs('[1]')).toEqual([])
    expect(platform.parseNiriOutputs('null')).toEqual([])
  })

  it('skips entries without a name in monitor lists', () => {
    expect(platform.parseHyprctlMonitors('[null, {"name":""}, {"name":3}, {"name":"A"}]')).toEqual(['A'])
    expect(platform.parseSwayOutputs('[null, {"name":""}, {"name":"B","active":false}, {"name":"C"}]')).toEqual(['C'])
  })
})

describe.skipIf(process.platform !== 'linux')('isCommandAvailable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-path-'))
  const tool = `tool-${process.pid}`

  afterEach(() => { platform.invalidateCommandCache(tool) })

  it('searches PATH for an executable file and remembers the answer', () => {
    vi.stubEnv('PATH', dir)
    expect(platform.isCommandAvailable(tool)).toBe(false)
    fs.writeFileSync(path.join(dir, tool), '#!/bin/sh\n', { mode: 0o755 })
    expect(platform.isCommandAvailable(tool)).toBe(false)
    platform.invalidateCommandCache(tool)
    expect(platform.isCommandAvailable(tool)).toBe(true)
    fs.rmSync(path.join(dir, tool))
    expect(platform.isCommandAvailable(tool)).toBe(true)
    platform.invalidateCommandCache(tool)
    expect(platform.isCommandAvailable(tool)).toBe(false)
  })

  it('does not count a file that is not executable', () => {
    vi.stubEnv('PATH', dir)
    fs.writeFileSync(path.join(dir, tool), 'data', { mode: 0o644 })
    expect(platform.isCommandAvailable(tool)).toBe(false)
    fs.rmSync(path.join(dir, tool))
  })

  it('has no command to find on an empty PATH', () => {
    vi.stubEnv('PATH', '')
    expect(platform.isCommandAvailable(tool)).toBe(false)
  })

  it('asks where(1) on Windows', () => {
    asPlatform('win32')
    answer({ 'where wintool': '' })
    expect(platform.isCommandAvailable('wintool')).toBe(true)
    answer({})
    expect(platform.isCommandAvailable('othertool')).toBe(false)
    platform.invalidateCommandCache('wintool')
    platform.invalidateCommandCache('othertool')
  })
})

describe('whichCommand', () => {
  it('returns the trimmed path of the program', () => {
    answer({ 'which git': '/usr/bin/git\n' })
    expect(platform.whichCommand('git')).toBe('/usr/bin/git')
    expect(execSync.mock.calls[0][0]).toBe('which git')
  })

  it('uses where(1) on Windows and gives undefined when nothing is found', () => {
    asPlatform('win32')
    answer({ 'where git': 'C:\\git.exe\r\n' })
    expect(platform.whichCommand('git')).toBe('C:\\git.exe')
    answer({})
    expect(platform.whichCommand('git')).toBeUndefined()
  })
})
