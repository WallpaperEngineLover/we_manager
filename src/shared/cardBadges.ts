export type CardBadgeKind = 'hdr' | 'hrtf'

export type CardBadges = Record<CardBadgeKind, boolean>

export const CARD_BADGE_KINDS: CardBadgeKind[] = ['hdr', 'hrtf']

export const DEFAULT_CARD_BADGES: CardBadges = { hdr: true, hrtf: true }

export function normalizeCardBadges(value: unknown): CardBadges {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<CardBadgeKind, unknown>>
  const out = {} as CardBadges
  for (const kind of CARD_BADGE_KINDS) {
    out[kind] = typeof raw[kind] === 'boolean' ? (raw[kind] as boolean) : DEFAULT_CARD_BADGES[kind]
  }
  return out
}
