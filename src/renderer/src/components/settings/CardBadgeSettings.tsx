import { useQueryClient } from '@tanstack/react-query'
import { CARD_BADGE_KINDS, type CardBadgeKind, type CardBadges } from '@shared/cardBadges'
import Toggle from '../common/Toggle'
import { useCardBadges } from '../../hooks/useCardBorders'
import { t } from '../../i18n'
import type { MessageKey } from '@shared/i18n'

const ROWS: Record<CardBadgeKind, { label: string; hint: MessageKey; className: string }> = {
  hdr: { label: 'HDR', hint: 'badges.hdrHint', className: 'text-amber-300' },
  hrtf: { label: 'HRTF', hint: 'badges.hrtfHint', className: 'text-sky-300' }
}

export default function CardBadgeSettings() {
  const queryClient = useQueryClient()
  const badges = useCardBadges()

  async function change(kind: CardBadgeKind) {
    const next: CardBadges = { ...badges, [kind]: !badges[kind] }
    queryClient.setQueryData(['config'], (old: object | undefined) => (old ? { ...old, cardBadges: next } : old))
    await window.electronAPI.config.setCardBadges(next)
    queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('badges.title')}</label>
      <p className="mt-1 text-xs text-gray-600">{t('badges.description')}</p>
      <div className="mt-3 space-y-3">
        {CARD_BADGE_KINDS.map((kind) => (
          <div key={kind} className="flex items-start gap-3">
            <Toggle on={badges[kind]} onClick={() => change(kind)} />
            <div className="min-w-0 flex-1">
              <span
                className={`rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold leading-none tracking-wide ${ROWS[kind].className}`}
              >
                {ROWS[kind].label}
              </span>
              <p className="mt-1 text-xs text-gray-600">{t(ROWS[kind].hint)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
