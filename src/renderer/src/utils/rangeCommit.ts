import { isRangeKey } from './dom'

/** Remembers a range drag so a change event that arrives on its own cannot commit the max. */
export function createRangeCommit() {
  let dragging = false
  let live: number | null = null

  return {
    pointerDown() {
      dragging = true
    },
    keyDown(key: string) {
      if (isRangeKey(key)) dragging = true
    },
    change(raw: string): number | null {
      if (!dragging) return null
      const value = Number(raw)
      if (!Number.isFinite(value)) return null
      live = value
      return value
    },
    end(): number | null {
      const value = live
      live = null
      dragging = false
      return value
    }
  }
}
