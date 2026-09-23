import { OctagonX, RefreshCwOff, StickyNote, TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import type { CompatStatus, WallpaperCompat } from '@shared/types'
import { COMPAT_LABELS, compatStatus } from '@shared/compat'

const STATUS_ICONS: Record<Exclude<CompatStatus, 'ok'>, { icon: typeof OctagonX; className: string }> = {
  crashes: { icon: OctagonX, className: 'text-red-400' },
  'hotswap-only': { icon: RefreshCwOff, className: 'text-amber-300' },
  'hotswap-untested': { icon: TriangleAlert, className: 'text-amber-400' },
  unstable: { icon: TriangleAlert, className: 'text-orange-400' }
}

export function CompatStatusIcon({ status, size = 12 }: { status: CompatStatus; size?: number }) {
  if (status === 'ok') return null
  const { icon: Icon, className } = STATUS_ICONS[status]
  return <Icon size={size} className={className} />
}

/** Small icons for a card's corner: how the wallpaper behaved in the engine, and whether it has a note */
export default function CompatBadge({ compat, className }: { compat?: WallpaperCompat; className?: string }) {
  const status = compatStatus(compat)
  const note = compat?.note?.trim()
  if (status === 'ok' && !note) return null

  return (
    <span className={clsx('flex items-center gap-1 rounded bg-black/70 px-1 py-0.5', className)}>
      {status !== 'ok' && (
        <span title={COMPAT_LABELS[status]}>
          <CompatStatusIcon status={status} />
        </span>
      )}
      {note && (
        <span title={note}>
          <StickyNote size={12} className="text-sky-300" />
        </span>
      )}
    </span>
  )
}
