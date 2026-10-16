import { useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Folder, FolderInput, Heart, HeartOff, ThumbsDown, ThumbsUp, Trash2, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import type { WallpaperFolder } from '@shared/types'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useClampedPosition, useFlipSide } from '../../hooks/useContextMenuPosition'
import { t } from '../../i18n'

const POPUP_CLASS = 'rounded-xl border border-fg/10 bg-popup/95 p-1 shadow-2xl shadow-black/30 backdrop-blur-md'

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
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-fg/5',
        danger ? 'text-red-400' : 'text-gray-300'
      )}
    >
      {Icon && <Icon size={12} />}
      {children}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="mx-1 my-1 border-t border-fg/5" />
}

export function MenuSelectionCount({ count }: { count: number }) {
  if (count < 2) return null
  return <div className="mb-1 border-b border-fg/5 px-3 py-1 text-xs text-gray-600">{t('menu.selected', { count })}</div>
}

export function VoteMenuItems({ onVote }: { onVote: (up: boolean) => void }) {
  return (
    <>
      <MenuItem icon={ThumbsUp} onClick={() => onVote(true)}>
        {t('vote.like')}
      </MenuItem>
      <MenuItem icon={ThumbsDown} onClick={() => onVote(false)}>
        {t('vote.dislike')}
      </MenuItem>
    </>
  )
}

// a mixed selection shows both
export function FavoriteMenuItems({
  ids,
  favorites,
  onFavorite
}: {
  ids: string[]
  favorites: Set<string>
  onFavorite: (ids: string[], add: boolean) => void
}) {
  const toAdd = ids.filter((id) => !favorites.has(id))
  const toRemove = ids.filter((id) => favorites.has(id))
  return (
    <>
      {toAdd.length > 0 && (
        <MenuItem icon={Heart} onClick={() => onFavorite(toAdd, true)}>
          {t('favorite.add')}
        </MenuItem>
      )}
      {toRemove.length > 0 && (
        <MenuItem icon={HeartOff} onClick={() => onFavorite(toRemove, false)}>
          {t('favorite.remove')}
        </MenuItem>
      )}
    </>
  )
}

export function SubMenu({
  icon: Icon,
  label,
  empty,
  children
}: {
  icon: LucideIcon
  label: ReactNode
  empty?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const subRef = useRef<HTMLDivElement>(null)
  const side = useFlipSide(subRef, open)
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-gray-300 hover:bg-fg/5"
      >
        <Icon size={12} /> {label}
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
          {isEmpty && empty && <div className="px-3 py-1.5 text-gray-500">{empty}</div>}
          {children}
        </div>
      )}
    </div>
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
  return (
    <>
      <SubMenu icon={FolderInput} label={t('folder.moveTo')} empty={t('folder.noOthers')}>
        {moveTargets.map((f) => (
          <MenuItem key={f.id} icon={Folder} onClick={() => onMove(f.id)}>
            {f.title}
          </MenuItem>
        ))}
      </SubMenu>
      {hasFolder && (
        <MenuItem icon={Trash2} danger onClick={onRemove}>
          {t('folder.removeFrom')}
        </MenuItem>
      )}
    </>
  )
}
