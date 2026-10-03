/** "3:05" or "1:02:03", with tenths when the time isn't a whole second */
export function formatVideoTime(seconds: number): string {
  const tenths = Math.round(seconds * 10)
  const whole = Math.floor(tenths / 10)
  const fraction = tenths % 10 ? `.${tenths % 10}` : ''
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = String(whole % 60).padStart(2, '0') + fraction
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Seconds from "90", "1:30" or "0:01:30.5" (what the engine takes too), null for anything else */
export function parseVideoTime(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length > 3) return null
  let seconds = 0
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null
    seconds = seconds * 60 + Number(part)
  }
  return seconds
}

/** How long one pass of the trimmed part lasts */
export function trimmedVideoLength(duration: number, start?: number, end?: number): number {
  return Math.max(0, Math.min(end ?? duration, duration) - (start ?? 0))
}
