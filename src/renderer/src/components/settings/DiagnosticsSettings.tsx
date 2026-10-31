import { useState } from 'react'
import { Loader2, FileText, Undo2 } from 'lucide-react'
import SettingsCard from './SettingsCard'
import DiagnosticsTargetModal, { type DiagnosticsChoice } from './DiagnosticsTargetModal'
import { t } from '../../i18n'

export default function DiagnosticsSettings() {
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  async function collect(choice: DiagnosticsChoice | null) {
    setPicking(false)
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.diagnostics.collect(choice ?? undefined)
      if (result.status === 'saved') setMessage({ text: t('diagnostics.saved', { path: result.path }), error: false })
      else if (result.status === 'no-engine') setMessage({ text: t('diagnostics.noEngine'), error: true })
    } catch (err) {
      setMessage({ text: t('diagnostics.failed', { error: (err as Error).message }), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function resetCrashes() {
    await window.electronAPI.diagnostics.resetCrashes()
    setResetMessage(t('diagnostics.resetDone'))
  }

  return (
    <>
      <SettingsCard title={t('diagnostics.title')} hint={t('diagnostics.hint', { seconds: 20 })}>
        <button
          onClick={() => { setPicking(true) }}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-accent-500/15 px-4 py-2 text-sm text-accent-300 hover:bg-accent-500/25 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          {busy ? t('diagnostics.collecting') : t('diagnostics.collect')}
        </button>
        {message && <p className={`text-xs ${message.error ? 'text-red-400' : 'text-gray-400'}`}>{message.text}</p>}
      </SettingsCard>

      <SettingsCard title={t('diagnostics.resetCrashes')} hint={t('diagnostics.resetCrashesHint')}>
        <button
          onClick={() => void resetCrashes()}
          className="flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10"
        >
          <Undo2 size={14} />
          {t('diagnostics.resetCrashes')}
        </button>
        {resetMessage && <p className="text-xs text-gray-400">{resetMessage}</p>}
      </SettingsCard>
      {picking && <DiagnosticsTargetModal seconds={20} onCollect={(choice) => void collect(choice)} onClose={() => { setPicking(false) }} />}
    </>
  )
}
