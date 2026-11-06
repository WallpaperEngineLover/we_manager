import { describe, expect, it } from 'vitest'
import { CARD_PLAY_DEFAULT_SCREEN, cardPlayNeedsScreenChoice } from './playScreen'

describe('card play screen question', () => {
  it('asks in per-screen mode when two monitors are connected', () => {
    expect(cardPlayNeedsScreenChoice('per-screen', ['HDMI-A-3', 'HDMI-A-2'])).toBe(true)
  })

  it('does not ask for one monitor, shared mode, or when a screen was already chosen by the caller', () => {
    expect(cardPlayNeedsScreenChoice('per-screen', ['HDMI-A-3'])).toBe(false)
    expect(cardPlayNeedsScreenChoice('shared', ['HDMI-A-3', 'HDMI-A-2'])).toBe(false)
    expect(cardPlayNeedsScreenChoice('per-screen', ['*'])).toBe(false)
  })

  it('defaults to every screen, which is what Enter used to do', () => {
    expect(CARD_PLAY_DEFAULT_SCREEN).toBe('*')
  })
})
