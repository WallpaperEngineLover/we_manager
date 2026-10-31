import { useQueryClient } from '@tanstack/react-query'
import { BellOff, X } from 'lucide-react'
import { useAllWallpapers, useConfig } from '../../hooks/queries'
import { hasEngineFlags } from '@shared/engineFlags'
import { t } from '../../i18n'

export default function AutomuteIgnoreSettings() {
  const queryClient = useQueryClient()
  const config = useConfig()
  const ignored = useAllWallpapers()
    .filter((w) => w.engineFlags?.automute === false)
    .sort((a, b) => a.title.localeCompare(b.title))

  async function remove(id: string) {
    const wallpaper = ignored.find((w) => w.id === id)
    if (!wallpaper) return
    const next = { ...wallpaper.engineFlags }
    delete next.automute
    await window.electronAPI.library.update(id, { engineFlags: hasEngineFlags(next) ? next : undefined })
    void queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
        {t('automuteIgnore.title')}
      </label>
      <p className="mt-1 text-xs text-gray-600">{t('automuteIgnore.description')}</p>
      {config && !config.engineFlags?.automute && (
        <p className="mt-1 text-xs text-amber-300">{t('automuteIgnore.globalOff')}</p>
      )}

      <div className="mt-2 space-y-1.5">
        {ignored.length === 0 && <p className="text-xs text-gray-500">{t('automuteIgnore.empty')}</p>}
        {ignored.map((w) => (
          <div key={w.id} className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2">
            <BellOff size={13} className="shrink-0 text-gray-500" />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{w.title}</span>
            <button
              onClick={() => void remove(w.id)}
              title={t('automuteIgnore.remove')}
              className="rounded p-1 text-gray-500 hover:text-red-400"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
