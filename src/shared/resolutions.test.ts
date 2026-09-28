import { describe, expect, it } from 'vitest'
import {
  ALL_RESOLUTION_TAGS,
  WE_RESOLUTION_GROUPS,
  resolutionsFromTags,
  isGroupSelected,
  setGroupSelected,
  migrateResolutionSelection
} from './resolutions'

describe('resolutions', () => {
  it('lists the 25 tags of WE', () => {
    expect(ALL_RESOLUTION_TAGS).toHaveLength(25)
    expect(new Set(ALL_RESOLUTION_TAGS).size).toBe(25)
  })

  it('picks resolution tags case-insensitively in WE spelling', () => {
    expect(resolutionsFromTags(['Anime', 'Other Resolution', '1920 x 1080', 'dual standard definition', '1920 x 1080']))
      .toEqual(['Other resolution', '1920 x 1080', 'Dual Standard Definition'])
  })

  it('toggles whole groups', () => {
    const dual = WE_RESOLUTION_GROUPS.find((g) => g.label === 'Dual Monitor')!
    const on = setGroupSelected(['1920 x 1080'], dual, true)
    expect(isGroupSelected(on, dual)).toBe(true)
    expect(setGroupSelected(on, dual, false)).toEqual(['1920 x 1080'])
  })

  it('migrates an old full selection to the full current list', () => {
    const oldAll = [
      'Standard Definition', '1280 x 720', '1366 x 768', '1920 x 1080', '2560 x 1440', '3840 x 2160',
      'Ultrawide 2560 x 1080', 'Ultrawide 3440 x 1440', 'Ultrawide 3840 x 1600',
      'Dual 3840 x 1080', 'Dual 5120 x 1440', 'Dual 7680 x 2160',
      'Triple 4096 x 768', 'Triple 5760 x 1080', 'Triple 7680 x 1440', 'Triple 11520 x 2160',
      'Portrait 720 x 1280', 'Portrait 1080 x 1920', 'Portrait 1440 x 2560', 'Portrait 2160 x 3840',
      'Other Resolution', 'Dynamic Resolution'
    ]
    expect(migrateResolutionSelection(oldAll)).toEqual(ALL_RESOLUTION_TAGS)
    expect(migrateResolutionSelection(['Other Resolution', 'Ultrawide 3840 x 1600'])).toEqual(['Other resolution'])
    expect(migrateResolutionSelection(undefined)).toEqual([])
  })
})
