
export type CardBorderKind = 'liked' | 'disliked' | 'favorite' | 'failed'

interface CardBorder {
  enabled: boolean
  color: string
}

export type CardBorders = Record<CardBorderKind, CardBorder>

export const CARD_BORDER_KINDS: CardBorderKind[] = ['liked', 'disliked', 'favorite', 'failed']

export const DEFAULT_CARD_BORDERS: CardBorders = {
  liked: { enabled: true, color: '#22c55e' },
  disliked: { enabled: true, color: '#ef4444' },
  favorite: { enabled: true, color: '#ec4899' },
  failed: { enabled: true, color: '#f59e0b' }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

// legacyVoteBorders covered liked and failed
export function normalizeCardBorders(value: unknown, legacyVoteBorders = true): CardBorders {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<CardBorderKind, Partial<CardBorder>>>
  const out = {} as CardBorders
  for (const kind of CARD_BORDER_KINDS) {
    const fallback = DEFAULT_CARD_BORDERS[kind]
    const entry = raw[kind] ?? {}
    const legacyOff = value == null && !legacyVoteBorders && (kind === 'liked' || kind === 'failed')
    out[kind] = {
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : !legacyOff && fallback.enabled,
      color: typeof entry.color === 'string' && HEX_COLOR.test(entry.color) ? entry.color.toLowerCase() : fallback.color
    }
  }
  return out
}
