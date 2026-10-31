import { useState } from 'react'
import { Bug, ChevronDown, ChevronRight, FlaskConical, Loader2, Undo2 } from 'lucide-react'
import type { WallpaperCompat, WallpaperMeta } from '@shared/types'
import { COMPAT_LABELS, compatStatus } from '@shared/compat'
import { CompatStatusIcon } from '../CompatBadge'
import { useToast } from '../Toast'
import { screenLabel } from '../../../utils/screens'
import { t, currentLanguage } from '../../../i18n'
import type { MessageKey } from '@shared/i18n'

interface Props {
  wallpaper: WallpaperMeta
  canTest: boolean
  onChange: (compat: WallpaperCompat | undefined) => Promise<void>
  onTest: () => Promise<unknown>
}

const LAST_CRASH: Record<'launch' | 'hotswap' | 'runtime', MessageKey> = {
  launch: 'compat.lastCrashLaunch',
  hotswap: 'compat.lastCrashHotswap',
  runtime: 'compat.lastCrashRuntime'
}

export default function CompatSection({ wallpaper, canTest, onChange, onTest }: Props) {
  const compat = wallpaper.compat
  const status = compatStatus(compat)
  const [open, setOpen] = useState(status !== 'ok')
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [testing, setTesting] = useState(false)
  const { showToast } = useToast()
  const note = noteDraft ?? compat?.note ?? ''

  async function commitNote(value: string) {
    setNoteDraft(null)
    if (value.trim() === (compat?.note ?? '')) return
    const next = { ...compat, note: value.trim() || undefined }
    await onChange(Object.values(next).some((v) => v !== undefined) ? next : undefined)
  }

  async function clearStatus() {
    await onChange(compat?.note ? { note: compat.note } : undefined)
  }

  async function test() {
    setTesting(true)
    try {
      await onTest()
      showToast(t('compat.testStarted'))
    } catch (err) {
      showToast((err as Error).message, { warning: true, durationMs: 6000 })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="border-t border-fg/5 pt-3">
      <button
        onClick={() => { setOpen((v) => !v) }}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Bug size={12} />
        <span className="flex-1 text-left">{t('compat.title')}</span>
        <CompatStatusIcon status={status} />
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <p className="flex items-center gap-1.5 text-gray-300">
            <CompatStatusIcon status={status} />
            {t(COMPAT_LABELS[status])}
          </p>

          {compat?.lastCrash && (
            <div className="text-gray-500">
              {t(LAST_CRASH[compat.lastCrash.phase])}
              {compat.lastCrash.screen !== '*' && ` ${t('status.onScreen', { screen: screenLabel(compat.lastCrash.screen) })}`},{' '}
              {new Date(compat.lastCrash.at).toLocaleString(currentLanguage())}
              {compat.runtimeCrashes ? ` ${t('compat.runtimeCount', { count: compat.runtimeCrashes })}` : ''}
              {compat.lastCrash.log.length > 0 && (
                <button onClick={() => { setShowLog((v) => !v) }} className="ml-1 text-accent-300 hover:text-accent-200">
                  {showLog ? t('compat.hideLog') : t('compat.showLog')}
                </button>
              )}
              {showLog && (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] text-gray-400">
                  {compat.lastCrash.log.join('\n')}
                </pre>
              )}
            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => { setNoteDraft(e.target.value) }}
            onBlur={(e) => void commitNote(e.target.value)}
            rows={2}
            placeholder={t('compat.notePlaceholder')}
            className="w-full resize-y rounded border border-fg/10 bg-black/30 px-2 py-1 text-xs text-gray-200 placeholder:text-gray-600 focus:border-accent-500/50 focus:outline-none"
          />

          <div className="flex gap-1.5">
            {canTest && (
              <button
                onClick={() => void test()}
                disabled={testing}
                title={t('compat.testHint')}
                className="flex items-center gap-1 rounded bg-fg/5 px-2 py-1 text-gray-300 hover:bg-fg/10 disabled:opacity-50"
              >
                {testing ? <Loader2 size={11} className="animate-spin" /> : <FlaskConical size={11} />}
                {t('compat.test')}
              </button>
            )}
            {status !== 'ok' && (
              <button
                onClick={() => void clearStatus()}
                className="flex items-center gap-1 rounded bg-fg/5 px-2 py-1 text-gray-300 hover:bg-fg/10"
              >
                <Undo2 size={11} />
                {t('compat.forget')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
