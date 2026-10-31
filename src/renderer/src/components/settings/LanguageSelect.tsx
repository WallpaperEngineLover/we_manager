import { useQueryClient } from '@tanstack/react-query'
import { Languages } from 'lucide-react'
import { LANGUAGES, resolveLanguage, type LanguagePreference } from '@shared/i18n'
import { useConfig } from '../../hooks/queries'
import { t } from '../../i18n'

export default function LanguageSelect() {
  const queryClient = useQueryClient()
  const config = useConfig()
  const preference = config?.language ?? 'system'
  const system = preference === 'system' && config ? config.uiLanguage : resolveLanguage('system', navigator.languages)
  const systemName = LANGUAGES.find((l) => l.code === system)?.name

  async function change(language: LanguagePreference) {
    await window.electronAPI.config.setLanguage(language)
    await queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-300">
      <Languages size={14} className="text-gray-500" />
      <select
        value={preference}
        onChange={(e) => void change(e.target.value as LanguagePreference)}
        title={t('language.title')}
        className="rounded-lg bg-fg/5 px-2 py-1.5 text-sm text-gray-200 outline-none"
      >
        <option value="system">{t('language.system', { language: systemName ?? 'English' })}</option>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
