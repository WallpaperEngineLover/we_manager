import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_BORDERS, normalizeCardBorders } from './cardBorders'

describe('normalizeCardBorders', () => {
  it('fills in defaults', () => {
    expect(normalizeCardBorders(undefined)).toEqual(DEFAULT_CARD_BORDERS)
    expect(normalizeCardBorders({ liked: { enabled: false } }).liked).toEqual({ enabled: false, color: '#22c55e' })
  })

  it('rejects colors that are not 6-digit hex', () => {
    expect(normalizeCardBorders({ favorite: { color: 'red' } }).favorite.color).toBe('#ec4899')
    expect(normalizeCardBorders({ favorite: { color: '#AABBCC' } }).favorite.color).toBe('#aabbcc')
  })

  it('carries over the old like-borders switch until borders are saved', () => {
    const migrated = normalizeCardBorders(undefined, false)
    expect(migrated.liked.enabled).toBe(false)
    expect(migrated.failed.enabled).toBe(false)
    expect(migrated.disliked.enabled).toBe(true)
    expect(normalizeCardBorders({}, false).liked.enabled).toBe(true)
  })
})
