import { describe, expect, it } from 'vitest'
import { createRangeCommit } from './rangeCommit'

describe('range commit', () => {
  it('ignores a max-value change that arrives with no drag', () => {
    const range = createRangeCommit()
    expect(range.change('128')).toBeNull()
    expect(range.end()).toBeNull()
  })

  it('commits the dragged value, including 0, and then ignores a later max event', () => {
    const range = createRangeCommit()
    range.pointerDown()
    expect(range.change('0')).toBe(0)
    expect(range.end()).toBe(0)
    expect(range.change('128')).toBeNull()
    expect(range.end()).toBeNull()
  })

  it('ends the drag on cancel, so a stray event afterwards is ignored', () => {
    const range = createRangeCommit()
    range.pointerDown()
    range.change('40')
    expect(range.end()).toBe(40)
    range.change('128')
    expect(range.end()).toBeNull()
  })

  it('tracks keyboard changes and commits on keyup', () => {
    const range = createRangeCommit()
    range.keyDown('ArrowRight')
    expect(range.change('15')).toBe(15)
    expect(range.end()).toBe(15)
  })
})
