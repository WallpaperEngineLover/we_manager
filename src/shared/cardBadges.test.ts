import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_BADGES, normalizeCardBadges } from './cardBadges'

describe('normalizeCardBadges', () => {
  it('shows every badge by default', () => {
    expect(normalizeCardBadges(null)).toEqual(DEFAULT_CARD_BADGES)
    expect(normalizeCardBadges('nonsense')).toEqual(DEFAULT_CARD_BADGES)
  })

  it('keeps stored choices and drops unknown keys', () => {
    expect(normalizeCardBadges({ hdr: false, other: true })).toEqual({ hdr: false, hrtf: true })
    expect(normalizeCardBadges({ hrtf: 'no' })).toEqual({ hdr: true, hrtf: true })
  })
})
