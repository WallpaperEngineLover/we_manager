import { describe, expect, it } from 'vitest'
import { findAndMutate } from './collections'

describe('findAndMutate', () => {
  it('mutates and returns the matching item', () => {
    const items = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }]
    const found = findAndMutate(items, 'b', (item) => { item.n = 5 })
    expect(found).toBe(items[1])
    expect(items[1].n).toBe(5)
  })

  it('returns null for an unknown id without calling mutate', () => {
    let called = false
    expect(findAndMutate([{ id: 'a' }], 'x', () => { called = true })).toBeNull()
    expect(called).toBe(false)
  })

  it('returns null when mutate returns false, keeping the change it made', () => {
    const items = [{ id: 'a', n: 1 }]
    expect(findAndMutate(items, 'a', (item) => { item.n = 2; return false })).toBeNull()
    expect(items[0].n).toBe(2)
  })
})
