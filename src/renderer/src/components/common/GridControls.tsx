import type { ReactNode } from 'react'
import { Loader2, Search, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import type { MarqueeRect } from '../../hooks/useSelectableGrid'

// Toolbar and grid pieces shared by the workshop and library views

// shows/hides a side panel; stays highlighted while the panel's filters are active even when hidden
export function PanelToggle({
  icon: Icon,
  label,
  open,
  activeCount = 0,
  onClick
}: {
  icon: LucideIcon
  label: string
  open: boolean
  activeCount?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
        open || activeCount > 0 ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'
      )}
    >
      <Icon size={14} />
      {label}
      {activeCount > 0 && <span className="rounded-full bg-white/20 px-1.5 text-xs">{activeCount}</span>}
    </button>
  )
}

export function FiltersToggle({ open, activeCount, onClick }: { open: boolean; activeCount: number; onClick: () => void }) {
  return <PanelToggle icon={SlidersHorizontal} label="Filters" open={open} activeCount={activeCount} onClick={onClick} />
}

export function ResetFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
    >
      <X size={14} /> Reset
    </button>
  )
}

export function SearchInput({
  value,
  placeholder,
  title,
  onChange
}: {
  value: string
  placeholder: string
  title?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative max-w-md flex-1">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
      <input
        type="text"
        placeholder={placeholder}
        title={title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-white/5 py-2 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  )
}

export function ToolbarButton({
  icon,
  busy = false,
  disabled,
  title,
  onClick,
  children
}: {
  icon: ReactNode
  busy?: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function LoadingSpinner() {
  return (
    <div className="flex h-40 items-center justify-center text-gray-500">
      <Loader2 size={24} className="animate-spin" />
    </div>
  )
}

export function MarqueeOverlay({ rect }: { rect: MarqueeRect | null }) {
  if (!rect || rect.width <= 3 || rect.height <= 3) return null
  return (
    <div
      className="pointer-events-none absolute z-20 border border-indigo-500 bg-indigo-500/15"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    />
  )
}

export function Pagination({
  page,
  totalPages,
  canNext = page < totalPages,
  onPage,
  children
}: {
  page: number
  totalPages: number
  canNext?: boolean
  onPage: (page: number) => void
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <button
        disabled={page <= 1}
        onClick={() => onPage(Math.max(1, page - 1))}
        className="rounded bg-white/5 px-2.5 py-1 text-gray-300 hover:bg-white/10 disabled:opacity-40"
      >
        Prev
      </button>
      <span>{children}</span>
      <button
        disabled={!canNext}
        onClick={() => onPage(page + 1)}
        className="rounded bg-white/5 px-2.5 py-1 text-gray-300 hover:bg-white/10 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  )
}
