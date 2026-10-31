import { describe, expect, it, vi } from 'vitest'
import { createKeyedCommitter } from './keyedCommitter'

function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void
  const wait = new Promise<void>((resolve) => (open = resolve))
  return { wait, open }
}

describe('createKeyedCommitter', () => {
  it('saves a single change at once', async () => {
    const save = vi.fn<(changes: Record<string, string>) => Promise<void>>(async () => {})
    const settled = vi.fn<(keys: string[], idle: boolean) => void>()
    createKeyedCommitter<string>(save, settled).commit('a', '1')
    await vi.waitFor(() => { expect(settled).toHaveBeenCalled() })
    expect(save).toHaveBeenCalledWith({ a: '1' })
    expect(settled).toHaveBeenCalledWith(['a'], true)
  })

  it('does not drop a change made to another key while a save runs', async () => {
    const first = gate()
    const calls: Record<string, string>[] = []
    const settled = vi.fn<(keys: string[], idle: boolean) => void>()
    const committer = createKeyedCommitter<string>(async (changes) => {
      calls.push(changes)
      if (calls.length === 1) await first.wait
    }, settled)

    committer.commit('a', '1')
    await vi.waitFor(() => { expect(calls).toHaveLength(1) })
    committer.commit('b', '2')
    expect(committer.hasPending('b')).toBe(true)
    expect(calls).toHaveLength(1)

    first.open()
    await vi.waitFor(() => { expect(settled).toHaveBeenCalledTimes(2) })
    expect(calls).toEqual([{ a: '1' }, { b: '2' }])
    expect(settled).toHaveBeenNthCalledWith(1, ['a'], false)
    expect(settled).toHaveBeenNthCalledWith(2, ['b'], true)
  })

  it('sends only the newest value of a key changed several times meanwhile', async () => {
    const first = gate()
    const calls: Record<string, number>[] = []
    const settled = vi.fn<(keys: string[], idle: boolean) => void>()
    const committer = createKeyedCommitter<number>(async (changes) => {
      calls.push(changes)
      if (calls.length === 1) await first.wait
    }, settled)

    committer.commit('slider', 10)
    await vi.waitFor(() => { expect(calls).toHaveLength(1) })
    committer.commit('slider', 20)
    committer.commit('slider', 30)
    committer.commit('other', 5)
    first.open()
    await vi.waitFor(() => { expect(settled).toHaveBeenCalledTimes(2) })
    expect(calls).toEqual([{ slider: 10 }, { slider: 30, other: 5 }])
  })

  it('reports a key as settled only when its newest value has been saved', async () => {
    const first = gate()
    const calls: Record<string, number>[] = []
    const settled = vi.fn<(keys: string[], idle: boolean) => void>()
    const committer = createKeyedCommitter<number>(async (changes) => {
      calls.push(changes)
      if (calls.length === 1) await first.wait
    }, settled)

    committer.commit('slider', 70)
    await vi.waitFor(() => { expect(calls).toHaveLength(1) })
    committer.commit('slider', 30)
    first.open()
    await vi.waitFor(() => { expect(settled).toHaveBeenCalledTimes(2) })

    expect(settled).toHaveBeenNthCalledWith(1, [], false)
    expect(settled).toHaveBeenNthCalledWith(2, ['slider'], true)
  })

  it('never runs two saves at once', async () => {
    let active = 0
    let most = 0
    const settled = vi.fn<(keys: string[], idle: boolean) => void>()
    const committer = createKeyedCommitter<number>(async () => {
      active++
      most = Math.max(most, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
    }, settled)

    for (let i = 0; i < 6; i++) {
      committer.commit(`k${i}`, i)
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    await vi.waitFor(() => { expect(settled).toHaveBeenLastCalledWith(expect.anything(), true) })
    expect(most).toBe(1)
  })

  it('keeps going after a save fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const calls: string[] = []
    const settled = vi.fn<(keys: string[], idle: boolean) => void>()
    const committer = createKeyedCommitter<string>(async (changes) => {
      calls.push(Object.keys(changes).join())
      if (calls.length === 1) throw new Error('disk full')
    }, settled)

    committer.commit('a', '1')
    committer.commit('b', '2')
    await vi.waitFor(() => { expect(settled).toHaveBeenLastCalledWith(expect.anything(), true) })
    expect(calls).toEqual(['a', 'b'])
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
