import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  rules: [] as unknown[],
  hostPids: [] as (number | undefined)[],
  slowFrom: 0,
  asked: 0
}))

vi.mock('../utils/safeStore', () => ({
  openStore: () => {
    const data: Record<string, unknown> = { rules: h.rules, layers: {}, active: [] }
    return { get: (key: string) => data[key], set: (key: string, value: unknown) => { data[key] = value } }
  }
}))
vi.mock('../utils/processes', () => ({ listProcessNames: async () => new Set<string>() }))
vi.mock('../utils/audio-activity', () => ({ isAudioPlaying: vi.fn<(owners: Set<number>) => Promise<boolean>>(async () => false) }))
vi.mock('../utils/flatpak', () => ({
  isFlatpak: () => true,
  hostPidOf: vi.fn<() => Promise<number | undefined>>(async () => {
    if (h.slowFrom > 0 && ++h.asked >= h.slowFrom) await new Promise<void>(() => {})
    return h.hostPids.shift()
  })
}))
vi.mock('./lwe.service', () => ({ getRunningInstances: () => [], isLweRunning: () => false }))
vi.mock('./profile.service', () => ({ captureScreens: () => ({}) }))
vi.mock('./library.service', () => ({ getWallpaper: () => undefined }))
vi.mock('./rule-actions.service', () => ({ actionScreens: () => [], runAction: async () => {}, runScreenAction: async () => {} }))

const rule = (type: 'audio' | 'process') => ({
  id: type,
  name: type,
  enabled: true,
  condition: type === 'audio' ? { type } : { type, names: ['game'] },
  action: { type: 'stop' },
  screen: '*',
  revert: false
})

async function start(rules: unknown[]) {
  vi.resetModules()
  h.rules = rules
  const flatpak = await import('../utils/flatpak')
  const service = await import('./app-rules.service')
  service.initAppRules({ isDestroyed: () => false, webContents: { send: () => {} } } as never)
  const audio = await import('../utils/audio-activity')
  return { lookup: vi.mocked(flatpak.hostPidOf), audioCheck: vi.mocked(audio.isAudioPlaying) }
}

beforeEach(() => {
  h.slowFrom = 0
  h.asked = 0
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the app own pid on the host', () => {
  it('is not looked up while no rule watches audio', async () => {
    h.hostPids = [undefined]
    const { lookup } = await start([rule('process')])

    await vi.advanceTimersByTimeAsync(120_000)

    expect(lookup).not.toHaveBeenCalled()
  })

  it('is looked up again after a failure, less often each time', async () => {
    h.hostPids = [undefined, undefined, 4242]
    const { lookup } = await start([rule('audio')])

    await vi.advanceTimersByTimeAsync(50_000)
    expect(lookup).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(lookup).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(lookup).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(70_000)
    expect(lookup).toHaveBeenCalledTimes(3)
  })

  it('is kept once found', async () => {
    h.hostPids = [4242]
    const { lookup } = await start([rule('audio')])

    await vi.advanceTimersByTimeAsync(300_000)

    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('is handed to the audio check once found', async () => {
    h.hostPids = [4242]
    const { audioCheck } = await start([rule('audio')])

    await vi.advanceTimersByTimeAsync(10_000)

    const owners = audioCheck.mock.calls.at(-1)?.[0] as Set<number>
    expect(owners.has(4242)).toBe(true)
  })

  it('waits for the first answer before it asks the audio check', async () => {
    h.slowFrom = 1
    const { audioCheck } = await start([rule('audio')])

    await vi.advanceTimersByTimeAsync(20_000)

    expect(audioCheck).not.toHaveBeenCalled()
  })

  it('does not hold the check back for a slow lookup after the first', async () => {
    h.slowFrom = 2
    h.hostPids = [undefined]
    const { audioCheck } = await start([rule('audio')])

    await vi.advanceTimersByTimeAsync(65_000)
    const before = audioCheck.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)

    expect(audioCheck.mock.calls.length).toBeGreaterThan(before + 3)
  })
})
