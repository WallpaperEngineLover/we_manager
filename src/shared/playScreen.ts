export function cardPlayNeedsScreenChoice(targets: readonly string[]): boolean {
  return targets.filter((name) => name !== '*').length > 1
}

export const CARD_PLAY_DEFAULT_SCREEN = '*'
