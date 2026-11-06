import { describe, expect, it } from 'vitest'
import { mergeSkipScreens, planRestore, playlistSkipScreens, restoreSuperseded, type RestoreInput } from './restore-plan'

function input(patch: Partial<RestoreInput> = {}): RestoreInput {
  return {
    skipped: false,
    connected: true,
    animated: true,
    onDisk: true,
    localPath: '/w/a',
    splitSlotId: null,
    wallpaperId: 'a',
    ...patch
  }
}

describe('planRestore', () => {
  it('leaves a running engine that already shows the wallpaper', () => {
    expect(planRestore(input({ running: { split: false, wallpaperPath: '/w/a' } }))).toBe('skip')
  })

  it('hotswaps when a different wallpaper is running', () => {
    expect(planRestore(input({ running: { split: false, wallpaperPath: '/w/old' } }))).toBe('wallpaper')
  })

  it('leaves a running split alone', () => {
    expect(planRestore(input({ running: { split: true, wallpaperPath: '/w/a' }, splitSlotId: 'a' }))).toBe('skip')
  })

  it('restores a split that is not running through the split, not as one wallpaper', () => {
    expect(planRestore(input({ splitSlotId: 'a', wallpaperId: 'a' }))).toBe('split')
  })

  it('restores the assigned wallpaper when it is not the split first slot', () => {
    expect(planRestore(input({ splitSlotId: 'slot', wallpaperId: 'a' }))).toBe('wallpaper')
  })

  it('skips a screen a playlist or schedule already claimed', () => {
    expect(planRestore(input({ skipped: true }))).toBe('skip')
  })

  it('skips a wallpaper whose folder is missing', () => {
    expect(planRestore(input({ onDisk: false }))).toBe('skip')
  })

  it('skips a static image, which has no engine and would cover every screen', () => {
    expect(planRestore(input({ animated: false }))).toBe('skip')
  })
})

describe('playlistSkipScreens', () => {
  it('skips the saved playlist screens when playlists are not resumed', () => {
    expect(playlistSkipScreens(true, ['HDMI-A-2'], [])).toEqual(['HDMI-A-2'])
  })

  it('skips only the screens that actually resumed', () => {
    expect(playlistSkipScreens(false, ['HDMI-A-2'], ['HDMI-A-3'])).toEqual(['HDMI-A-3'])
  })
})

describe('restoreSuperseded', () => {
  it('keeps going when the screen is still the one restore read', () => {
    expect(restoreSuperseded('a', 'a', 0, 0)).toBe(false)
  })

  it('stops when the assignment changed while an earlier screen was launching', () => {
    expect(restoreSuperseded('a', 'b', 0, 1)).toBe(true)
  })

  it('stops when the same wallpaper was launched again', () => {
    expect(restoreSuperseded('a', 'a', 0, 1)).toBe(true)
  })

  it('stops when the assignment was cleared', () => {
    expect(restoreSuperseded('a', undefined, 0, 1)).toBe(true)
  })
})

describe('mergeSkipScreens', () => {
  it('keeps playlist, autostart and schedule screens together', () => {
    expect([...mergeSkipScreens(['HDMI-A-2'], ['*'], ['HDMI-A-3'])]).toEqual(['HDMI-A-2', '*', 'HDMI-A-3'])
  })
})
