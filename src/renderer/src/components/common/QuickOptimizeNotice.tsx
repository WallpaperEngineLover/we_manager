import { Film, Loader2, X } from 'lucide-react'
import { formatVideoTime } from '@shared/videoTrim'
import { answerQuickTrim, dismissQuickOptimize, useQuickOptimize } from '../../hooks/useQuickOptimize'
import { t } from '../../i18n'

export default function QuickOptimizeNotice() {
  const { running, progress, percent, lines, summary, error, question } = useQuickOptimize()
  if (question) {
    return (
      <div className="flex flex-col gap-2 border-b border-fg/10 bg-pane px-4 py-2 text-sm">
        <span className="font-medium text-gray-200">{t('quick.trimTitle')}</span>
        <span className="text-gray-400">{t('quick.trimText')}</span>
        <ul className="max-h-32 overflow-y-auto text-xs text-gray-300">
          {question.map((item) => (
            <li key={item.id}>{`${item.title}: ${formatVideoTime(item.start)} - ${formatVideoTime(item.end)}`}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button onClick={() => { answerQuickTrim('trim') }} className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500">
            {t('quick.trimYes')}
          </button>
          <button onClick={() => { answerQuickTrim('keep') }} className="rounded-lg bg-fg/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-fg/10">
            {t('quick.trimNo')}
          </button>
          <button onClick={() => { answerQuickTrim('cancel') }} className="rounded-lg bg-fg/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-fg/10">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }
  if (!running && lines.length === 0 && !summary && !error) return null

  return (
    <div className="flex flex-col gap-1 border-b border-fg/10 bg-pane px-4 py-2 text-sm">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-1">
          {running && (
            <span className="flex items-center gap-2 text-gray-300">
              <Loader2 size={14} className="shrink-0 animate-spin text-accent-400" />
              {progress
                ? t('quick.running', { done: progress.done + 1, total: progress.total, title: progress.title, percent })
                : t('quick.action')}
            </span>
          )}
          {lines.map((line) => (
            <span key={`${line.id}-${line.kind}`} className={line.kind === 'failed' ? 'text-red-400' : 'text-amber-300'}>
              {line.text}
            </span>
          ))}
          {error && <span className="text-red-400">{error}</span>}
          {summary && (
            <span className="flex items-center gap-2 text-green-300">
              <Film size={14} className="shrink-0" />
              {summary}
            </span>
          )}
        </div>
        {running && (
          <button
            onClick={() => void window.electronAPI.videoTools.cancel()}
            className="rounded-lg bg-fg/5 px-3 py-1 text-xs text-gray-300 hover:bg-fg/10"
          >
            {t('common.cancel')}
          </button>
        )}
        {!running && (
          <button onClick={dismissQuickOptimize} className="rounded p-1 text-gray-500 hover:bg-fg/5 hover:text-gray-300">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
