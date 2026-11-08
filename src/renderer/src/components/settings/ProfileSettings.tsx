import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Play, Trash2 } from 'lucide-react'
import { useProfiles } from '../../hooks/queries'
import { inputClass } from '../common/inputClass'
import { useToast } from '../common/Toast'
import { t } from '../../i18n'

export default function ProfileSettings() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const profiles = useProfiles()
  const [name, setName] = useState('')

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
  }

  async function capture() {
    const trimmed = name.trim()
    if (!trimmed) {
      showToast(t('profiles.nameFirst'), { warning: true })
      return
    }
    await window.electronAPI.profiles.capture(trimmed)
    setName('')
    refresh()
  }

  async function apply(id: string) {
    try {
      await window.electronAPI.profiles.apply(id)
    } catch (err) {
      showToast((err as Error).message, { warning: true, durationMs: 6000 })
    }
  }

  async function remove(id: string) {
    const { disabled } = await window.electronAPI.profiles.delete(id)
    refresh()
    if (disabled > 0) {
      void queryClient.invalidateQueries({ queryKey: ['app-rules'] })
      void queryClient.invalidateQueries({ queryKey: ['app-rules-active'] })
      void queryClient.invalidateQueries({ queryKey: ['schedule'] })
      showToast(t('profiles.rulesOff'), { warning: true })
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('profiles.title')}</label>
      <p className="mt-1 text-xs text-gray-600">{t('profiles.description')}</p>

      <div className="mt-3 space-y-1.5">
        {profiles.map((profile) => (
          <div key={profile.id} className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-sm text-gray-200">{profile.name}</p>
            <button onClick={() => void apply(profile.id)} title={t('profiles.apply')} className="rounded p-1 text-gray-500 hover:text-gray-200">
              <Play size={13} />
            </button>
            <button onClick={() => void remove(profile.id)} title={t('common.delete')} className="rounded p-1 text-gray-500 hover:text-red-400">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') void capture() }}
          placeholder={t('profiles.namePlaceholder')}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button
          onClick={() => void capture()}
          className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-300 hover:bg-fg/10"
        >
          <Camera size={14} />
          {t('profiles.saveCurrent')}
        </button>
      </div>
    </div>
  )
}
