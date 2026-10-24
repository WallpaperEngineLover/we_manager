import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Play, Check } from 'lucide-react'
import { compatStatus } from '@shared/compat'
import type { ScreenTarget } from '@shared/types'
import { getPreviewSrc } from '../../utils/preview'
import { screenLabel } from '../../utils/screens'
import { useDisplayTargets } from '../../hooks/useDisplayTargets'
import PreviewImage from '../common/PreviewImage'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div className="flex h-full max-h-[600px] w-full max-w-2xl flex-col rounded-xl border border-fg/10 bg-popup shadow-2xl">
        <div className="flex items-center justify-between border-b border-fg/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-100">{t('diagnostics.pickTitle')}</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-fg/5 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        <p className="px-4 pt-3 text-xs text-gray-500">{t('diagnostics.pickHint', { seconds })}</p>

        <div className="flex items-center gap-2 px-4 py-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus
              type="text"
              placeholder={t('picker.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-fg/5 py-1.5 pl-8 pr-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>
          {perScreen && (
            <select
              value={chosenScreen}
              onChange={(e) => setScreen(e.target.value)}
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

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading && <p className="p-4 text-center text-xs text-gray-500">{t('common.loading')}</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-gray-500">{t('picker.empty')}</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((w) => {
              const isSelected = selected === w.id
              const previewSrc = getPreviewSrc(w)
              const status = compatStatus(w.compat)
              return (
                <button
                  key={w.id}
                  onClick={() => setSelected(isSelected ? null : w.id)}
                  data-preview-hover=""
                  className={`group relative overflow-hidden rounded-xl bg-card text-left transition-all ${
                    isSelected ? 'ring-2 ring-accent-500' : 'hover:ring-1 hover:ring-accent-500/50'
                  }`}
                >
                  <div className="aspect-video bg-sunken">
                    {previewSrc ? (
                      <PreviewImage src={previewSrc} alt={w.title} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-600">
                        {t('card.noPreview')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 p-2">
                    <span className="flex min-w-0 items-center gap-1 text-xs text-gray-300" title={w.title}>
                      <CompatStatusIcon status={status} />
                      <span className="truncate">{w.title}</span>
                    </span>
                    {isSelected && <Check size={12} className="shrink-0 text-accent-400" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-fg/5 px-4 py-3">
          <button
            onClick={() => onCollect(null)}
            className="rounded-lg bg-fg/5 px-3 py-2 text-xs text-gray-300 hover:bg-fg/10"
          >
            {t('diagnostics.pickCurrent')}
          </button>
          <button
            onClick={() => selected && onCollect({ wallpaperId: selected, screen: chosenScreen })}
            disabled={!selected}
            className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
          >
            <Play size={14} />
            {t('diagnostics.pickCollect')}
          </button>
        </div>
      </div>
    </div>
  )
}
