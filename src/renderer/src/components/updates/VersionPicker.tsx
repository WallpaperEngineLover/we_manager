import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, RotateCw } from 'lucide-react'
import type { LweInstallProgress, ReleaseChoice, UpdateStatus, UpdateTarget } from '@shared/types'
import { UPDATE_STATUS_KEY } from '../../hooks/queries'
import { currentLanguage, t } from '../../i18n'
import { pendingProgress } from './UpdateNotice'

const NAMES: Record<UpdateTarget, string> = { app: 'WE Manager', engine: 'linux-wallpaperengine-kde' }

function canSwitch(target: UpdateTarget, status: UpdateStatus): boolean {
  return target === 'app'
    ? status.appInstall === 'appimage' || status.appInstall === 'deb'
    : status.engineInstall === 'prebuilt'
}

export default function VersionPicker({ target, status }: { target: UpdateTarget; status: UpdateStatus }) {
  const queryClient = useQueryClient()
  const [versions, setVersions] = useState<ReleaseChoice[] | null>(null)
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: engineProgress = null } = useQuery<LweInstallProgress | null>({
    queryKey: ['lwe-install-progress'],
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: Infinity
  })

  if (!canSwitch(target, status)) return null

  // the result line already shows the progress of the pending update
  const appProgress = target === 'app' && status.appProgress && pendingProgress(status) === null ? status.appProgress : null
  const busy = target === 'app'
    ? status.appProgress?.stage === 'downloading' || status.appProgress?.stage === 'installing'
    : engineProgress !== null && engineProgress.stage !== 'done' && engineProgress.stage !== 'error'
  const current = target === 'app' ? status.appVersion : status.engineVersion

  function isInstalled(tag: string): boolean {
    return !!current && (tag === current || tag === `v${current}`)
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const list = await window.electronAPI.updates.versions(target)
      setVersions(list)
      const others = list.filter((r) => !isInstalled(r.tag))
      setSelected((others.find((r) => !r.prerelease) ?? others[0] ?? list[0])?.tag ?? '')
    } catch (err) {
      setError(t('update.versionsFailed', { error: (err as Error).message }))
    } finally {
      setLoading(false)
    }
  }

  async function install() {
    if (!selected) return
    if (!confirm(t('update.switchConfirm', { name: NAMES[target], version: selected }))) return
    if (target === 'app') {
      queryClient.setQueryData(UPDATE_STATUS_KEY, await window.electronAPI.updates.installApp(selected))
      return
    }
    queryClient.setQueryData(['lwe-install-progress'], {
      stage: 'downloading',
      message: t('lwe.startingDownload'),
      percentage: 0
    } satisfies LweInstallProgress)
    try {
      await window.electronAPI.lwe.installPrebuilt(selected)
    } catch (err) {
      queryClient.setQueryData(['lwe-install-progress'], {
        stage: 'error',
        message: t('lwe.installFailed', { error: (err as Error).message }),
        percentage: 0
      } satisfies LweInstallProgress)
    }
    queryClient.invalidateQueries({ queryKey: ['lwe-status'] })
  }

  function label(r: ReleaseChoice): string {
    const date = new Date(r.publishedAt).toLocaleDateString(currentLanguage())
    const marks = [isInstalled(r.tag) ? t('update.versionInstalled') : '', r.prerelease ? t('update.versionPrerelease') : '']
    return [r.tag, ...marks.filter(Boolean)].join(' - ') + ` (${date})`
  }

  return (
    <div className="mt-3">
      <p className="text-xs text-gray-400">{t('update.otherVersion', { name: NAMES[target] })}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {versions === null ? (
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-fg/10 disabled:opacity-50"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            {t('update.chooseVersion')}
          </button>
        ) : versions.length === 0 ? (
          <span className="text-xs text-gray-500">{t('update.noVersions')}</span>
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
              className="rounded-lg bg-fg/5 px-2 py-1.5 text-xs text-gray-300"
            >
              {versions.map((r) => (
                <option key={r.tag} value={r.tag}>{label(r)}</option>
              ))}
            </select>
            {!busy && (
              <button
                onClick={install}
                className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500"
              >
                <Download size={12} />
                {t('update.installVersion')}
              </button>
            )}
          </>
        )}
        {busy && <Loader2 size={12} className="animate-spin text-gray-400" />}
        {target === 'app' && appProgress && (
          <span className={`text-xs ${appProgress.stage === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
            {appProgress.stage === 'downloading' && t('update.downloading', { percent: appProgress.percentage })}
            {appProgress.stage === 'installing' && t('update.installing')}
            {appProgress.stage === 'ready' && t('update.ready')}
            {appProgress.stage === 'error' && t('update.installFailed', { error: appProgress.message ?? '' })}
          </span>
        )}
        {target === 'app' && appProgress?.stage === 'ready' && (
          <button
            onClick={() => window.electronAPI.updates.restart()}
            className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500"
          >
            <RotateCw size={12} />
            {t('update.restart')}
          </button>
        )}
        {target === 'engine' && engineProgress && (busy || engineProgress.stage === 'error') && (
          <span className={`text-xs ${engineProgress.stage === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
            {engineProgress.message}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}
