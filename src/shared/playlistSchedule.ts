/**
 * Which item of a daytime or day of week playlist is up, the same rules as linux-wallpaperengine's PlaylistSchedule (and
 * Wallpaper Engine's own playlists): every item has an end, the first item whose end is past the clock is shown, the
 * last one when none is.
 */

/**
 * Ends as fractions of the day. `requested` holds each item's wanted end (0 or less when it has none): items without one
 * share the time up to the next one that has one evenly, the last item always ends at 1
 */
export function daytimeEnds(requested: number[]): number[] {
  const ends = [...requested]
  let runStart = 0
  let previous = 0

  for (let index = 0; index < ends.length; index++) {
    let end = 1
    if (index + 1 !== ends.length) {
      end = ends[index]
      if (end <= 0) continue
    }

    const step = (end - previous) / (index - runStart + 1)
    for (let item = runStart; item <= index; item++) ends[item] = (item - runStart + 1) * step + previous
    ends[index] = end

    runStart = index + 1
    previous = end
  }
  return ends
}

/** Days since the first day of the week: 7 days shared out among at most 7 items */
export function dayOfWeekEnds(count: number): number[] {
  const ends: number[] = []
  const slots = Math.min(Math.max(count, 1), 7)
  let total = 0

  for (let item = 0; item < count; item++) {
    let remaining = 7
    let share = 7
    for (let slot = 0; slot < slots; slot++) {
      share = slot < slots - 1 ? Math.trunc(remaining / (slots - slot)) : remaining
      if (slot === item) break
      remaining -= share
    }
    total += share
    ends.push(total)
  }
  return ends
}

export function scheduledIndex(ends: number[], position: number): number {
  const index = ends.findIndex((end) => end > position)
  return index === -1 ? Math.max(ends.length - 1, 0) : index
}

/** Local time of day as a fraction of the day */
export function daytimePosition(now: Date): number {
  return (now.getHours() * 60 + now.getMinutes()) / 1440
}

/** weekday and firstWeekday count from Sunday = 0 like Date.getDay() */
export function dayOfWeekPosition(weekday: number, firstWeekday: number): number {
  return (((weekday - firstWeekday) % 7) + 7) % 7
}

export type ScheduledMode = 'daytime' | 'dayofweek'

export function scheduledIndexNow(ends: number[], mode: ScheduledMode, now: Date, firstWeekday: number): number {
  return scheduledIndex(
    ends,
    mode === 'daytime' ? daytimePosition(now) : dayOfWeekPosition(now.getDay(), firstWeekday)
  )
}

export interface LogonEntry {
  index: number
  session: string
}

/**
 * "logon" playlists show the next item once per session: the same session asking again gets the same item, a new one
 * the item after it, nothing saved starts at the first. `entry` is what was saved for the playlist.
 */
export function logonIndex(entry: LogonEntry | undefined, count: number, session: string): LogonEntry {
  if (count <= 0) return { index: 0, session }
  if (!entry || !Number.isInteger(entry.index) || entry.index < 0) return { index: 0, session }
  const index = entry.index % count
  return entry.session === session ? { index, session } : { index: (index + 1) % count, session }
}
