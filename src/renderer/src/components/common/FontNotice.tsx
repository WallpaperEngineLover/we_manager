import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Type } from 'lucide-react'
import { t } from '../../i18n'

export default function FontNotice({ wallpaperPath, revision }: { wallpaperPath: string; revision?: number }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string | null>(null)
  const { data: needs = [] } = useQuery({
    queryKey: ['lwe-fonts', wallpaperPath, revision],
    queryFn: () => window.electronAPI.lwe.listFonts(wallpaperPath),
    staleTime: Infinity,
    retry: false
  })
  const missing = needs.filter((need) => need.status === 'missing')

  if (missing.length === 0) return null

  async function handleAdd() {
    const result = await window.electronAPI.fonts.add()
    setStatus(
      result.rejected.length > 0
        ? t('fonts.rejected', { files: result.rejected.join(', ') })
        : result.added.length > 0
          ? t('fonts.addedNotice')
          : null
    )
    await queryClient.invalidateQueries({ queryKey: ['user-fonts'] })
    await queryClient.invalidateQueries({ queryKey: ['lwe-fonts'] })
  }

  return (
    <div className="border-t border-fg/5 pt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-yellow-500/80">
        <Type size={12} />
        <span className="flex-1 text-left">{t('detail.fonts')}</span>
      </div>
      <ul className="space-y-1">
        {missing.map((need) => (
          <li key={`${need.kind}-${need.family}`} className="text-xs text-gray-400">
            {t(need.kind === 'emoji' ? 'detail.fontMissingEmoji' : 'detail.fontMissing', {
              family: need.family,
              using: need.using
            })}
            <span className="text-gray-600"> ({need.objects.join(', ')})</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => void handleAdd()}
        className="mt-2 flex items-center gap-1.5 rounded bg-fg/10 px-2 py-1 text-xs text-gray-300 hover:bg-fg/15"
      >
        <Type size={11} />
        {t('fonts.add')}
      </button>
      <p className="mt-1 text-xs text-gray-600">{t('detail.fontHint')}</p>
      {status && <p className="mt-1 text-xs text-gray-500">{status}</p>}
    </div>
  )
}
