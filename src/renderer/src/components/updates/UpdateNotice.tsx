import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BellOff, Download, ExternalLink, Loader2, RefreshCw, RotateCw, X } from 'lucide-react'
import type { AppInstallKind, AppUpdateProgress, AvailableUpdate, UpdateStatus, UpdateTarget } from '@shared/types'
import type { MessageKey } from '@shared/i18n'
import { UPDATE_STATUS_KEY, useLweInstallProgress, useUpdateStatus } from '../../hooks/queries'
import { t } from '../../i18n'

const APP_HINTS: Record<Exclude<AppInstallKind, 'appimage' | 'deb'>, MessageKey> = {
  flatpak: 'update.hintFlatpak',
  pacman: 'update.hintPacman',
  rpm: 'update.hintRpm',
  source: 'update.hintSource',
  unknown: 'update.hintUnknown'
}

const BUTTON = 'flex items-center gap-1.5 rounded px-3 py-1 text-xs'
const PRIMARY = `${BUTTON} bg-accent-600 font-medium text-white hover:bg-accent-500 disabled:opacity-50`
const SECONDARY = `${BUTTON} bg-fg/10 hover:bg-fg/20`

function UpdateRow({ target, update, message, action }: {
  target: UpdateTarget
  update: AvailableUpdate
  message: string
  action: ReactNode
}) {
  const queryClient = useQueryClient()
  const [showNotes, setShowNotes] = useState(false)

  async function dismiss(forever: boolean) {
    queryClient.setQueryData(UPDATE_STATUS_KEY, await window.electronAPI.updates.dismiss(target, update.version, forever))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
        <RefreshCw size={16} className="shrink-0 text-accent-400" />
        <span className="flex-1">{message}</span>
        {action}
        <button onClick={() => { setShowNotes(!showNotes) }} className={SECONDARY}>
          {t('update.releaseNotes')}
        </button>
        <button onClick={() => void window.electronAPI.shell.openExternal(update.url)} className={SECONDARY}>
          <ExternalLink size={12} />
          {t('update.releasePage')}
        </button>
        <button onClick={() => void dismiss(true)} className={SECONDARY}>
          <BellOff size={12} />
          {t('update.dontShowAgain')}
        </button>
        <button
          onClick={() => void dismiss(false)}
          title={t('update.dismiss')}
          className="rounded p-1 text-gray-500 hover:bg-fg/5 hover:text-gray-300"
        >
          <X size={14} />
        </button>
      </div>
      {showNotes && (
        <pre className="ml-7 max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-sunken p-3 font-sans text-xs text-gray-400">
          {update.notes.trim() || t('update.noNotes')}
        </pre>
      )}
    </div>
  )
}

/** Progress of an install of the pending update; one for another version belongs to the version picker */
export function pendingProgress(status: UpdateStatus): AppUpdateProgress | null {
  const progress = status.appProgress
  if (!progress || !status.app) return progress
  return progress.version === undefined || progress.version === status.app.version ? progress : null
}

export function AppAction({ status }: { status: UpdateStatus }) {
  const queryClient = useQueryClient()
  const progress = pendingProgress(status)

  if (status.appInstall !== 'appimage' && status.appInstall !== 'deb') {
    return <span className="text-xs text-gray-500">{t(APP_HINTS[status.appInstall])}</span>
  }
  if (progress?.stage === 'downloading' || progress?.stage === 'installing') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-400">
        <Loader2 size={12} className="animate-spin" />
        {progress.stage === 'downloading'
          ? t('update.downloading', { percent: progress.percentage })
          : t('update.installing')}
      </span>
    )
  }
  if (progress?.stage === 'ready') {
    return (
      <>
        <span className="text-xs text-gray-400">{t('update.ready')}</span>
        <button onClick={() => void window.electronAPI.updates.restart()} className={PRIMARY}>
          <RotateCw size={12} />
          {t('update.restart')}
        </button>
      </>
    )
  }
  return (
    <>
      {progress?.stage === 'error' && (
        <span className="text-xs text-red-400">{t('update.installFailed', { error: progress.message ?? '' })}</span>
      )}
      <button
        onClick={() => void window.electronAPI.updates.installApp().then((status) => queryClient.setQueryData(UPDATE_STATUS_KEY, status)).catch(console.error)}
        className={PRIMARY}
      >
        <Download size={12} />
        {t('update.update')}
      </button>
    </>
  )
}

export function EngineAction({ status }: { status: UpdateStatus }) {
  const queryClient = useQueryClient()
  const { progress, run } = useLweInstallProgress()
  const busy = progress !== null && progress.stage !== 'done' && progress.stage !== 'error'

  if (status.engineInstall === 'package') {
    return <span className="text-xs text-gray-500">{t('update.hintEnginePackage', { owner: status.engineManagedBy ?? '' })}</span>
  }
  if (status.engineInstall !== 'prebuilt') {
    return <span className="text-xs text-gray-500">{t('update.hintEngineBuild')}</span>
  }

  async function install() {
    await run(
      { stage: 'downloading', message: t('lwe.startingDownload'), percentage: 0 },
      () => window.electronAPI.lwe.installPrebuilt(),
      'lwe.installFailed'
    )
    void queryClient.invalidateQueries({ queryKey: ['lwe-status'] })
  }

  return (
    <>
      {progress && (busy || progress.stage === 'error') && (
        <span className={`flex items-center gap-1.5 text-xs ${progress.stage === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
          {busy && <Loader2 size={12} className="animate-spin" />}
          {progress.message}
        </span>
      )}
      {!busy && (
        <button onClick={() => void install()} className={PRIMARY}>
          <Download size={12} />
          {t('update.update')}
        </button>
      )}
    </>
  )
}

export default function UpdateNotice() {
  const status = useUpdateStatus()
  if (!status) return null

  const hidden = (target: UpdateTarget, version: string) =>
    status.dismissed[target] === version || status.snoozed[target] === version
  const app = status.app && !hidden('app', status.app.version) ? status.app : null
  const engine = status.engine && !hidden('engine', status.engine.version) ? status.engine : null
  if (!app && !engine) return null

  return (
    <div className="flex flex-col gap-2 border-b border-fg/10 bg-pane px-4 py-2">
      {app && (
        <UpdateRow
          target="app"
          update={app}
          message={t('update.appAvailable', { version: app.version, current: status.appVersion })}
          action={<AppAction status={status} />}
        />
      )}
      {engine && (
        <UpdateRow
          target="engine"
          update={engine}
          message={engine.current
            ? t('update.engineAvailable', { version: engine.version, current: engine.current })
            : t('update.engineAvailableUnknown', { version: engine.version })}
          action={<EngineAction status={status} />}
        />
      )}
    </div>
  )
}
