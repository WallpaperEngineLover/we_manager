import { describe, expect, it } from 'vitest'
import { encodeBigInts, decodeBigInts } from './steam-host-protocol'

describe('steam host bigint encoding', () => {
  it('round-trips nested bigints', () => {
    const value = {
      items: [{ publishedFileId: 3806202923n, owner: { steamId64: 76561198000000000n } }, null],
      totalResults: 2,
      tags: ['Scene']
    }
    const wire = JSON.parse(JSON.stringify(encodeBigInts(value)))
    expect(decodeBigInts(wire)).toEqual(value)
  })

  it('leaves plain objects with other keys alone', () => {
    const value = { __bigint: '1', other: true }
    expect(decodeBigInts(value)).toEqual(value)
  })
})
