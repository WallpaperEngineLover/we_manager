import type { DisplayMode } from './types'

/** Card Play asks only in per-screen mode with two or more real monitors. All screens is the default. */
export function cardPlayNeedsScreenChoice(mode: DisplayMode, targets: readonly string[]): boolean {
  return mode === 'per-screen' && targets.filter((name) => name !== '*').length > 1
}

export const CARD_PLAY_DEFAULT_SCREEN = '*'
