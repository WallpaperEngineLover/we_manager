import { Loader2, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { cancelBackgroundOptimize, dismissBackgroundError, finishBackgroundOptimize, useBackgroundOptimize } from '../../hooks/useBackgroundOptimize'
import { useToast } from './Toast'
import { formatFileSize } from '../../utils/format'
import { t } from '../../i18n'

export default function BackgroundOptimizeNotice() {
  const { phase, percent, result, error, finishing } = useBackgroundOptimize()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  if (!phase && !error) return null

  const grew = !!result && result.newSize >= result.originalSize
  const finish = (keep: boolean): void => {
    void finishBackgroundOptimize(keep, () => {
      showToast(t('optimize.applied'))
      void queryClient.invalidateQueries({ queryKey: ['library'] })
    })
  }

  return (
    <div className="flex items-center gap-3 border-b border-fg/10 bg-pane px-4 py-2 text-sm">
      <div className="flex flex-1 flex-col gap-1">
        {phase === 'running' && (
          <span className="flex items-center gap-2 text-gray-300">
            <Loader2 size={14} className="shrink-0 animate-spin text-accent-400" />
            {t('optimize.bgRunning', { percent })}
          </span>
        )}
        {phase === 'review' && result && (
          <span className="text-gray-200">
            {t('optimize.bgDone', { before: formatFileSize(result.originalSize) ?? '', after: formatFileSize(result.newSize) ?? '' })}
          </span>
        )}
        {error && <span className="text-red-400">{error}</span>}
      </div>
      {phase === 'running' && (
        <button onClick={cancelBackgroundOptimize} className="rounded-lg bg-fg/5 px-3 py-1 text-xs text-gray-300 hover:bg-fg/10">
          {t('common.cancel')}
        </button>
      )}
      {phase === 'review' && (
        <>
          <button
            onClick={() => { finish(false) }}
            disabled={finishing}
            className={grew ? 'rounded-lg bg-accent-600 px-3 py-1 text-xs font-medium text-white hover:bg-accent-500' : 'rounded-lg bg-fg/5 px-3 py-1 text-xs text-gray-300 hover:bg-fg/10'}
          >
            {t('optimize.discard')}
          </button>
          <button
            onClick={() => { finish(true) }}
            disabled={finishing}
            className={grew ? 'rounded-lg bg-fg/5 px-3 py-1 text-xs text-gray-300 hover:bg-fg/10' : 'rounded-lg bg-accent-600 px-3 py-1 text-xs font-medium text-white hover:bg-accent-500'}
          >
            {grew ? t('optimize.keepAnyway') : t('optimize.keep')}
          </button>
        </>
      )}
      {!phase && error && (
        <button onClick={dismissBackgroundError} className="rounded p-1 text-gray-500 hover:bg-fg/5 hover:text-gray-300">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
