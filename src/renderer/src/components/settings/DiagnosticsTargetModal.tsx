import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { compatStatus } from '@shared/compat'
import type { ScreenTarget } from '@shared/types'
import { screenLabel } from '../../utils/screens'
import { useDisplayTargets } from '../../hooks/useDisplayTargets'
import { PickerCard, PickerFrame, PickerGrid, PickerSearch } from '../common/PickerParts'
import { CompatStatusIcon } from '../common/CompatBadge'
import { t } from '../../i18n'

export interface DiagnosticsChoice {
  wallpaperId: string
  screen: ScreenTarget
}

interface Props {
  seconds: number
  onCollect: (choice: DiagnosticsChoice | null) => void
  onClose: () => void
}

export default function DiagnosticsTargetModal({ seconds, onCollect, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const { targets, perScreen } = useDisplayTargets()
  const [screen, setScreen] = useState<ScreenTarget | null>(null)

  const { data: wallpapers = [], isLoading } = useQuery({
    queryKey: ['library', { sortBy: 'title', sortDir: 'asc' }],
    queryFn: () => window.electronAPI.library.getAll({ sortBy: 'title', sortDir: 'asc' })
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = wallpapers.filter((w) => w.localPath && (!q || w.title.toLowerCase().includes(q)))
    const flagged = (w: (typeof list)[number]) => (compatStatus(w.compat) === 'ok' ? 1 : 0)
    return [...list].sort((a, b) => flagged(a) - flagged(b))
  }, [wallpapers, search])

  const chosenScreen = screen && targets.includes(screen) ? screen : targets[0]

  return (
    <PickerFrame title={t('diagnostics.pickTitle')} onClose={onClose}>
      <p className="px-4 pt-3 text-xs text-gray-500">{t('diagnostics.pickHint', { seconds })}</p>

      <div className="flex items-center gap-2 px-4 py-2">
        <PickerSearch value={search} onChange={setSearch} />
        {perScreen && (
          <select
            value={chosenScreen}
            onChange={(e) => { setScreen(e.target.value) }}
            title={t('common.screen')}
            className="rounded-lg bg-fg/5 px-2 py-1.5 text-sm text-gray-200 outline-none"
          >
            {targets.map((target) => (
              <option key={target} value={target}>
                {screenLabel(target)}
              </option>
            ))}
          </select>
        )}
      </div>

      <PickerGrid loading={isLoading} empty={filtered.length === 0}>
        {filtered.map((w) => (
          <PickerCard
            key={w.id}
            wallpaper={w}
            selected={selected === w.id}
            onClick={() => { setSelected(selected === w.id ? null : w.id) }}
            label={
              <span className="flex min-w-0 items-center gap-1 text-xs text-gray-300" title={w.title}>
                <CompatStatusIcon status={compatStatus(w.compat)} />
                <span className="truncate">{w.title}</span>
              </span>
            }
          />
        ))}
      </PickerGrid>

      <div className="flex items-center justify-between gap-2 border-t border-fg/5 px-4 py-3">
        <button
          onClick={() => { onCollect(null) }}
          className="rounded-lg bg-fg/5 px-3 py-2 text-xs text-gray-300 hover:bg-fg/10"
        >
          {t('diagnostics.pickCurrent')}
        </button>
        <button
          onClick={() => { if (selected) onCollect({ wallpaperId: selected, screen: chosenScreen }) }}
          disabled={!selected}
          className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          <Play size={14} />
          {t('diagnostics.pickCollect')}
        </button>
      </div>
    </PickerFrame>
  )
}
