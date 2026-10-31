import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { MAX_LOADER_THREADS, clampLoaderThreads } from '@shared/loader'
import Toggle from '../common/Toggle'
import { useConfigSection } from '../../hooks/queries'
import { t } from '../../i18n'

export default function LoaderSettings() {
  const [loader, change] = useConfigSection(
    (cfg) => cfg.loader,
    (next) => window.electronAPI.config.setLoader(next)
  )
  const [threadsText, setThreadsText] = useState<string | null>(null)

  if (!loader) return null

  function commitThreads() {
    if (threadsText === null) return
    change({ threads: clampLoaderThreads(parseInt(threadsText, 10)) })
    setThreadsText(null)
  }

  const workersOff = !loader.textures

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('settings.loader')}</label>
      <p className="mt-1 text-xs text-gray-600">{t('settings.loaderHint')}</p>
      <label className="mt-3 flex items-center gap-3 cursor-pointer">
        <Toggle on={loader.textures} onClick={() => { change({ textures: !loader.textures }); }} />
        <span className="flex items-center gap-2 text-sm text-gray-300">
          <Gauge size={16} />
          {t('settings.loaderTextures')}
        </span>
      </label>
      <label className="mt-3 flex items-center gap-3 cursor-pointer" title={workersOff ? t('settings.loaderNeedsTextures') : undefined}>
        <Toggle
          on={loader.shaders && !workersOff}
          disabled={workersOff}
          onClick={() => { change({ shaders: !loader.shaders }); }}
        />
        <span className="flex items-center gap-2 text-sm text-gray-300">
          <Gauge size={16} />
          {t('settings.loaderShaders')}
        </span>
      </label>
      <div className="mt-3" title={workersOff ? t('settings.loaderNeedsTextures') : undefined}>
        <label className="block text-xs text-gray-400 mb-1">{t('settings.loaderThreads')}</label>
        <input
          type="number"
          min={0}
          max={MAX_LOADER_THREADS}
          value={threadsText ?? loader.threads}
          disabled={workersOff}
          onChange={(e) => { setThreadsText(e.target.value) }}
          onBlur={commitThreads}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-28 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-50"
        />
      </div>
    </div>
  )
}
