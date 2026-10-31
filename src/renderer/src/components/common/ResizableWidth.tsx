import { useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { usePersistentState } from '../../hooks/usePersistentState'
import { t } from '../../i18n'

interface ResizableWidthProps {
  storageKey: string
  defaultWidth: number
  min: number
  max: number
  edge: 'left' | 'right'
  children: ReactNode
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const MAX_WINDOW_SHARE = 0.3

export default function ResizableWidth({ storageKey, defaultWidth, min, max, edge, children }: ResizableWidthProps) {
  const [stored, setStored] = usePersistentState<number>(
    storageKey,
    defaultWidth,
    (value) => (typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : defaultWidth)
  )
  const [live, setLive] = useState<number | null>(null)
  const start = useRef({ x: 0, width: 0 })
  const dragging = live !== null
  const limit = Math.max(min, Math.min(max, Math.round(window.innerWidth * MAX_WINDOW_SHARE)))
  const width = clamp(live ?? stored, min, limit)

  function finishDrag() {
    if (live !== null) setStored(live)
    setLive(null)
  }

  return (
    <div className="relative flex shrink-0" style={{ width }}>
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        title={t('common.dragResize')}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = { x: e.clientX, width }
          setLive(width)
        }}
        onPointerMove={(e) => {
          if (!dragging) return
          const dx = e.clientX - start.current.x
          setLive(clamp(start.current.width + (edge === 'right' ? dx : -dx), min, limit))
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onDoubleClick={() => { setStored(defaultWidth) }}
        className={clsx(
          'absolute inset-y-0 z-20 w-1.5 cursor-col-resize select-none transition-colors hover:bg-accent-500/40',
          edge === 'right' ? '-right-[3px]' : '-left-[3px]',
          dragging && 'bg-accent-500/60'
        )}
      />
    </div>
  )
}
