import { useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import type { UpdateChecks, UpdateStatus } from '@shared/types'
import { UPDATE_STATUS_KEY, useUpdateStatus } from '../../hooks/queries'
import Toggle from '../common/Toggle'
import { AppAction, EngineAction } from '../updates/UpdateNotice'
import VersionPicker from '../updates/VersionPicker'
import { currentLanguage, t } from '../../i18n'

function engineLine(status: UpdateStatus): string {
  if (status.engineInstall === 'bundled') return t('update.engineBundled')
  if (status.engineInstall === null) return t('update.engineMissing')
  if (status.engine) return t('update.available', { version: status.engine.version })
  if (!status.checked.engine) return status.checks?.engine ? t('update.neverChecked') : t('update.notChecking')
  return t('update.upToDate')
}

function appLine(status: UpdateStatus): string {
  if (status.app) return t('update.available', { version: status.app.version })
  if (!status.checked.app) return status.checks?.app ? t('update.neverChecked') : t('update.notChecking')
  return t('update.upToDate')
}

export default function UpdateSettings() {
  const status = useUpdateStatus()
  const queryClient = useQueryClient()
  if (!status) return null

  const checks: UpdateChecks = status.checks ?? { app: false, engine: false }
  const engineCheckable = status.engineInstall !== 'bundled'

  async function setChecks(next: UpdateChecks) {
    queryClient.setQueryData(UPDATE_STATUS_KEY, { ...status, checks: next })
    queryClient.setQueryData(UPDATE_STATUS_KEY, await window.electronAPI.updates.setChecks(next))
  }

  async function checkNow() {
    queryClient.setQueryData(UPDATE_STATUS_KEY, await window.electronAPI.updates.check())
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
        {t('update.title')}
      </label>
      <p className="mt-1 text-xs text-gray-600">{t('update.checksHint')}</p>

      <div className="mt-3 space-y-3">
        <label className="flex cursor-pointer items-center gap-3">
          <Toggle on={checks.app} onClick={() => void setChecks({ ...checks, app: !checks.app })} />
          <span className="text-sm text-gray-300">{t('update.checkApp')}</span>
        </label>
        {engineCheckable && (
          <label className="flex cursor-pointer items-center gap-3">
            <Toggle on={checks.engine} onClick={() => void setChecks({ ...checks, engine: !checks.engine })} />
            <span className="text-sm text-gray-300">{t('update.checkEngine')}</span>
          </label>
        )}
      </div>

      <div className="mt-3 space-y-1 text-xs text-gray-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>WE Manager {status.appVersion}: {appLine(status)}</span>
          {status.app && <AppAction status={status} />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>linux-wallpaperengine-kde: {engineLine(status)}</span>
          {status.engine && <EngineAction status={status} />}
        </div>
        {status.checkedAt && (
          <p className="text-gray-600">
            {t('update.lastChecked', { time: new Date(status.checkedAt).toLocaleString(currentLanguage()) })}
          </p>
        )}
        {status.error && <p className="text-red-400">{t('update.failed', { error: status.error })}</p>}
      </div>

      <VersionPicker target="app" status={status} />
      {engineCheckable && <VersionPicker target="engine" status={status} />}

      <button
        onClick={() => void checkNow()}
        disabled={status.checking}
        className="mt-4 flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10 disabled:opacity-50"
      >
        {status.checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {status.checking ? t('update.checking') : t('update.checkNow')}
      </button>
    </div>
  )
}
