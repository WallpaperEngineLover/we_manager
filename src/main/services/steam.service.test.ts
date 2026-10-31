import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import { encodeBigInts } from '../steam-host-protocol'

class FakeHost extends EventEmitter {
  requests: { id: number; method: string }[] = []
  kill = vi.fn<() => void>(() => {
    this.emit('exit', null)
  })
  postMessage(message: { id: number; method: string }): void {
    this.requests.push(message)
  }
  answer(id: number, result: unknown): void {
    this.emit('message', encodeBigInts({ id, result }))
  }
}

const hosts: FakeHost[] = []

vi.mock('electron', () => ({
  app: { on: vi.fn<() => void>() },
  utilityProcess: {
    fork: () => {
      const host = new FakeHost()
      hosts.push(host)
      return host
    }
  }
}))
vi.mock('./config.service', () => ({ getSteamIdentity: () => 'wallpaper-engine' }))
vi.mock('electron-store', () => ({
  default: class {
    private data: Record<string, unknown>
    constructor(opts: { defaults: Record<string, unknown> }) {
      this.data = structuredClone(opts.defaults)
    }
    get(key: string): unknown {
      return this.data[key]
    }
    set(key: string, value: unknown): void {
      this.data[key] = value
    }
  }
}))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    readFileSync: (file: string, ...rest: unknown[]) => {
      if (String(file).endsWith('steam.pid')) return '4242'
      if (file === '/proc/4242/comm') return 'steam\n'
      return (actual.readFileSync as (...args: unknown[]) => unknown)(file, ...rest)
    }
  }
})

const steam = await import('./steam.service')

const window = {
  isDestroyed: () => false,
  isVisible: () => true,
  isMinimized: () => false,
  on: () => {}
} as never

async function untilRequest(host: FakeHost, method: string): Promise<{ id: number }> {
  await vi.waitFor(() => { expect(host.requests.some((r) => r.method === method)).toBe(true) })
  return host.requests.find((r) => r.method === method)!
}

describe('a Steam request that never answers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    steam.bindSteamToWindow(window)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops the host that did not answer and starts a new one for the next request', async () => {
    const first = steam.getLocalAccountId()
    await vi.waitFor(() => { expect(hosts).toHaveLength(1) })
    hosts[0].answer((await untilRequest(hosts[0], 'init')).id, null)
    await untilRequest(hosts[0], 'workshop.getSubscribedItems').catch(() => undefined)
    await untilRequest(hosts[0], 'localplayer.getSteamId')

    const failure = first.then(() => new Error('answered'), (err: Error) => err)
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await failure).message).toMatch(/timed out/)
    expect(hosts[0].kill).toHaveBeenCalledTimes(1)

    const second = steam.getLocalAccountId()
    await vi.waitFor(() => { expect(hosts).toHaveLength(2) })
    hosts[1].answer((await untilRequest(hosts[1], 'init')).id, null)
    const request = await untilRequest(hosts[1], 'localplayer.getSteamId')
    hosts[1].answer(request.id, { accountId: 7 })
    expect(await second).toBe(7)
  })
})
