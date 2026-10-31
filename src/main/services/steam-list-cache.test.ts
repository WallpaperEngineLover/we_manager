import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { on: () => {} } }))
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

import { SteamListCache, type ListSource, type VerifyListener } from './steam-list-cache'

function source(lists: string[][], accountIds: number[] = [1]): ListSource & { syncs: number } {
  const src = {
    syncs: 0,
    canSync: () => true,
    getAccountId: async () => accountIds[Math.min(src.syncs, accountIds.length - 1)],
    crawl: async (_account: number, onPage: (ids: string[]) => void) => {
      const ids = lists[Math.min(src.syncs, lists.length - 1)]
      src.syncs++
      onPage(ids)
      return new Set(ids)
    }
  }
  return src
}

async function sync(cache: SteamListCache): Promise<void> {
  ;(cache as unknown as { store: { set: (k: string, v: number) => void } }).store.set('lastFullSync', 0)
  cache.maybeSync()
  await vi.waitFor(() => { expect((cache as unknown as { syncInFlight: boolean }).syncInFlight).toBe(false) })
}

describe('SteamListCache', () => {
  it('drops an id only after two crawls in a row miss it', async () => {
    const cache = new SteamListCache('Test', 'test', source([['a', 'b'], ['a'], ['a']]))
    await sync(cache)
    expect(cache.list().sort()).toEqual(['a', 'b'])
    await sync(cache)
    expect(cache.has('b')).toBe(true)
    await sync(cache)
    expect(cache.has('b')).toBe(false)
  })

  it('keeps a local change over a crawl that has not caught up', async () => {
    const cache = new SteamListCache('Test', 'test', source([['a']]))
    cache.record('new', true)
    cache.record('a', false)
    await sync(cache)
    expect(cache.has('new')).toBe(true)
    expect(cache.has('a')).toBe(false)
  })

  it('lets a fresh local change win over the per-item check', () => {
    const cache = new SteamListCache('Test', 'test', source([[]]))
    cache.record('x', true)
    expect(cache.applyCheck('x', false)).toBe(true)
    expect(cache.has('x')).toBe(true)
  })

  it('starts over when the Steam account changes', async () => {
    const onChange = vi.fn<(ids: string[]) => void>()
    const cache = new SteamListCache('Test', 'test', source([['a'], ['z']], [1, 2]))
    cache.onChange(onChange)
    await sync(cache)
    await sync(cache)
    expect(cache.list()).toEqual(['z'])
    expect(onChange).toHaveBeenCalled()
  })

  describe('read-back', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('confirms a change once the crawled list shows it', async () => {
      vi.useFakeTimers()
      const src = source([[], ['fav']])
      const cache = new SteamListCache('Test', 'test', src)
      const onVerified = vi.fn<VerifyListener>()
      cache.onVerified(onVerified)
      cache.record('fav', true)
      expect(cache.unverified()).toEqual(['fav'])

      await vi.advanceTimersByTimeAsync(15_000)
      expect(src.syncs).toBe(1)
      expect(onVerified).not.toHaveBeenCalled()
      expect(cache.has('fav')).toBe(true)

      await vi.advanceTimersByTimeAsync(45_000)
      expect(src.syncs).toBe(2)
      expect(onVerified).toHaveBeenCalledWith('fav', true, true)
      expect(cache.unverified()).toEqual([])

      await vi.advanceTimersByTimeAsync(30 * 60_000)
      expect(src.syncs).toBe(2)
    })

    it('gives up on a change the list still contradicts after the pending TTL', async () => {
      vi.useFakeTimers()
      const src = source([['gone']])
      const cache = new SteamListCache('Test', 'test', src)
      const onVerified = vi.fn<VerifyListener>()
      cache.onVerified(onVerified)
      cache.record('gone', false)

      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(onVerified).not.toHaveBeenCalled()
      expect(cache.has('gone')).toBe(false)

      await vi.advanceTimersByTimeAsync(6 * 60_000)
      expect(onVerified).toHaveBeenCalledWith('gone', false, false)
      expect(cache.has('gone')).toBe(true)
    })

    it('waits for Steam before reading back', async () => {
      vi.useFakeTimers()
      const src = source([['fav']])
      let running = false
      src.canSync = () => running
      const cache = new SteamListCache('Test', 'test', src)
      const onVerified = vi.fn<VerifyListener>()
      cache.onVerified(onVerified)
      cache.record('fav', true)

      await vi.advanceTimersByTimeAsync(2 * 60_000)
      expect(src.syncs).toBe(0)
      running = true
      await vi.advanceTimersByTimeAsync(60_000)
      expect(onVerified).toHaveBeenCalledWith('fav', true, true)
    })
  })
})
