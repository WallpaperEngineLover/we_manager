import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { UPDATE_STATUS_KEY, useUpdateStatus } from '../../hooks/queries'
import UpdateCheckChoices from './UpdateCheckChoices'
import { t } from '../../i18n'

/** Asked once for installs that were set up before update checks existed */
export default function UpdatePrompt() {
  const status = useUpdateStatus()
  const queryClient = useQueryClient()
  const [checks, setChecks] = useState({ app: true, engine: true })
  const [saving, setSaving] = useState(false)

  if (!status || status.checks !== null) return null
  const showEngine = status.engineInstall !== 'bundled'

  async function save() {
    setSaving(true)
    try {
      const next = await window.electronAPI.updates.setChecks({ app: checks.app, engine: showEngine && checks.engine })
      queryClient.setQueryData(UPDATE_STATUS_KEY, next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div className="w-full max-w-md rounded-xl border border-fg/10 bg-popup p-6 shadow-2xl">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
          <RefreshCw size={16} className="text-accent-400" />
          {t('update.promptTitle')}
        </h3>
        <div className="mt-4">
          <UpdateCheckChoices value={checks} onChange={setChecks} showEngine={showEngine} />
        </div>
        <p className="mt-3 text-xs text-gray-600">{t('update.promptLater')}</p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
