import { useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Folder, FolderInput, ThumbsDown, ThumbsUp, Trash2, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import type { WallpaperFolder } from '@shared/types'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useClampedPosition, useFlipSide } from '../../hooks/useContextMenuPosition'

const POPUP_CLASS = 'rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl'

export function ContextMenu({
  x,
  y,
  onClose,
  className = 'min-w-[200px]',
  children
}: {
  x: number
  y: number
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)
  const pos = useClampedPosition(ref, { x, y })

  return (
    <div
      ref={ref}
      className={clsx('fixed z-50 text-sm', POPUP_CLASS, className)}
      style={{ left: pos?.x ?? x, top: pos?.y ?? y }}
    >
      {children}
    </div>
  )
}

export function MenuItem({
  icon: Icon,
  danger = false,
  onClick,
  children
}: {
  icon?: LucideIcon
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-1.5 hover:bg-white/5',
        danger ? 'text-red-400' : 'text-gray-300'
      )}
    >
      {Icon && <Icon size={12} />}
      {children}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-white/5" />
}

export function MenuSelectionCount({ count }: { count: number }) {
  if (count < 2) return null
  return <div className="mb-1 border-b border-white/5 px-3 py-1 text-xs text-gray-600">{count} items selected</div>
}

export function VoteMenuItems({ onVote }: { onVote: (up: boolean) => void }) {
  return (
    <>
      <MenuItem icon={ThumbsUp} onClick={() => onVote(true)}>
        Like
      </MenuItem>
      <MenuItem icon={ThumbsDown} onClick={() => onVote(false)}>
        Dislike
      </MenuItem>
    </>
  )
}

// "Move to folder" submenu plus "Remove from folder" when anything selected is in one
export function FolderMenuItems({
  moveTargets,
  hasFolder,
  onMove,
  onRemove
}: {
  moveTargets: WallpaperFolder[]
  hasFolder: boolean
  onMove: (folderId: string) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const subRef = useRef<HTMLDivElement>(null)
  const side = useFlipSide(subRef, open)

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
        >
          <FolderInput size={12} /> Move to folder
          <ChevronRight size={12} className="ml-auto" />
        </button>
        {open && (
          <div
            ref={subRef}
            className={clsx(
              'absolute top-0 min-w-[160px]',
              POPUP_CLASS,
              side === 'left' ? 'right-full mr-1' : 'left-full ml-1'
            )}
          >
            {moveTargets.length === 0 && <div className="px-3 py-1.5 text-gray-500">No other folders</div>}
            {moveTargets.map((f) => (
              <MenuItem key={f.id} icon={Folder} onClick={() => onMove(f.id)}>
                {f.title}
              </MenuItem>
            ))}
          </div>
        )}
      </div>
      {hasFolder && (
        <MenuItem icon={Trash2} danger onClick={onRemove}>
          Remove from folder
        </MenuItem>
      )}
    </>
  )
}
