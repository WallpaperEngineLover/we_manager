import { describe, expect, it } from 'vitest'
import { hasImageAdjustments, imageAdjustmentArgs, imageAdjustmentLines } from './imageAdjustments'

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
