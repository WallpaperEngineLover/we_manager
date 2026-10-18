import { useLayoutEffect, useState, type RefObject } from 'react'

export interface Point {
  x: number
  y: number
}

export function useClampedPosition(
  ref: RefObject<HTMLElement | null>,
  point: Point | null | undefined,
  padding = 8
): Point | null {
  const [result, setResult] = useState<{ raw: Point; clamped: Point } | null>(null)

  useLayoutEffect(() => {
    if (!point) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - padding
    const maxY = window.innerHeight - rect.height - padding
    setResult({
      raw: point,
      clamped: {
        x: Math.max(padding, Math.min(point.x, maxX)),
        y: Math.max(padding, Math.min(point.y, maxY))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, point?.x, point?.y, padding])

  if (!point) return null
  if (result && result.raw.x === point.x && result.raw.y === point.y) return result.clamped
  return point
}

export function useFlipSide(ref: RefObject<HTMLElement | null>, active: boolean, padding = 8): 'left' | 'right' {
  const [side, setSide] = useState<'left' | 'right'>('right')

  useLayoutEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSide(rect.right > window.innerWidth - padding ? 'left' : 'right')
  }, [ref, active, padding])

  return side
}
