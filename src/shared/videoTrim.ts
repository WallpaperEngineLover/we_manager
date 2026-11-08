function formatClock(seconds: number, decimals: number): string {
  const unit = 10 ** decimals
  const ticks = Math.round(seconds * unit)
  const whole = Math.floor(ticks / unit)
  const fraction = ticks % unit ? `.${String(ticks % unit).padStart(decimals, '0').replace(/0+$/, '')}` : ''
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = String(whole % 60).padStart(2, '0') + fraction
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function formatVideoTime(seconds: number): string {
  return formatClock(seconds, 1)
}

export function formatVideoTimeExact(seconds: number): string {
  return formatClock(seconds, 3)
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

/** In seconds, no end means up to the end of the video */
export interface VideoSegment {
  start: number
  end?: number
}

export function videoSegmentsOf(meta: {
  videoSegments?: VideoSegment[]
  videoStart?: number
  videoEnd?: number
}): VideoSegment[] {
  if (meta.videoSegments) return meta.videoSegments
  if (meta.videoStart === undefined && meta.videoEnd === undefined) return []
  return [{ start: meta.videoStart ?? 0, end: meta.videoEnd }]
}

/** Sorted and merged like the engine, an end past the video stays open, the whole video gives [] */
export function normalizeVideoSegments(segments: VideoSegment[], duration?: number | null): VideoSegment[] {
  const merged: VideoSegment[] = []
  const sorted = segments
    .map((s) => ({ start: s.start, end: duration && s.end !== undefined && s.end >= duration ? undefined : s.end }))
    .filter((s) => (s.end === undefined || s.end > s.start) && !(duration && s.start >= duration))
    .sort((a, b) => a.start - b.start)
  for (const segment of sorted) {
    const last = merged[merged.length - 1]
    // touching parts stay separate rows
    if (!last || (last.end !== undefined && segment.start >= last.end)) {
      merged.push({ ...segment })
    } else if (last.end !== undefined) {
      last.end = segment.end === undefined ? undefined : Math.max(last.end, segment.end)
    }
  }
  if (merged.length === 1 && merged[0].start <= 0 && merged[0].end === undefined) return []
  return merged
}

function wholeSeconds(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

export function formatVideoSegments(segments: VideoSegment[]): string {
  return segments.map((s) => `${wholeSeconds(s.start)}-${s.end === undefined ? '' : wholeSeconds(s.end)}`).join(',')
}

/** The one range a video's trim cuts out, null when there is no trim or it plays several parts (an optimize cuts one range) */
export function trimAsCut(
  meta: { videoSegments?: VideoSegment[]; videoStart?: number; videoEnd?: number },
  duration: number
): { start: number; end: number } | null {
  const cuts = trimAsCuts(meta, duration)
  return cuts.length === 1 ? cuts[0] : null
}

export function trimmedVideoLength(duration: number, segments: VideoSegment[]): number {
  if (segments.length === 0) return duration
  return segments.reduce((sum, s) => sum + Math.max(0, Math.min(s.end ?? duration, duration) - s.start), 0)
}

/** Every part of a video's trim as closed ranges in order, empty without a trim */
export function trimAsCuts(
  meta: { videoSegments?: VideoSegment[]; videoStart?: number; videoEnd?: number },
  duration: number
): { start: number; end: number }[] {
  return normalizeVideoSegments(videoSegmentsOf(meta), duration)
    .map((s) => ({ start: s.start, end: Math.min(s.end ?? duration, duration) }))
    .filter((r) => r.end > r.start)
}
