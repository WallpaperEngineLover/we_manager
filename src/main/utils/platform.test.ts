import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const execSync = vi.fn<(command: string) => string>()
vi.mock('child_process', () => ({ execSync: (command: string) => execSync(command) }))

const {
  getConnectedScreens,
  hasStatusNotifierHost,
  parseHyprctlMonitors,
  parseKscreenMirrors,
  parseNameHasOwner,
  parseNiriOutputs,
  parseSwayOutputs,
  parseXrandrGeometries
} = await import('./platform')

function answerCommands(answers: Record<string, string>): void {
  execSync.mockImplementation((command: string) => {
    const known = Object.keys(answers).find((name) => command.includes(name))
    if (!known) throw new Error(`${command}: not found`)
    return answers[known]
  })
}

function waylandSession(markers: Record<string, string>): void {
  vi.stubEnv('WAYLAND_DISPLAY', 'wayland-1')
  for (const marker of ['HYPRLAND_INSTANCE_SIGNATURE', 'SWAYSOCK', 'NIRI_SOCKET']) {
    vi.stubEnv(marker, markers[marker] ?? '')
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  execSync.mockReset()
})

describe('parseHyprctlMonitors', () => {
  it('lists the monitor names and skips disabled ones', () => {
    const output = JSON.stringify([
      { id: 0, name: 'DP-1', description: 'Dell U2720Q', width: 3840, height: 2160, disabled: false },
      { id: 1, name: 'HDMI-A-1', width: 1920, height: 1080 },
      { id: 2, name: 'eDP-1', disabled: true }
    ])
    expect(parseHyprctlMonitors(output)).toEqual(['DP-1', 'HDMI-A-1'])
  })

  it('returns nothing for output that is not a monitor list', () => {
    expect(parseHyprctlMonitors('')).toEqual([])
    expect(parseHyprctlMonitors('Couldn\'t connect to the socket')).toEqual([])
    expect(parseHyprctlMonitors('{"name":"DP-1"}')).toEqual([])
    expect(parseHyprctlMonitors('[null, {"id": 3}]')).toEqual([])
  })
})

describe('parseSwayOutputs', () => {
  it('lists the output names and skips inactive ones', () => {
    const output = JSON.stringify([
      { name: 'DP-2', active: true, make: 'Dell', rect: { x: 0, y: 0, width: 2560, height: 1440 } },
      { name: 'HDMI-A-1', active: false },
      { name: 'eDP-1', active: true }
    ])
    expect(parseSwayOutputs(output)).toEqual(['DP-2', 'eDP-1'])
  })

  it('returns nothing for output that is not an output list', () => {
    expect(parseSwayOutputs('')).toEqual([])
    expect(parseSwayOutputs('{"success":false}')).toEqual([])
  })
})

describe('parseNiriOutputs', () => {
  it('takes the names from the keys and skips outputs without a current mode', () => {
    const output = JSON.stringify({
      'eDP-1': { name: 'eDP-1', make: 'BOE', current_mode: 0, logical: { x: 0, y: 0, width: 1920, height: 1080 } },
      'DP-3': { name: 'DP-3', current_mode: 2, logical: { x: 1920, y: 0, width: 2560, height: 1440 } },
      'HDMI-A-1': { name: 'HDMI-A-1', current_mode: null, logical: null }
    })
    expect(parseNiriOutputs(output)).toEqual(['eDP-1', 'DP-3'])
  })

  it('returns nothing for output that is not an output map', () => {
    expect(parseNiriOutputs('')).toEqual([])
    expect(parseNiriOutputs('[]')).toEqual([])
    expect(parseNiriOutputs('null')).toEqual([])
    expect(parseNiriOutputs('{}')).toEqual([])
  })
})

// captured from headless sessions: sway 1.12, Hyprland 0.56.2 and niri 26.04
function captured(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', 'compositors', name), 'utf8')
}

describe('output lists the compositors really print', () => {
  it('sway lists every output, an inactive one is switched off', () => {
    expect(parseSwayOutputs(captured('sway-outputs.json')).sort()).toEqual(['HEADLESS-1', 'HEADLESS-2'])
    expect(parseSwayOutputs(captured('sway-outputs-one-disabled.json'))).toEqual(['HEADLESS-1'])
  })

  it('hyprctl leaves a disabled monitor out of `monitors` and marks it in `monitors all`', () => {
    expect(parseHyprctlMonitors(captured('hypr-monitors.json'))).toEqual(['HEADLESS-1', 'HEADLESS-2'])
    expect(parseHyprctlMonitors(captured('hypr-monitors-one-disabled.json'))).toEqual(['HEADLESS-1'])
    expect(parseHyprctlMonitors(captured('hypr-monitors-all-one-disabled.json'))).toEqual(['HEADLESS-1'])
  })

  it('niri keys its outputs by name', () => {
    expect(parseNiriOutputs(captured('niri-outputs.json'))).toEqual(['winit'])
  })
})

describe('parseNameHasOwner', () => {
  it('reads busctl and gdbus answers', () => {
    expect(parseNameHasOwner('b true\n')).toBe(true)
    expect(parseNameHasOwner('b false\n')).toBe(false)
    expect(parseNameHasOwner('(true,)\n')).toBe(true)
    expect(parseNameHasOwner('(false,)\n')).toBe(false)
  })

  it('gives null for anything else', () => {
    expect(parseNameHasOwner('')).toBeNull()
    expect(parseNameHasOwner('Failed to connect to bus')).toBeNull()
  })
})

describe.skipIf(process.platform !== 'linux')('getConnectedScreens', () => {
  it('asks hyprctl on Hyprland, before wlr-randr', () => {
    waylandSession({ HYPRLAND_INSTANCE_SIGNATURE: 'abc_123' })
    answerCommands({
      'hyprctl monitors -j': '[{"name":"DP-1"},{"name":"HDMI-A-1","disabled":true}]',
      'wlr-randr': 'eDP-1 "Some panel"\n  Enabled: yes\n'
    })
    expect(getConnectedScreens()).toEqual(['DP-1'])
  })

  it('asks swaymsg on sway and niri msg on niri', () => {
    waylandSession({ SWAYSOCK: '/run/user/1000/sway-ipc.sock' })
    answerCommands({ 'swaymsg -t get_outputs -r': '[{"name":"DP-2","active":true}]' })
    expect(getConnectedScreens()).toEqual(['DP-2'])

    waylandSession({ NIRI_SOCKET: '/run/user/1000/niri.sock' })
    answerCommands({ 'niri msg --json outputs': '{"eDP-1":{"name":"eDP-1","current_mode":0}}' })
    expect(getConnectedScreens()).toEqual(['eDP-1'])
  })

  it('falls back to wlr-randr when the compositor query fails or lists nothing', () => {
    waylandSession({ HYPRLAND_INSTANCE_SIGNATURE: 'abc_123' })
    answerCommands({ 'wlr-randr': 'DP-1 "Dell"\n  Enabled: yes\nHDMI-A-1 "LG"\n  Enabled: yes\n' })
    expect(getConnectedScreens()).toEqual(['DP-1', 'HDMI-A-1'])

    answerCommands({ 'hyprctl monitors -j': '[]', 'wlr-randr': 'DP-1 "Dell"\n' })
    expect(getConnectedScreens()).toEqual(['DP-1'])
  })

  it('leaves the compositor tools alone without their marker', () => {
    waylandSession({})
    answerCommands({ 'wlr-randr': 'DP-1 "Dell"\n' })
    expect(getConnectedScreens()).toEqual(['DP-1'])
    expect(execSync).toHaveBeenCalledTimes(1)
  })
})

describe.skipIf(process.platform !== 'linux')('hasStatusNotifierHost', () => {
  it('follows the owner of the watcher name', () => {
    answerCommands({ busctl: 'b true\n' })
    expect(hasStatusNotifierHost(0)).toBe(true)
    answerCommands({ busctl: 'b false\n' })
    expect(hasStatusNotifierHost(0)).toBe(false)
  })

  it('tries gdbus when busctl is missing', () => {
    answerCommands({ gdbus: '(false,)\n' })
    expect(hasStatusNotifierHost(0)).toBe(false)
  })

  it('assumes a host when neither tool can answer', () => {
    answerCommands({})
    expect(hasStatusNotifierHost(0)).toBe(true)
    answerCommands({ busctl: 'garbled' })
    expect(hasStatusNotifierHost(0)).toBe(true)
  })

  it('reuses an answer for a short while', () => {
    answerCommands({ busctl: 'b false\n' })
    expect(hasStatusNotifierHost(0)).toBe(false)
    answerCommands({ busctl: 'b true\n' })
    expect(hasStatusNotifierHost()).toBe(false)
    expect(hasStatusNotifierHost(0)).toBe(true)
  })
})

describe('parseXrandrGeometries', () => {
  it('reads connected outputs as XxYxWxH', () => {
    const out = [
      'Screen 0: minimum 320 x 200, current 4480 x 1440, maximum 16384 x 16384',
      'DP-1 connected primary 2560x1440+1920+0 (normal left inverted right x axis y axis) 600mm x 340mm',
      'HDMI-1 connected 1920x1080+0+0 (normal left inverted right) 510mm x 290mm',
      'HDMI-2 disconnected (normal left inverted right x axis y axis)',
      'DP-2 connected (normal left inverted right x axis y axis)'
    ].join('\n')
    expect([...parseXrandrGeometries(out)]).toEqual([
      ['DP-1', '1920x0x2560x1440'],
      ['HDMI-1', '0x0x1920x1080']
    ])
  })
})

describe('parseKscreenMirrors', () => {
  it('lists outputs that replicate another one', () => {
    const json = JSON.stringify({
      outputs: [
        { id: 1, name: 'DP-1', replicationSource: 0 },
        { id: 2, name: 'HDMI-A-1', replicationSource: 1 },
        { id: 3, name: 'DP-2' }
      ]
    })
    expect(parseKscreenMirrors(json)).toEqual(['HDMI-A-1'])
  })

  it('returns nothing for output it cannot read', () => {
    expect(parseKscreenMirrors('not json')).toEqual([])
    expect(parseKscreenMirrors('{}')).toEqual([])
  })
})
