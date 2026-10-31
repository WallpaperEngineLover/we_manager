import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Puzzle } from 'lucide-react'
import type { GnomeExtensionStatus } from '@shared/types'
import { useToast } from '../common/Toast'
import CopyField from '../common/CopyField'
import { t } from '../../i18n'
import type { MessageKey } from '@shared/i18n'

const MESSAGES: Record<Exclude<GnomeExtensionStatus['state'], 'not-needed' | 'active'>, MessageKey> = {
  outdated: 'gnome.outdated',
  'needs-relogin': 'gnome.needsRelogin',
  disabled: 'gnome.disabled',
  'not-installed': 'gnome.notInstalled',
  error: 'gnome.error'
}

export default function GnomeExtensionNotice() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const { data: status } = useQuery({
    queryKey: ['gnome-extension'],
    queryFn: () => window.electronAPI.gnomeExtension.status()
  })

  if (!status || !status.needed || status.state === 'active' || status.state === 'not-needed') return null

  const canInstall = status.bundled && (status.state === 'not-installed' || status.state === 'disabled'
    || status.state === 'error' || status.state === 'outdated')
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
        {t(MESSAGES[status.state])}
        {status.state === 'error' && status.detail && <span className="ml-1 text-gray-500">{status.detail}</span>}
        {!status.bundled && status.state === 'not-installed' && (
          <span className="ml-1 text-gray-500">{t('gnome.notBundled')}</span>
        )}
      </span>
      {canInstall && (
        <button
          onClick={() => void install()}
          disabled={busy}
          className="rounded bg-accent-600 px-3 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          {busy ? t('gnome.installing') : status.state === 'not-installed' ? t('gnome.install') : status.state === 'outdated' ? t('gnome.update') : t('gnome.reinstall')}
        </button>
      )}
      {commands && (
        <button onClick={() => void recheck()} className="rounded bg-fg/10 px-3 py-1 text-xs hover:bg-fg/20">
          {t('gnome.checkAgain')}
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
            {t('gnome.byHand')}
          </span>
          {commands.map((command) => <CopyField key={command} text={command} />)}
          <CopyField text={commands.join(' && ')} label={t('gnome.allAtOnce')} />
        </div>
      )}
    </div>
  )
}
