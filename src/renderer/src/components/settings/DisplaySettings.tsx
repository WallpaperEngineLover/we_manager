import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Monitor, MonitorSmartphone } from 'lucide-react'
import type { DisplayMode } from '@shared/types'
import { useConfig } from '../../hooks/queries'
import { t } from '../../i18n'
import type { MessageKey } from '@shared/i18n'

const MODES: { mode: DisplayMode; label: MessageKey; icon: typeof Monitor }[] = [
  { mode: 'shared', label: 'display.shared', icon: Monitor },
  { mode: 'per-screen', label: 'display.perScreen', icon: MonitorSmartphone }
]

export default function DisplaySettings({ screens }: { screens: string[] }) {
  const queryClient = useQueryClient()
  const config = useConfig()
  const [switching, setSwitching] = useState(false)
  const current = config?.displayMode ?? 'shared'

  async function switchTo(mode: DisplayMode) {
    if (mode === current || switching) return
    setSwitching(true)
    try {
      await window.electronAPI.config.setDisplayMode(mode)
      for (const key of ['config', 'display-targets', 'screen-assignments', 'playlist-playback-state']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('display.title')}</label>
      <p className="mt-1 text-xs text-gray-600">
        {t('display.description')}
      </p>
      <div className="mt-3 inline-flex overflow-hidden rounded-lg text-sm">
        {MODES.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => switchTo(mode)}
            disabled={switching}
            className={`flex items-center gap-2 px-3 py-2 transition-colors ${
              current === mode ? 'bg-accent-600 text-white' : 'bg-fg/5 text-gray-400 hover:text-gray-200'
            }`}
          >
            {switching && current !== mode ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
            {t(label)}
          </button>
        ))}
      </div>
      {current === 'per-screen' && (
        <p className="mt-2 text-xs text-gray-500">
          {screens.length > 0 ? t('display.detected', { screens: screens.join(', ') }) : t('display.noneDetected')}
          {screens.length > 1 &&
            ` ${t('display.restartNote')}`}
        </p>
      )}
    </div>
  )
}
