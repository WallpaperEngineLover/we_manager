import { describe, expect, it } from 'vitest'
import { WE_ASSET_TYPES, WE_SHOW_ONLY, migrateTagSelection } from './weFilters'

describe('migrateTagSelection', () => {
  it('keeps what the Workshop still offers, under its current spelling', () => {
    expect(migrateTagSelection(['Approved', 'Audio Responsive', 'HDR'], WE_SHOW_ONLY)).toEqual([
      'Approved',
      'Audio responsive',
      'HDR'
    ])
  })

  it('drops tags the Workshop no longer lists', () => {
    expect(migrateTagSelection(['Mobile', 'Approved'], WE_SHOW_ONLY)).toEqual(['Approved'])
    expect(migrateTagSelection(['Shader', 'Texture', 'Sound'], WE_ASSET_TYPES)).toEqual(['Sound'])
  })

  it('takes anything but a list as nothing selected', () => {
    expect(migrateTagSelection(undefined, WE_SHOW_ONLY)).toEqual([])
    expect(migrateTagSelection('Approved', WE_SHOW_ONLY)).toEqual([])
  })
})
