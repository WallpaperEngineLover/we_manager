import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Type, X } from 'lucide-react'
import { t } from '../../i18n'

export default function FontSettings() {
  const queryClient = useQueryClient()
  const { data: fonts = [] } = useQuery({
    queryKey: ['user-fonts'],
    queryFn: () => window.electronAPI.fonts.list(),
    staleTime: Infinity
  })
  const [status, setStatus] = useState<string | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['user-fonts'] })
    await queryClient.invalidateQueries({ queryKey: ['lwe-fonts'] })
  }

  async function handleAdd() {
    const result = await window.electronAPI.fonts.add()
    setStatus(
      result.rejected.length > 0
        ? t('fonts.rejected', { files: result.rejected.join(', ') })
        : result.added.length > 0
          ? t('fonts.added', { count: result.added.length })
          : null
    )
    await refresh()
  }

  async function handleRemove(name: string) {
    await window.electronAPI.fonts.remove(name)
    setStatus(null)
    await refresh()
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
        {t('fonts.title')}
      </label>
      <p className="mt-1 text-xs text-gray-600">{t('fonts.description')}</p>
      {fonts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {fonts.map((font) => (
            <li key={font.name} className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200">
              <Type size={14} className="shrink-0 text-gray-500" />
              <span className="flex-1 truncate">{font.name}</span>
              <span className="text-xs text-gray-500">{(font.size / 1024 / 1024).toFixed(1)} MB</span>
              <button
                onClick={() => void handleRemove(font.name)}
                title={t('fonts.remove')}
                className="rounded p-0.5 text-gray-500 hover:bg-fg/10 hover:text-gray-200"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => void handleAdd()}
        className="mt-3 flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-300 hover:bg-fg/10"
      >
        <Type size={16} />
        {t('fonts.add')}
      </button>
      {status && <p className="mt-2 text-xs text-gray-500">{status}</p>}
    </div>
  )
}
