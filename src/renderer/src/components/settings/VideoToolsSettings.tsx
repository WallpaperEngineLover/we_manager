import { useEffect, useState } from 'react'
import { Download, Loader2, Trash2 } from 'lucide-react'
import { ENCODER_LABELS, type OptimizeProgress, type VideoToolsStatus } from '@shared/video-tools'
import SettingsCard from './SettingsCard'
import { ProgressBar } from '../common/GridCard'
import { t } from '../../i18n'

export default function VideoToolsSettings() {
  const [status, setStatus] = useState<VideoToolsStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<OptimizeProgress | null>(null)
  const [error, setError] = useState('')

  function refresh() {
    void window.electronAPI.videoTools.status().then(setStatus).catch(console.error)
  }

  useEffect(() => {
    void window.electronAPI.videoTools.status().then(setStatus).catch(console.error)
    return window.electronAPI.on.videoToolsProgress((p) => { if (p.itemId === 'ffmpeg') setProgress(p) })
  }, [])

  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    setProgress(null)
    try {
      await action()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      refresh()
    }
  }

  return (
    <SettingsCard title={t('optimize.settingsTitle')} hint={t('optimize.settingsHint')}>
      <p className="text-xs text-gray-400">
        {status === null
          ? '...'
          : status.encoders.length === 0
            ? t('optimize.noEncoder')
            : t('optimize.encodersFound', { list: status.encoders.map((o) => ENCODER_LABELS[o.encoder]).join(', ') })}
      </p>
      {busy && (
        <div className="space-y-1">
          <p className="text-xs text-gray-400">{progress?.message}</p>
          <ProgressBar percentage={progress?.percentage ?? 0} className="h-1.5 rounded bg-fg/10" />
        </div>
      )}
      <div className="flex gap-2">
        {status?.canDownload && !status.downloaded && (
          <button
            onClick={() => void act(() => window.electronAPI.videoTools.download())}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-accent-500/15 px-4 py-2 text-sm text-accent-300 hover:bg-accent-500/25 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {t('optimize.download')}
          </button>
        )}
        {status?.downloaded && (
          <button
            onClick={() => void act(() => window.electronAPI.videoTools.remove())}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10 disabled:opacity-50"
          >
            <Trash2 size={14} />
            {t('optimize.removeDownloaded')}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </SettingsCard>
  )
}
