import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, launchAppearanceKey, normalizeAppearance, wantsBlur } from './appearance'

describe('normalizeAppearance', () => {
  it('fills defaults for a missing or partial value', () => {
    expect(normalizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance({ theme: 'light' })).toEqual({ ...DEFAULT_APPEARANCE, theme: 'light' })
  })

  it('clamps out of range numbers and drops unknown themes', () => {
    const a = normalizeAppearance({
      theme: 'neon' as never,
      accentHue: 500,
      accentChroma: -1,
      windowOpacity: 3
    })
    expect(a).toEqual({
      theme: 'dark',
      accentHue: 360,
      accentChroma: 0,
      windowOpacity: 40,
      blur: false,
      previewAnimation: 'always'
    })
  })
})

describe('launchAppearanceKey', () => {
  it('ignores what can change live', () => {
    const base = normalizeAppearance({ windowOpacity: 80 })
    expect(launchAppearanceKey({ ...base, windowOpacity: 60, accentHue: 10, theme: 'light' })).toBe(
      launchAppearanceKey(base)
    )
  })

  it('changes when the window has to become transparent or blurred', () => {
    const opaque = normalizeAppearance({})
    expect(launchAppearanceKey({ ...opaque, windowOpacity: 90 })).not.toBe(launchAppearanceKey(opaque))
    expect(wantsBlur({ ...opaque, blur: true })).toBe(false)
    expect(wantsBlur({ ...opaque, blur: true, windowOpacity: 90 })).toBe(true)
  })
})
