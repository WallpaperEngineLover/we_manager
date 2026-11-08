import { describe, expect, it } from 'vitest'
import {
  dayOfWeekEnds,
  dayOfWeekPosition,
  daytimeEnds,
  daytimePosition,
  logonIndex,
  scheduledIndex,
  scheduledIndexNow
} from './playlistSchedule'

describe('daytimeEnds', () => {
  it('shares the time up to the next given end', () => {
    expect(daytimeEnds([0, 0.5, 0, 0])).toEqual([0.25, 0.5, 0.75, 1])
  })

  it('spreads items without ends over the day', () => {
    expect(daytimeEnds([0, 0, 0, 0])).toEqual([0.25, 0.5, 0.75, 1])
  })

  it('makes the last item run to midnight', () => {
    expect(daytimeEnds([0.3, 0.6, 0.4])).toEqual([0.3, 0.6, 1])
  })

  it('handles an empty list', () => {
    expect(daytimeEnds([])).toEqual([])
  })
})

describe('dayOfWeekEnds', () => {
  it('shares seven days with whole shares', () => {
    expect(dayOfWeekEnds(2)).toEqual([3, 7])
    expect(dayOfWeekEnds(3)).toEqual([2, 4, 7])
    expect(dayOfWeekEnds(7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('never gives items past the seventh a day', () => {
    const ends = dayOfWeekEnds(9)
    expect(ends.slice(0, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(ends[8]).toBeGreaterThanOrEqual(7)
  })
})

describe('positions', () => {
  it('picks the first item whose end is past the clock, the last one at the end', () => {
    expect(scheduledIndex([0.5, 1], 0)).toBe(0)
    expect(scheduledIndex([0.5, 1], 0.5)).toBe(1)
    expect(scheduledIndex([0.5, 1], 2)).toBe(1)
    expect(scheduledIndex([], 0.3)).toBe(0)
  })

  it('counts the day in minutes', () => {
    expect(daytimePosition(new Date(2025, 0, 6, 12, 0))).toBe(0.5)
  })

  it('counts days from the first day of the week', () => {
    expect(dayOfWeekPosition(1, 1)).toBe(0)
    expect(dayOfWeekPosition(0, 1)).toBe(6)
    expect(dayOfWeekPosition(2, 0)).toBe(2)
  })

  it('combines them for now', () => {
    const wednesday = new Date(2025, 0, 8, 9, 0)
    expect(scheduledIndexNow([0.25, 0.5, 1], 'daytime', wednesday, 1)).toBe(1)
    // Monday first: Wednesday is day 2 of 7, three items end at 2, 4, 7
    expect(scheduledIndexNow(dayOfWeekEnds(3), 'dayofweek', wednesday, 1)).toBe(1)
  })
})

describe('logonIndex', () => {
  it('steps once per session', () => {
    const first = logonIndex(undefined, 3, 'a')
    expect(first).toEqual({ index: 0, session: 'a' })
    expect(logonIndex(first, 3, 'a').index).toBe(0)
    const second = logonIndex(first, 3, 'b')
    expect(second.index).toBe(1)
    expect(logonIndex(second, 3, 'c').index).toBe(2)
    expect(logonIndex({ index: 2, session: 'c' }, 3, 'd').index).toBe(0)
  })

  it('wraps when the playlist got shorter and survives junk', () => {
    expect(logonIndex({ index: 5, session: 'a' }, 2, 'b').index).toBe(0)
    expect(logonIndex({ index: -1, session: 'a' }, 2, 'b').index).toBe(0)
    expect(logonIndex({ index: 0, session: 'a' }, 0, 'b').index).toBe(0)
  })
})
