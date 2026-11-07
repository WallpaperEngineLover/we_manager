import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  dir: '',
  launches: [] as ('ok' | 'fail')[],
  launched: 0,
  screens: ['DP-1'],
  unused: [] as string[],
  live: null as string[] | null,
  engine: true,
  clearOnFail: () => {}
}))

vi.mock('electron', () => ({ app: { on: () => {}, getPath: () => '/tmp' } }))
vi.mock('electron-store', () => ({
  default: class {
    private data: Record<string, unknown> = {}
    get(key: string): unknown {
      return this.data[key]
    }
    set(key: string, value: unknown): void {
      this.data[key] = value
    }
  }
}))
vi.mock('../i18n', () => ({ t: (key: string) => key }))
vi.mock('./dependency.service', () => ({ ensureDependencyInstalled: async () => {} }))
vi.mock('./library.service', () => ({
  getWallpaper: (id: string) => ({ id, title: id, type: 'scene', localPath: path.join(h.dir, id) }),
  getAllWallpapers: () => [],
  updateWallpaper: () => {}
}))
vi.mock('./config.service', () => ({
  getDefaultFps: () => null,
  getDisplayMode: () => 'per-screen',
  getGlobalEngineFlags: () => ({}),
  getSplitScreens: () => ({ 'DP-1': { layout: 'aspect', slots: [{ wallpaperId: 'w1' }, { wallpaperId: 'w2' }] } })
}))
const applyWallpaperMeta = vi.fn<(wallpaper: { id: string }, options: unknown) => Promise<string>>(async () => '')
vi.mock('./wallpaper.service', () => ({ applyWallpaperMeta, isAnimatedWallpaper: () => true, usesEngine: () => h.engine }))
vi.mock('./lwe.service', () => ({
  ALL_SCREENS: '*',
  getActiveScreens: () => h.screens,
  getLweStatus: () => ({ installed: true }),
  getRunningInstances: () => [],
  isLweRunning: (screen: string) => (h.live ?? h.screens).includes(screen),
  getUnusedScreens: () => h.unused,
  hotswapLweSettings: async () => true,
  launchLweAsync: async () => {
    h.launched++
    if (h.launches.shift() === 'fail') {
      h.clearOnFail()
      throw new Error('linux-wallpaperengine failed')
    }
  },
  liveEngineFlagOptions: () => ({}),
  onLweExit: () => {},
  stopLwe: async () => {},
  supportsSplitScreens: () => true
}))

const display = await import('./display.service')
const state = await import('./wallpaper-state.service')

beforeAll(() => {
  h.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwe-restore-'))
  for (const id of ['w1', 'w2', 'w3']) {
    fs.mkdirSync(path.join(h.dir, id))
    fs.writeFileSync(path.join(h.dir, id, 'project.json'), '{}')
  }
  h.clearOnFail = () => state.clearAssignment('DP-1')
})

afterAll(() => {
  fs.rmSync(h.dir, { recursive: true, force: true })
})

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers()
  h.launches = []
  h.launched = 0
  h.screens = ['DP-1']
  h.unused = []
  h.live = null
  h.engine = true
  applyWallpaperMeta.mockClear()
  state.clearAssignment()
  state.setAssignment('DP-1', 'w1')
  state.markSplitActive('DP-1')
})

describe('restoring a split', () => {
  it('shows it again when the first try dies at launch and the second works', async () => {
    h.launches = ['fail', 'ok']

    await display.restoreAssignedWallpapers()
    await vi.advanceTimersByTimeAsync(3500)

    expect(h.launched).toBe(2)
    expect(applyWallpaperMeta).not.toHaveBeenCalled()
    expect(state.getAssignments()['DP-1']).toBe('w1')
    expect(state.isSplitActive('DP-1')).toBe(true)
  })

  it('does not wait for the retry before it goes on to the other screens', async () => {
    h.launches = ['fail', 'ok']

    await display.restoreAssignedWallpapers()

    expect(h.launched).toBe(1)
  })

  it('falls back to the first slot when the split keeps dying', async () => {
    h.launches = ['fail', 'fail']

    await display.restoreAssignedWallpapers()
    await vi.advanceTimersByTimeAsync(3500)

    expect(h.launched).toBe(2)
    expect(applyWallpaperMeta.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['w1'])
    expect(state.isSplitActive('DP-1')).toBe(false)
  })

  it('leaves the screen to whoever took it while the retry waited', async () => {
    h.launches = ['fail', 'ok']

    await display.restoreAssignedWallpapers()
    await display.showWallpaper({ id: 'w3', title: 'w3', localPath: path.join(h.dir, 'w3') } as never, 'DP-1')
    applyWallpaperMeta.mockClear()
    await vi.advanceTimersByTimeAsync(3500)

    expect(h.launched).toBe(1)
    expect(applyWallpaperMeta).not.toHaveBeenCalled()
    expect(state.getAssignments()['DP-1']).toBe('w3')
  })
})

function wallpaperW(n: number): never {
  return { id: `w${n}`, title: `w${n}`, localPath: path.join(h.dir, `w${n}`) } as never
}

describe('a launch that a newer one overtook', () => {
  it('does not write its assignment over the newer one', async () => {
    const slow = display.showSplitScreen('DP-1')
    await display.showWallpaper({ id: 'w3', title: 'w3', localPath: path.join(h.dir, 'w3') } as never, 'DP-1')
    await slow

    expect(state.getAssignments()['DP-1']).toBe('w3')
    expect(state.isSplitActive('DP-1')).toBe(false)
  })

  it('still assigns when the newer caller was a stop', async () => {
    let finish: (value: string) => void = () => {}
    applyWallpaperMeta.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
    const slow = display.showWallpaper(wallpaperW(3), 'DP-1')
    await display.stopDisplay('DP-1')
    finish('')
    await slow

    expect(state.getAssignments()['DP-1']).toBe('w3')
  })

  it('still assigns when the newer launch failed', async () => {
    let finish: (value: string) => void = () => {}
    applyWallpaperMeta.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
    applyWallpaperMeta.mockImplementationOnce(async () => { throw new Error('declined') })
    const slow = display.showWallpaper(wallpaperW(3), 'DP-1')
    await expect(display.showWallpaper({ id: 'w2', title: 'w2', localPath: path.join(h.dir, 'w2') } as never, 'DP-1')).rejects.toThrow('declined')
    finish('')
    await slow

    expect(state.getAssignments()['DP-1']).toBe('w3')
  })

  it('does not launch onto a screen a newer launch already took', async () => {
    const first = display.showWallpaper(wallpaperW(3), '*')
    await first
    applyWallpaperMeta.mockClear()
    const older = display.showWallpaper(wallpaperW(2), 'DP-1')
    await older

    expect(applyWallpaperMeta).toHaveBeenCalledTimes(1)
  })
})

describe('a launch whose engine was killed meanwhile', () => {
  it('is not recorded', async () => {
    let finish: (value: string) => void = () => {}
    applyWallpaperMeta.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
    const slow = display.showWallpaper(wallpaperW(3), 'DP-1')
    display.forgetAssignments()
    h.live = []
    finish('')
    await slow

    expect(state.getAssignments()['DP-1']).toBeUndefined()
  })
})

describe('a static wallpaper', () => {
  it('is recorded although no engine runs', async () => {
    h.engine = false
    h.live = []

    await display.showWallpaper(wallpaperW(3), 'DP-1')

    expect(state.getAssignments()['DP-1']).toBe('w3')
  })
})

describe('a split somebody asked for, overtaken during its prompts', () => {
  it('still launches and releases the screen', async () => {
    const before = vi.fn<() => void>()
    const split = display.showSplitScreen('DP-1', before)
    await display.showWallpaper(wallpaperW(3), 'DP-1')
    await split

    expect(before).toHaveBeenCalledOnce()
    expect(h.launched).toBe(1)
  })
})

describe('isShownOn', () => {
  it('is true only for the screens of the call', async () => {
    h.screens = ['DP-1', 'DP-2']
    state.setAssignment('DP-1', 'w3')

    expect(display.isShownOn('w3', 'DP-1')).toBe(true)
    expect(display.isShownOn('w3', 'DP-2')).toBe(false)
  })
})

describe('a split that something newer overtook during its dependency prompts', () => {
  it('does not launch', async () => {
    const split = display.showSplitScreen('DP-1')
    await display.showWallpaper(wallpaperW(3), 'DP-1')
    await split

    expect(h.launched).toBe(0)
    expect(state.getAssignments()['DP-1']).toBe('w3')
  })
})

describe('a launch on its way', () => {
  it('keeps an older call from launching onto a screen a newer one is working on', async () => {
    h.screens = ['DP-1', 'DP-2']
    let finishOlder: (value: string) => void = () => {}
    let finishNewer: (value: string) => void = () => {}
    applyWallpaperMeta.mockImplementationOnce(() => new Promise<string>((resolve) => { finishOlder = resolve }))
    const older = display.showWallpaper(wallpaperW(2), '*')
    applyWallpaperMeta.mockImplementationOnce(() => new Promise<string>((resolve) => { finishNewer = resolve }))
    const newer = display.showWallpaper(wallpaperW(3), 'DP-2')

    finishOlder('')
    await older
    finishNewer('')
    await newer

    expect(applyWallpaperMeta.mock.calls.map(([wallpaper, options]) => [wallpaper.id, (options as { screen: string }).screen])).toEqual([
      ['w2', 'DP-1'],
      ['w3', 'DP-2']
    ])
    expect(state.getAssignments()['DP-2']).toBe('w3')
  })

  it('lets an older call reach a later screen when the newer call aborted on an earlier one', async () => {
    h.screens = ['DP-1', 'DP-2']
    let finishNewer: (value: string) => void = () => {}
    applyWallpaperMeta.mockImplementationOnce(() => new Promise<string>((resolve) => { finishNewer = resolve }))
    const older = display.showWallpaper(wallpaperW(2), 'DP-2')
    applyWallpaperMeta.mockClear()
    applyWallpaperMeta.mockImplementationOnce(async () => { throw new Error('declined') })
    const newer = display.showWallpaper(wallpaperW(3), '*')
    await expect(newer).rejects.toThrow('declined')
    finishNewer('')
    await older

    expect(state.getAssignments()['DP-2']).toBe('w2')
  })

  it('lets an older call go on when the newer one failed', async () => {
    applyWallpaperMeta.mockImplementationOnce(async () => { throw new Error('declined') })
    await expect(display.showWallpaper(wallpaperW(3), 'DP-1')).rejects.toThrow('declined')

    await display.showWallpaper(wallpaperW(2), 'DP-1')

    expect(state.getAssignments()['DP-1']).toBe('w2')
  })
})

describe('restoring a screen that is not up yet', () => {
  it('leaves a screen to a launch that began between two passes', async () => {
    state.clearAssignment()
    state.setAssignment('DP-1', 'w8')
    const restore = display.restoreAssignedWallpapers()
    await vi.advanceTimersByTimeAsync(0)

    fs.mkdirSync(path.join(h.dir, 'w8'))
    fs.writeFileSync(path.join(h.dir, 'w8', 'project.json'), '{}')
    let finish: (value: string) => void = () => {}
    applyWallpaperMeta.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
    const user = display.showWallpaper(wallpaperW(3), 'DP-1')
    applyWallpaperMeta.mockClear()
    await vi.advanceTimersByTimeAsync(3500)
    finish('')
    await user
    await restore

    expect(applyWallpaperMeta).not.toHaveBeenCalled()
    expect(state.getAssignments()['DP-1']).toBe('w3')
  })

  it('waits for a wallpaper folder that is mounted a moment later', async () => {
    state.clearAssignment()
    state.setAssignment('DP-1', 'w9')
    const restore = display.restoreAssignedWallpapers()
    await vi.advanceTimersByTimeAsync(0)
    expect(applyWallpaperMeta).not.toHaveBeenCalled()

    fs.mkdirSync(path.join(h.dir, 'w9'))
    fs.writeFileSync(path.join(h.dir, 'w9', 'project.json'), '{}')
    await vi.advanceTimersByTimeAsync(3500)
    await restore

    expect(applyWallpaperMeta.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['w9'])
  })

  it('does not retry an old shared assignment in per-screen mode', async () => {
    state.clearAssignment()
    state.setAssignment('*', 'w1')
    const restore = display.restoreAssignedWallpapers()
    await vi.advanceTimersByTimeAsync(0)
    await restore

    expect(h.launched).toBe(0)
  })

  it('restores it when the output shows up a moment later', async () => {
    h.screens = ['DP-2']
    const restore = display.restoreAssignedWallpapers()
    await vi.advanceTimersByTimeAsync(0)
    expect(h.launched).toBe(0)

    h.screens = ['DP-1', 'DP-2']
    await vi.advanceTimersByTimeAsync(3500)
    await restore

    expect(h.launched).toBe(1)
  })

  it('does not wait for a screen the user turned off', async () => {
    h.screens = ['DP-2']
    h.unused = ['DP-1']
    const restore = display.restoreAssignedWallpapers()
    await restore

    expect(h.launched).toBe(0)
  })

  it('gives up after a few tries', async () => {
    h.screens = ['DP-2']
    const restore = display.restoreAssignedWallpapers()
    await vi.advanceTimersByTimeAsync(30_000)
    await restore

    expect(h.launched).toBe(0)
  })
})

describe('quitting', () => {
  it('starts nothing after the app began to quit', async () => {
    h.launches = ['fail', 'ok']

    await display.restoreAssignedWallpapers()
    display.cancelRestore()
    await vi.advanceTimersByTimeAsync(3500)

    expect(h.launched).toBe(1)
    expect(applyWallpaperMeta).not.toHaveBeenCalled()
  })

  it('also starts nothing when the quit came before the restore began', async () => {
    display.cancelRestore()

    await display.restoreAssignedWallpapers()

    expect(h.launched).toBe(0)
    expect(applyWallpaperMeta).not.toHaveBeenCalled()
  })
})
