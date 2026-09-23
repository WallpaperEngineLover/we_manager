import type { ScheduleRule } from './types'

export function parseTime(time: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours > 23 || minutes > 59) return null
  return { hours, minutes }
}

/** Every moment in (from, to] a time rule was meant to fire at, oldest first */
export function fireTimesBetween(rule: ScheduleRule, from: Date, to: Date): Date[] {
  if (rule.trigger.type !== 'time') return []
  const time = parseTime(rule.trigger.time)
  if (!time) return []

  const days = rule.trigger.days.length > 0 ? rule.trigger.days : [0, 1, 2, 3, 4, 5, 6]
  const result: Date[] = []
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  while (day.getTime() <= to.getTime()) {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes)
    if (days.includes(at.getDay()) && at > from && at <= to) result.push(at)
    day.setDate(day.getDate() + 1)
  }
  return result
}

/**
 * The time rules that came due in (from, to], oldest first and at most one per screen: when several
 * did (the app was closed or the machine asleep across more than one), only the most recent still
 * matters. A '*' rule stands for every screen, so it replaces all older ones, and a later rule for
 * one screen then takes over just that screen.
 */
export function dueTimeRules(rules: ScheduleRule[], from: Date, to: Date): ScheduleRule[] {
  const fired: { rule: ScheduleRule; at: number }[] = []
  for (const rule of rules) {
    if (!rule.enabled) continue
    const times = fireTimesBetween(rule, from, to)
    if (times.length > 0) fired.push({ rule, at: times[times.length - 1].getTime() })
  }
  fired.sort((a, b) => a.at - b.at)

  const latest = new Map<string, ScheduleRule>()
  for (const { rule } of fired) {
    if (rule.screen === '*') latest.clear()
    else latest.delete(rule.screen)
    latest.set(rule.screen, rule)
  }
  return [...latest.values()]
}

export function nextFireTime(rule: ScheduleRule, now: Date): Date | null {
  const inAWeek = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
  return fireTimesBetween(rule, now, inAWeek)[0] ?? null
}
