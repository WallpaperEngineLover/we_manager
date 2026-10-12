import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Heart, RotateCcw, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react'
import { CARD_BORDER_KINDS, DEFAULT_CARD_BORDERS, type CardBorderKind, type CardBorders } from '@shared/cardBorders'
import Toggle from '../common/Toggle'
import { useCardBorders } from '../../hooks/useCardBorders'

const ROWS: Record<CardBorderKind, { label: string; hint: string; icon: LucideIcon }> = {
  liked: { label: 'Liked', hint: 'Wallpapers you liked on Steam', icon: ThumbsUp },
  disliked: { label: 'Disliked', hint: 'Wallpapers you disliked on Steam', icon: ThumbsDown },
  favorite: { label: 'Favorite', hint: 'Wallpapers in your Steam favorites', icon: Heart },
  failed: {
    label: 'Failed',
    hint: 'Dashed, where a like, dislike or favorite still failed after retrying (hover the card for the reason, try again from the right-click menu). Kept until the app restarts.',
    icon: AlertTriangle
  }
}

const SAVE_DELAY_MS = 250

export default function CardBorderSettings() {
  const queryClient = useQueryClient()
  const saved = useCardBorders()
  // color pickers fire on every move, save once they settle
  const [draft, setDraft] = useState<CardBorders | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const borders = draft ?? saved

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  function change(kind: CardBorderKind, patch: Partial<CardBorders[CardBorderKind]>) {
    const next = { ...borders, [kind]: { ...borders[kind], ...patch } }
    setDraft(next)
    queryClient.setQueryData(['config'], (old: object | undefined) => (old ? { ...old, cardBorders: next } : old))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.electronAPI.config.setCardBorders(next)
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['config'] })
    }, SAVE_DELAY_MS)
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Card borders</label>
      <p className="mt-1 text-xs text-gray-600">
        Outlines around wallpaper cards. A card can show two: like or dislike on the inside, favorite around it.
      </p>
      <div className="mt-3 space-y-3">
        {CARD_BORDER_KINDS.map((kind) => {
          const { label, hint, icon: Icon } = ROWS[kind]
          const border = borders[kind]
          const isDefaultColor = border.color === DEFAULT_CARD_BORDERS[kind].color
          return (
            <div key={kind} className="flex items-start gap-3">
              <Toggle on={border.enabled} onClick={() => change(kind, { enabled: !border.enabled })} />
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm text-gray-300">
                  <Icon size={14} />
                  {label}
                </span>
                <p className="mt-0.5 text-xs text-gray-600">{hint}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {!isDefaultColor && (
                  <button
                    onClick={() => change(kind, { color: DEFAULT_CARD_BORDERS[kind].color })}
                    title="Reset to the default color"
                    className="rounded p-1 text-gray-500 hover:bg-fg/10 hover:text-gray-300"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
                <label
                  title={`${label} border color`}
                  className="relative h-6 w-10 cursor-pointer overflow-hidden rounded-md ring-1 ring-fg/15"
                  style={{ background: border.color, opacity: border.enabled ? 1 : 0.4 }}
                >
                  <input
                    type="color"
                    value={border.color}
                    onChange={(e) => change(kind, { color: e.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label={`${label} border color`}
                  />
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
