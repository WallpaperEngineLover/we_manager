import { describe, expect, it } from 'vitest'
import type { ScheduleRule } from './types'
import { dueTimeRules, fireTimesBetween, nextFireTime, parseTime } from './schedule'

function rule(id: string, time: string, extra: Partial<ScheduleRule> = {}): ScheduleRule {
  return {
    id,
    name: id,
    enabled: true,
    trigger: { type: 'time', time, days: [] },
    action: { type: 'stop' },
    screen: '*',
    ...extra
  }
}

// 2026-09-21 is a Monday
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 8, day, hours, minutes)

describe('parseTime', () => {
  it('reads HH:MM and rejects anything else', () => {
    expect(parseTime('08:30')).toEqual({ hours: 8, minutes: 30 })
    expect(parseTime('8:05')).toEqual({ hours: 8, minutes: 5 })
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('12:60')).toBeNull()
    expect(parseTime('noon')).toBeNull()
  })
})

describe('fireTimesBetween', () => {
  it('excludes the start and includes the end of the window', () => {
    const r = rule('a', '08:00')
    expect(fireTimesBetween(r, at(21, 8), at(22, 8))).toEqual([at(22, 8)])
  })

  it('only fires on the picked days', () => {
    const weekdays = rule('a', '09:00', { trigger: { type: 'time', time: '09:00', days: [1, 2, 3, 4, 5] } })
    // Saturday the 26th and Sunday the 27th are skipped
    expect(fireTimesBetween(weekdays, at(25, 10), at(28, 10))).toEqual([at(28, 9)])
  })

  it('ignores theme rules', () => {
    const theme = rule('a', '', { trigger: { type: 'theme', theme: 'dark' } })
    expect(fireTimesBetween(theme, at(21, 0), at(28, 0))).toEqual([])
  })
})

describe('dueTimeRules', () => {
  it('keeps only the latest rule per screen after a long gap', () => {
    const morning = rule('morning', '08:00')
    const evening = rule('evening', '20:00')
    expect(dueTimeRules([morning, evening], at(21, 19), at(22, 9)).map((r) => r.id)).toEqual(['morning'])
  })

  it('treats screens separately, but an all-screens rule replaces older per-screen ones', () => {
    const left = rule('left', '07:00', { screen: 'DP-1' })
    const right = rule('right', '07:30', { screen: 'DP-2' })
    const all = rule('all', '07:15')
    expect(dueTimeRules([left, right], at(21, 6), at(21, 8)).map((r) => r.id).sort()).toEqual(['left', 'right'])
    expect(dueTimeRules([left, all, right], at(21, 6), at(21, 8)).map((r) => r.id).sort()).toEqual(['all', 'right'])
  })

  it('skips disabled rules', () => {
    expect(dueTimeRules([rule('a', '08:00', { enabled: false })], at(21, 7), at(21, 9))).toEqual([])
  })
})

describe('nextFireTime', () => {
  it('finds the next matching day', () => {
    const sundays = rule('a', '10:00', { trigger: { type: 'time', time: '10:00', days: [0] } })
    expect(nextFireTime(sundays, at(21, 12))).toEqual(at(27, 10))
  })
})
