import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Monitor, MonitorSmartphone } from 'lucide-react'
import type { DisplayMode } from '@shared/types'

const MODES: { mode: DisplayMode; label: string; icon: typeof Monitor }[] = [
  { mode: 'shared', label: 'Same on every screen', icon: Monitor },
  { mode: 'per-screen', label: 'Each screen on its own', icon: MonitorSmartphone }
]

export default function DisplaySettings({ screens }: { screens: string[] }) {
  const queryClient = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => window.electronAPI.config.get()
  })
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
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Screens</label>
      <p className="mt-1 text-xs text-gray-600">
        With each screen on its own, every screen gets its own wallpaper and playlist, and Play asks which screen
        to use. Switching stops whatever is playing now.
      </p>
      <div className="mt-3 inline-flex overflow-hidden rounded-lg text-sm">
        {MODES.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => switchTo(mode)}
            disabled={switching}
            className={`flex items-center gap-2 px-3 py-2 transition-colors ${
              current === mode ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:text-gray-200'
            }`}
          >
            {switching && current !== mode ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
            {label}
          </button>
        ))}
      </div>
      {current === 'per-screen' && (
        <p className="mt-2 text-xs text-gray-500">
          {screens.length > 0 ? `Detected: ${screens.join(', ')}` : 'No screens detected, everything goes to one engine.'}
          {screens.length > 1 &&
            ' Switching wallpapers restarts that screen\'s engine instead of hot-swapping, since the engines would otherwise share one control file.'}
        </p>
      )}
    </div>
  )
}
