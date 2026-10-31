import { describe, expect, it } from 'vitest'
import { IMAGE_FILTERS, NEUTRAL_COLOR_VALUE, hasImageAdjustments, imageAdjustmentArgs, imageAdjustmentLines } from './imageAdjustments'

describe('imageAdjustmentArgs', () => {
  it('leaves unset fields out', () => {
    expect(imageAdjustmentArgs(undefined)).toEqual([])
    expect(imageAdjustmentArgs({ flip: true })).toEqual(['--flip', 'on'])
  })

  it('turns an empty filter into none', () => {
    expect(imageAdjustmentArgs({ filter: '' })).toEqual(['--image-filter', 'none'])
  })

  it('puts the color switch after the sliders so it can turn them off', () => {
    const args = imageAdjustmentArgs({ colorEnabled: false, brightness: 70 })
    expect(args.indexOf('--color-options')).toBeGreaterThan(args.indexOf('--brightness'))
  })
})

describe('imageAdjustmentLines', () => {
  it('writes every set field', () => {
    expect(
      imageAdjustmentLines({ filter: 'lutx32_amber', filterStrength: 40, colorEnabled: true, hue: 60, flip: false })
    ).toEqual(['image-filter=lutx32_amber', 'image-filter-strength=40', 'hue=60', 'color-options=on', 'flip=off'])
  })
})

describe('hasImageAdjustments', () => {
  it('is false for an empty object', () => {
    expect(hasImageAdjustments({})).toBe(false)
    expect(hasImageAdjustments({ filter: '' })).toBe(true)
  })
})

describe('every field', () => {
  const all = {
    filter: 'desert_4',
    filterStrength: 80,
    colorEnabled: true,
    brightness: 55,
    contrast: 45,
    saturation: 30,
    hue: 10,
    flip: true
  }

  it('is passed as engine arguments in a fixed order', () => {
    expect(imageAdjustmentArgs(all)).toEqual([
      '--image-filter', 'desert_4',
      '--image-filter-strength', '80',
      '--brightness', '55',
      '--contrast', '45',
      '--saturation', '30',
      '--hue', '10',
      '--color-options', 'on',
      '--flip', 'on'
    ])
  })

  it('is written as control file lines in the same order', () => {
    expect(imageAdjustmentLines(all)).toEqual([
      'image-filter=desert_4',
      'image-filter-strength=80',
      'brightness=55',
      'contrast=45',
      'saturation=30',
      'hue=10',
      'color-options=on',
      'flip=on'
    ])
  })

  it('writes off for false switches', () => {
    expect(imageAdjustmentArgs({ colorEnabled: false, flip: false })).toEqual(['--color-options', 'off', '--flip', 'off'])
    expect(imageAdjustmentLines({ colorEnabled: false, flip: false })).toEqual(['color-options=off', 'flip=off'])
  })

  it('turns an empty filter into none in the control file too', () => {
    expect(imageAdjustmentLines({ filter: '' })).toEqual(['image-filter=none'])
  })

  it('sends zero values, they are real settings', () => {
    expect(imageAdjustmentArgs({ hue: 0, filterStrength: 0 })).toEqual(['--image-filter-strength', '0', '--hue', '0'])
    expect(hasImageAdjustments({ hue: 0 })).toBe(true)
  })

  it('has no adjustments when undefined or every field is undefined', () => {
    expect(hasImageAdjustments(undefined)).toBe(false)
    expect(hasImageAdjustments({ filter: undefined, flip: undefined })).toBe(false)
  })
})

describe('IMAGE_FILTERS', () => {
  it('lists the 25 filters of Wallpaper Engine in its order', () => {
    expect(IMAGE_FILTERS.map((f) => f.value)).toEqual([
      'k23_b', 'lutx32_adventure', 'lutx32_coloration', 'simple_film', 'lutx32_bluenavy', '80s_post-apocalyptic_action',
      'desert_4', 'desperado', 'lutx32_dusk', 'lutx32_honeyb', 'lutx32_sandyskyd', 'lutx32_slate',
      'lutx32_westernf', 'setting_sun', 'tower', 'lutx32_amber', 'aliens_2', 'lutx32_daisy', 'lutx32_emeraldd',
      'lutx32_ferne', 'lutx32_backsea', 'lutx32_beach', 'lutx32_studio', 'sharp_wasteland', 'gamebob_2'
    ])
    expect(IMAGE_FILTERS.map((f) => f.label)).toEqual([
      'Vibrant Contrast', 'Vibrant Darkness', 'Color Boost', 'Shadow Boost', 'Moon Light', 'Late Night', 'Desert',
      'Midday Sun', 'Sunrise', 'Honey', 'Autumn', 'Sepia Modern', 'Western', 'Sunset', 'Color Crush', 'Amber',
      'Toxic Green', 'Daisy', 'Emerald', 'Overcast', 'Blueshift', 'Beach', 'Studio Lighting', 'Wasteland', 'Retro Handheld'
    ])
  })

  it('has a neutral slider value in the middle', () => {
    expect(NEUTRAL_COLOR_VALUE).toBe(50)
  })
})
