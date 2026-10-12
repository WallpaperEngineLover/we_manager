import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Puzzle } from 'lucide-react'
import type { GnomeExtensionStatus } from '@shared/types'
import { useToast } from '../common/Toast'
import CopyField from '../common/CopyField'

const MESSAGES: Record<GnomeExtensionStatus['state'], string> = {
  'not-needed': '',
  active: '',
  outdated: 'A newer version of the GNOME Shell extension is installed, it loads after you log out and back in.',
  'needs-relogin': 'The GNOME Shell extension is installed. Log out and back in once so GNOME Shell loads it.',
  disabled: 'The linux-wallpaperengine GNOME Shell extension is turned off, wallpapers cannot start without it.',
  'not-installed': 'GNOME on Wayland needs the linux-wallpaperengine GNOME Shell extension to show wallpapers.',
  error: 'The linux-wallpaperengine GNOME Shell extension failed to load.'
}

export default function GnomeExtensionNotice() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const { data: status } = useQuery({
    queryKey: ['gnome-extension'],
    queryFn: () => window.electronAPI.gnomeExtension.status()
  })

  if (!status || !status.needed || status.state === 'active') return null

  const canInstall = status.bundled && (status.state === 'not-installed' || status.state === 'disabled'
    || status.state === 'error')
  const commands = canInstall ? status.flatpakCommands : undefined

  const recheck = async (): Promise<void> => {
    queryClient.setQueryData(['gnome-extension'], await window.electronAPI.gnomeExtension.status())
  }

  const install = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.electronAPI.gnomeExtension.install()
      showToast(result.message, result.ok ? {} : { warning: true, durationMs: 8000 })
      queryClient.setQueryData(['gnome-extension'], result.status)
    } finally {
      setBusy(false)
    }
  }

  const notice = (
    <div className="flex items-center gap-3 text-sm text-gray-300">
      <Puzzle size={16} className="shrink-0 text-accent-400" />
      <span className="flex-1">
        {MESSAGES[status.state]}
        {status.state === 'error' && status.detail && <span className="ml-1 text-gray-500">{status.detail}</span>}
        {!status.bundled && status.state === 'not-installed' && (
          <span className="ml-1 text-gray-500">The installed engine does not ship it, update linux-wallpaperengine.</span>
        )}
      </span>
      {canInstall && (
        <button
          onClick={install}
          disabled={busy}
          className="rounded bg-accent-600 px-3 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          {busy ? 'Installing...' : status.state === 'not-installed' ? 'Install extension' : 'Reinstall and enable'}
        </button>
      )}
      {commands && (
        <button onClick={recheck} className="rounded bg-fg/10 px-3 py-1 text-xs hover:bg-fg/20">
          Check again
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-2 border-b border-fg/10 bg-pane px-4 py-2">
      {notice}
      {commands && (
        <div className="flex flex-col gap-1 pl-7 text-xs text-gray-400">
          <span>
            Or by hand in a terminal, then log out and back in once so GNOME Shell loads it:
          </span>
          {commands.map((command) => <CopyField key={command} text={command} />)}
          <CopyField text={commands.join(' && ')} label="All at once" />
        </div>
      )}
    </div>
  )
}
