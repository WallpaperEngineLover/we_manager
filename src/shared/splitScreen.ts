import type { SplitLayout } from './types'

/** Slot rects as screen fractions, mirrors the engine's splitSlotRects */
export interface SlotRect {
  x: number
  y: number
  width: number
  height: number
}

/** aspects: width / height, 0 for any size (web) */
export function splitSlotRects(
  screen: { width: number; height: number },
  aspects: number[],
  layout: SplitLayout
): SlotRect[] {
  if (aspects.length === 0 || screen.width <= 0 || screen.height <= 0) return []

  const columns = screen.width >= screen.height
  const length = columns ? screen.width : screen.height
  const across = columns ? screen.height : screen.width
  const known = aspects.filter((a) => a > 0 && Number.isFinite(a)).map((a) => (columns ? a : 1 / a))
  const fallback =
    known.length > 0 ? known.reduce((sum, a) => sum + a, 0) / known.length : length / across / aspects.length
  const weights = aspects.map((a) => {
    if (layout === 'equal') return 1
    return a > 0 && Number.isFinite(a) ? (columns ? a : 1 / a) : fallback
  })
  const total = weights.reduce((sum, w) => sum + w, 0)

  let scale = length / total
  let edge = 0
  if (layout === 'center' && total * across <= length) {
    scale = across
    edge = (length - total * across) / 2
  }

  return weights.map((weight) => {
    const from = edge
    edge += weight * scale
    const start = from / length
    const size = (weight * scale) / length
    return columns
      ? { x: start, y: 0, width: size, height: 1 }
      : { x: 0, y: start, width: 1, height: size }
  })
}

const SIZE_RE = /(\d+)\s*x\s*(\d+)/

/** from resolution tags, 16:9 when they say nothing */
export function aspectFromResolutions(resolutions: string[] | undefined): number {
  for (const tag of resolutions ?? []) {
    const match = SIZE_RE.exec(tag)
    if (match && Number(match[2]) > 0) return Number(match[1]) / Number(match[2])
    if (tag.startsWith('Portrait')) return 9 / 16
  }
  return 16 / 9
}
