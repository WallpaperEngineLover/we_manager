import { beforeEach, describe, expect, it, vi } from 'vitest'

const writes: string[] = []

vi.mock('electron', () => ({ app: { on: () => {} } }))
vi.mock('electron-store', () => ({
  default: class {
    private data: Record<string, unknown> = {}
    get(key: string): unknown {
      return this.data[key]
    }
    set(key: string, value: unknown): void {
      writes.push(key)
      this.data[key] = value
    }
  }
}))

import { clearAssignment, getAssignments, isSplitActive, markSplitActive, setAssignment } from './wallpaper-state.service'

beforeEach(() => {
  clearAssignment()
  writes.length = 0
})

describe('split flag', () => {
  it('is dropped when a single wallpaper takes the screen, and only there', () => {
    setAssignment('DP-1', 'a')
    setAssignment('DP-2', 'b')
    markSplitActive('DP-1')
    markSplitActive('DP-2')

    setAssignment('DP-1', 'c')

    expect(isSplitActive('DP-1')).toBe(false)
    expect(isSplitActive('DP-2')).toBe(true)
  })

  it('is dropped everywhere when the shared screen takes a wallpaper', () => {
    setAssignment('DP-1', 'a')
    markSplitActive('DP-1')

    setAssignment('*', 'b')

    expect(isSplitActive('DP-1')).toBe(false)
    expect(getAssignments()).toEqual({ '*': 'b' })
  })

  it('goes with the assignment of one screen, or all of them', () => {
    setAssignment('DP-1', 'a')
    setAssignment('DP-2', 'b')
    markSplitActive('DP-1')
    markSplitActive('DP-2')

    clearAssignment('DP-1')
    expect(isSplitActive('DP-1')).toBe(false)
    expect(isSplitActive('DP-2')).toBe(true)

    clearAssignment()
    expect(isSplitActive('DP-2')).toBe(false)
  })

  it('stays when only the shared assignment is cleared', () => {
    setAssignment('DP-1', 'a')
    markSplitActive('DP-1')

    clearAssignment('*')

    expect(isSplitActive('DP-1')).toBe(true)
  })

  it('costs no extra write while no split was ever active', () => {
    setAssignment('DP-1', 'a')
    clearAssignment('DP-1')
    clearAssignment()

    expect(writes).not.toContain('splitActive')
  })
})
