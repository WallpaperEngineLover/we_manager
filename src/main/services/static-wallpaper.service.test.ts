import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import { describe, expect, it, vi } from 'vitest'

import {
  applyHyprpaper,
  applySwaybg,
  applySwww,
  prefersHyprpaper,
  swwwCommand,
  type CommandResult,
  type DaemonStarter
} from './static-wallpaper.service'

const IMAGE = '/home/user/wall paper.png'

/** answers each command line with the first matching reply, records every call */
function fakeRunner(replies: Array<[RegExp, CommandResult | (() => CommandResult)]>) {
  const calls: string[] = []
  const run = async (cmd: string, args: string[]) => {
    const line = [cmd, ...args].join(' ')
    calls.push(line)
    const reply = replies.find(([pattern]) => pattern.test(line))?.[1]
    if (!reply) return { ok: false, output: `unexpected: ${line}` }
    return typeof reply === 'function' ? reply() : reply
  }
  return { run, calls }
}

describe('applyHyprpaper', () => {
  it('sets every monitor in one request on hyprpaper 0.8', async () => {
    const { run, calls } = fakeRunner([[/wallpaper/, { ok: true, output: '' }]])
    await applyHyprpaper(IMAGE, run, vi.fn())
    expect(calls).toEqual([`hyprctl hyprpaper wallpaper ,${IMAGE},cover`])
  })

  it('starts hyprpaper when it is not running and tries again', async () => {
    let started = false
    const { run, calls } = fakeRunner([
      [
        /wallpaper/,
        () =>
          started
            ? { ok: true, output: '' }
            : { ok: false, output: "Error: can't send: failed to connect to hyprpaper (is it running?)" }
      ]
    ])
    const start = vi.fn<DaemonStarter>(() => {
      started = true
    })
    await applyHyprpaper(IMAGE, run, start)
    expect(start).toHaveBeenCalledWith('hyprpaper', [])
    expect(calls).toHaveLength(2)
  })

  it('preloads first for hyprpaper up to 0.7', async () => {
    const { run, calls } = fakeRunner([
      [/wallpaper ,.*,cover$/, { ok: true, output: 'wallpaper failed (not preloaded)' }],
      [/preload/, { ok: true, output: 'ok' }],
      [/wallpaper ,/, { ok: true, output: 'ok' }],
      [/unload unused/, { ok: true, output: 'ok' }]
    ])
    await applyHyprpaper(IMAGE, run, vi.fn())
    expect(calls.slice(1)).toEqual([
      `hyprctl hyprpaper preload ${IMAGE}`,
      `hyprctl hyprpaper wallpaper ,${IMAGE}`,
      'hyprctl hyprpaper unload unused'
    ])
  })

  it('reports what hyprpaper said when nothing worked', async () => {
    const { run } = fakeRunner([
      [/wallpaper ,.*,cover$/, { ok: false, output: 'error: failed to set wallpaper: Invalid path' }],
      [/preload/, { ok: false, output: 'error: unknown request' }],
      [/wallpaper ,/, { ok: false, output: '' }]
    ])
    await expect(applyHyprpaper(IMAGE, run, vi.fn())).rejects.toThrow('unknown request')
  })
})

describe('applySwww', () => {
  it('prefers awww, the renamed swww', () => {
    expect(swwwCommand((cmd) => cmd === 'awww' || cmd === 'swww')).toBe('awww')
    expect(swwwCommand((cmd) => cmd === 'swww')).toBe('swww')
    expect(swwwCommand(() => false)).toBeUndefined()
  })

  it('starts the daemon when query fails', async () => {
    let running = false
    const { run, calls } = fakeRunner([
      [/query/, () => ({ ok: running, output: running ? '' : 'Socket file not found' })],
      [/img/, { ok: true, output: '' }]
    ])
    const start = vi.fn<DaemonStarter>(() => {
      running = true
    })
    await applySwww(IMAGE, 'awww', run, start)
    expect(start).toHaveBeenCalledWith('awww-daemon', [])
    expect(calls.at(-1)).toBe(`awww img ${IMAGE} --transition-type fade`)
  })
})

function fakeChild() {
  const child = new EventEmitter() as ChildProcess & EventEmitter
  Object.assign(child, { exitCode: null, kill: vi.fn<() => boolean>() })
  return child
}

describe('applySwaybg', () => {
  it('keeps the new swaybg running and stops the previous one', async () => {
    const first = Object.assign(fakeChild(), { pid: 4242 })
    const second = Object.assign(fakeChild(), { pid: 4243 })
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    await applySwaybg(IMAGE, () => first)
    await applySwaybg(IMAGE, () => second)
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM')
    expect(kill).not.toHaveBeenCalledWith(-4243, 'SIGTERM')
    kill.mockRestore()
  })

  it('fails when swaybg exits at once', async () => {
    const child = fakeChild()
    const pending = applySwaybg(IMAGE, () => {
      setTimeout(() => child.emit('exit', 1), 10)
      return child
    })
    await expect(pending).rejects.toThrow('code 1')
  })
})

const installed = (...cmds: string[]) => (cmd: string) => cmds.includes(cmd)
const runningOnly = (...names: string[]) => (name: string) => names.includes(name)

describe('prefersHyprpaper', () => {
  it('takes hyprpaper unless a swww daemon already draws', () => {
    expect(prefersHyprpaper(installed('hyprpaper', 'hyprctl'), runningOnly())).toBe(true)
    expect(prefersHyprpaper(installed('hyprpaper', 'hyprctl', 'swww'), runningOnly())).toBe(true)
    expect(prefersHyprpaper(installed('hyprpaper', 'hyprctl', 'swww'), runningOnly('swww-daemon'))).toBe(false)
    expect(prefersHyprpaper(installed('hyprpaper', 'hyprctl', 'awww'), runningOnly('awww-daemon'))).toBe(false)
  })

  it('keeps a running hyprpaper', () => {
    expect(prefersHyprpaper(installed('hyprpaper', 'hyprctl', 'swww'), runningOnly('hyprpaper', 'swww-daemon'))).toBe(true)
  })

  it('needs hyprpaper and hyprctl', () => {
    expect(prefersHyprpaper(installed('hyprpaper'), runningOnly('hyprpaper'))).toBe(false)
  })
})
