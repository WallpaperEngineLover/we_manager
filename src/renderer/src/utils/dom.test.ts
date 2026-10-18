import { describe, expect, it } from 'vitest'
import { isRangeKey } from './dom'

describe('isRangeKey', () => {
  it('knows the keys that move a slider', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) {
      expect(isRangeKey(key)).toBe(true)
    }
  })

  it('ignores the keys that only move focus or modify', () => {
    for (const key of ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape', 'Enter', ' ', 'a']) {
      expect(isRangeKey(key)).toBe(false)
    }
  })
})
