import { describe, expect, it } from 'vitest'
import { CARD_PLAY_DEFAULT_SCREEN, cardPlayNeedsScreenChoice } from './playScreen'

describe('card play screen question', () => {
  it('asks when two monitors are connected', () => {
    expect(cardPlayNeedsScreenChoice(['HDMI-A-3', 'HDMI-A-2'])).toBe(true)
  })

  it('does not ask for one monitor or for the single target of shared mode', () => {
    expect(cardPlayNeedsScreenChoice(['HDMI-A-3'])).toBe(false)
    expect(cardPlayNeedsScreenChoice(['*'])).toBe(false)
  })

  it('defaults to every screen, which is what Enter used to do', () => {
    expect(CARD_PLAY_DEFAULT_SCREEN).toBe('*')
  })
})
