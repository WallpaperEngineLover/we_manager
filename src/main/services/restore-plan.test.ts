import { describe, expect, it } from 'vitest'
import { mergePlayers, mergeSkipScreens, planRestore, savedScreensFor, trySplit, playlistSkipScreens, restoreSuperseded, type RestoreInput } from './restore-plan'

function input(patch: Partial<RestoreInput> = {}): RestoreInput {
  return {
    skipped: false,
    connected: true,
    animated: true,
    onDisk: true,
    localPath: '/w/a',
    splitActive: false,
    splitShowable: false,
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
    expect(planRestore(input({ running: { split: true, wallpaperPath: '/w/a' }, splitActive: true, splitShowable: true }))).toBe('skip')
  })

  it('restores a split that is not running through the split, not as one wallpaper', () => {
    expect(planRestore(input({ splitActive: true, splitShowable: true }))).toBe('split')
  })

  it('restores a single wallpaper when its screen has a split configured but not showing', () => {
    expect(planRestore(input({ splitActive: false, splitShowable: true }))).toBe('wallpaper')
  })

  it('does not restart a healthy single engine because a split is configured', () => {
    expect(planRestore(input({ running: { split: false, wallpaperPath: '/w/a' }, splitShowable: true }))).toBe('skip')
  })

  it('falls back to the wallpaper when the active split has nothing showable left', () => {
    expect(planRestore(input({ splitActive: true, splitShowable: false }))).toBe('wallpaper')
  })

  it('skips a screen a playlist or schedule already claimed', () => {
    expect(planRestore(input({ skipped: true }))).toBe('skip')
  })

  it('waits for a wallpaper whose folder is missing', () => {
    expect(planRestore(input({ onDisk: false }))).toBe('wait')
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

describe('mergePlayers', () => {
  const saved = { 'DP-1': { playlistId: 'a' }, 'DP-2': { playlistId: 'b' } }

  it('keeps the saved players nothing touched', () => {
    expect(mergePlayers(saved, {}, [])).toEqual(saved)
  })

  it('lets a live player or a stopped screen replace its saved one', () => {
    expect(mergePlayers(saved, { 'DP-1': { playlistId: 'c' } }, ['DP-1', 'DP-2'])).toEqual({
      'DP-1': { playlistId: 'c' }
    })
  })

  it('keeps an untouched screen next to a live one', () => {
    expect(mergePlayers(saved, { 'DP-1': { playlistId: 'c' } }, ['DP-1'])).toEqual({
      'DP-1': { playlistId: 'c' },
      'DP-2': { playlistId: 'b' }
    })
  })
})

describe('savedScreensFor', () => {
  it('names every saved screen for a stop of all of them', () => {
    expect(savedScreensFor(['DP-1', 'DP-2'])).toEqual(['DP-1', 'DP-2'])
    expect(savedScreensFor(['DP-1', 'DP-2'], '*')).toEqual(['DP-1', 'DP-2'])
  })

  it('names the screen itself and the shared entry for one screen', () => {
    expect(savedScreensFor(['DP-1', 'DP-2', '*'], 'DP-1')).toEqual(['DP-1', '*'])
    expect(savedScreensFor(['DP-2'], 'DP-1')).toEqual([])
  })
})

function attempt(show: () => Promise<void>, marks: number[]) {
  let uses = 0
  const errors: unknown[] = []

  return {
    errors,
    run: () =>
      trySplit({
        show: async () => {
          uses += 1
          for (const _ of marks) uses += 1
          await show()
        },
        uses: () => uses,
        onError: (error) => errors.push(error)
      })
  }
}

describe('trySplit', () => {
  it('is done when the split shows', async () => {
    expect(await attempt(async () => {}, []).run()).toBe('done')
  })

  it('has failed when only the try itself marked the screen, even if the assignment is gone', async () => {
    const t = attempt(async () => { throw new Error('exited') }, [])

    expect(await t.run()).toBe('failed')
    expect(t.errors).toHaveLength(1)
  })

  it('has failed too when the try threw before it marked the screen', async () => {
    let uses = 0

    expect(await trySplit({ show: async () => { throw new Error('early') }, uses: () => uses, onError: () => {} })).toBe('failed')
    expect(uses).toBe(0)
  })

  it('leaves the screen when somebody else marked it during the try', async () => {
    expect(await attempt(async () => { throw new Error('replaced') }, [1]).run()).toBe('left')
  })
})

