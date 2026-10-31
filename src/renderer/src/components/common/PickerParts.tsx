import type { ReactNode } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { WallpaperMeta } from '@shared/types'
import { getPreviewSrc } from '../../utils/preview'
import PreviewImage from './PreviewImage'
import { t } from '../../i18n'

export function PickerFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div className="flex h-full max-h-[600px] w-full max-w-2xl flex-col rounded-xl border border-fg/10 bg-popup shadow-2xl">
        <div className="flex items-center justify-between border-b border-fg/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-fg/5 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PickerSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative flex-1">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
      <input
        autoFocus
        type="text"
        placeholder={t('picker.search')}
        value={value}
        onChange={(e) => { onChange(e.target.value) }}
        className="w-full rounded-lg bg-fg/5 py-1.5 pl-8 pr-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-accent-500"
      />
    </div>
  )
}

export function PickerGrid({ loading, empty, children }: { loading: boolean; empty: boolean; children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      {loading && <p className="p-4 text-center text-xs text-gray-500">{t('common.loading')}</p>}
      {!loading && empty && <p className="p-4 text-center text-xs text-gray-500">{t('picker.empty')}</p>}
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  )
}

export function PickerCard({
  wallpaper,
  selected,
  onClick,
  label
}: {
  wallpaper: WallpaperMeta
  selected: boolean
  onClick: () => void
  label: ReactNode
}) {
  const previewSrc = getPreviewSrc(wallpaper)
  return (
    <button
      onClick={onClick}
      data-preview-hover=""
      className={`group relative overflow-hidden rounded-xl bg-card text-left transition-all ${
        selected ? 'ring-2 ring-accent-500' : 'hover:ring-1 hover:ring-accent-500/50'
      }`}
    >
      <div className="aspect-video bg-sunken">
        {previewSrc ? (
          <PreviewImage src={previewSrc} alt={wallpaper.title} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-600">{t('card.noPreview')}</div>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 p-2">
        {label}
        {selected && <Check size={12} className="shrink-0 text-accent-400" />}
      </div>
    </button>
  )
}
