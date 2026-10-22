import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cpu, Download, Loader2, X } from 'lucide-react'
import type { MessageKey } from '@shared/i18n'
import type { GraphicsWarning } from '@shared/types'
import CopyField from '../common/CopyField'
import { useToast } from '../common/Toast'
import { t } from '../../i18n'

const MESSAGES: Record<GraphicsWarning['kind'], MessageKey> = {
  software: 'graphics.software',
  'flatpak-nvidia': 'graphics.flatpakNvidia'
}

const DISMISSED_KEY = 'graphics-warning-dismissed'

function wasDismissed(kind: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === kind
  } catch {
    return false
  }
}

export default function GraphicsNotice() {
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const { showToast } = useToast()
  const { data: warning } = useQuery({
    queryKey: ['graphics-warning'],
    queryFn: () => window.electronAPI.graphics.warning(),
    refetchInterval: 5000
  })

  if (!warning || dismissed === warning.kind || wasDismissed(warning.kind)) return null

  function dismiss() {
    if (!warning) return
    setDismissed(warning.kind)
    try {
      localStorage.setItem(DISMISSED_KEY, warning.kind)
    } catch {
      // the notice just comes back next start
    }
  }

  async function install() {
    setInstalling(true)
    try {
      const result = await window.electronAPI.graphics.installNvidia()
      if (result.ok) showToast(t('graphics.installed'), { durationMs: 10000 })
      else showToast(t('graphics.installFailed', { error: result.message }), { warning: true, durationMs: 12000 })
    } finally {
      setInstalling(false)
    }
  }

  const command = warning.extension
    ? `flatpak install flathub ${warning.extension}`
    : 'flatpak install flathub org.freedesktop.Platform.GL.nvidia-<driver version, dots as dashes>'

  return (
    <div className="flex flex-col gap-2 border-b border-fg/10 bg-pane px-4 py-2">
      <div className="flex items-center gap-3 text-sm text-gray-300">
        <Cpu size={16} className="shrink-0 text-amber-400" />
        <span className="flex-1">{t(MESSAGES[warning.kind], { renderer: warning.renderer ?? '' })}</span>
        {warning.kind === 'flatpak-nvidia' && warning.extension && (
          <button
            onClick={install}
            disabled={installing}
            className="flex items-center gap-1.5 rounded bg-accent-600 px-3 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
          >
            {installing ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {installing ? t('graphics.installing') : t('graphics.install')}
          </button>
        )}
        <button
          onClick={dismiss}
          title={t('update.dismiss')}
          className="rounded p-1 text-gray-500 hover:bg-fg/5 hover:text-gray-300"
        >
          <X size={14} />
        </button>
      </div>
      {warning.kind === 'flatpak-nvidia' && (
        <div className="pl-7">
          <CopyField text={command} />
        </div>
      )}
    </div>
  )
}
