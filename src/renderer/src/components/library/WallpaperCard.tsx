import { useState } from 'react'
import { Play, Loader2, Check } from 'lucide-react'
import type { WallpaperMeta } from '@shared/types'
import clsx from 'clsx'

interface WallpaperCardProps {
  wallpaper: WallpaperMeta
  selected?: boolean
  lweInstalled?: boolean
  onApplied?: () => void
  onSelect?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function WallpaperCard({
  wallpaper,
  selected,
  lweInstalled,
  onApplied,
  onSelect,
  onContextMenu
}: WallpaperCardProps) {
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApply(e: React.MouseEvent) {
    e.stopPropagation()
    setIsApplying(true)
    setError(null)
    try {
      await window.electronAPI.wallpaper.apply({ wallpaperId: wallpaper.id })
      onApplied?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsApplying(false)
    }
  }

  const previewSrc = wallpaper.previewLocal
    ? `wallpaper://${wallpaper.previewLocal}`
    : wallpaper.previewUrl

  return (
    <div
      data-wallpaper-id={wallpaper.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/wallpaper-id', wallpaper.id)
        e.dataTransfer.setData('text/wallpaper-selected', 'true')
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={clsx(
        'group relative overflow-hidden rounded-lg bg-[#1a1a1a] transition-all cursor-pointer select-none',
        selected
          ? 'ring-2 ring-indigo-500'
          : 'hover:ring-1 hover:ring-indigo-500/50'
      )}
    >
      {/* Selection checkbox */}
      <div
        className={clsx(
          'absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-all',
          selected
            ? 'border-indigo-500 bg-indigo-600 text-white opacity-100'
            : 'border-white/30 bg-black/50 text-transparent opacity-0 group-hover:opacity-100'
        )}
      >
        <Check size={12} />
      </div>

      <div className="aspect-video overflow-hidden bg-[#111]">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={wallpaper.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-600">No preview</div>
        )}
      </div>

      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-gray-200" title={wallpaper.title}>
          {wallpaper.title}
        </h3>
        {wallpaper.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {wallpaper.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-gray-400">
                {tag}
              </span>
            ))}
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>

      {/* Apply button */}
      <div className="absolute right-2 top-2">
        <button
          onClick={handleApply}
          disabled={isApplying || !lweInstalled}
          title={!lweInstalled ? 'Install linux-wallpaperengine in Settings first' : 'Play wallpaper'}
          className={clsx(
            'flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:cursor-not-allowed',
            !lweInstalled
              ? 'bg-black/60 text-gray-500 opacity-0 group-hover:opacity-100'
              : 'bg-black/60 text-white opacity-0 hover:bg-indigo-600 group-hover:opacity-100'
          )}
        >
          {isApplying ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        </button>
      </div>
    </div>
  )
}
