import { useState } from 'react'
import { Loader2, FileText, Undo2 } from 'lucide-react'
import DiagnosticsTargetModal, { type DiagnosticsChoice } from './DiagnosticsTargetModal'
import { t } from '../../i18n'

export default function DiagnosticsSettings() {
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

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
    setMessage({ text: t('diagnostics.resetDone'), error: false })
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
        {t('diagnostics.title')}
      </label>
      <p className="mt-1 text-xs text-gray-600">{t('diagnostics.hint', { seconds: 20 })}</p>

      <button
        onClick={() => setPicking(true)}
        disabled={busy}
        className="mt-3 flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        {busy ? t('diagnostics.collecting') : t('diagnostics.collect')}
      </button>
      <p className="mt-4 text-xs text-gray-600">{t('diagnostics.resetCrashesHint')}</p>
      <button
        onClick={resetCrashes}
        className="mt-3 flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10"
      >
        <Undo2 size={14} />
        {t('diagnostics.resetCrashes')}
      </button>
      {picking && <DiagnosticsTargetModal seconds={20} onCollect={collect} onClose={() => setPicking(false)} />}
      {message && <p className={`mt-2 text-xs ${message.error ? 'text-red-400' : 'text-gray-400'}`}>{message.text}</p>}
    </div>
  )
}
