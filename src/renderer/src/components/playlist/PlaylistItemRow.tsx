import { useState } from 'react'
import { GripVertical, Trash2, Volume2, Clock, ChevronDown, ChevronUp, Play, Pause } from 'lucide-react'
import clsx from 'clsx'
import type { PlaylistItem, WallpaperMeta } from '@shared/types'
import { getPreviewSrc } from '../../utils/preview'

interface PlaylistItemRowProps {
  item: PlaylistItem
  wallpaper: WallpaperMeta | undefined
  index: number
  isPlaying: boolean
  isCurrent: boolean
  onDragStart: (index: number) => void
  onDragOver: (index: number) => void
  onDrop: () => void
  onPlay: () => void
  onRemove: () => void
  onUpdate: (patch: { volume?: number; durationSec?: number }) => void
  onContextMenu: (e: React.MouseEvent) => void
  onOpenDetail: () => void
  defaultDurationSec: number
  defaultVolume: number
}

export default function PlaylistItemRow({
  item,
  wallpaper,
  index,
  isPlaying,
  isCurrent,
  onDragStart,
  onDragOver,
  onDrop,
  onPlay,
  onRemove,
  onUpdate,
  onContextMenu,
  onOpenDetail,
  defaultDurationSec,
  defaultVolume
}: PlaylistItemRowProps) {
  const [expanded, setExpanded] = useState(false)

  const previewSrc = getPreviewSrc(wallpaper)

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver(index)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onContextMenu={onContextMenu}
      className={clsx(
        'rounded-lg border transition-colors',
        isCurrent ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-white/5 bg-[#1a1a1a]'
      )}
    >
      <div className="flex items-center gap-2 p-2">
        <GripVertical size={14} className="shrink-0 cursor-grab text-gray-600" />
        <span className="w-5 shrink-0 text-center text-xs text-gray-600">{index + 1}</span>
        <button
          onClick={onPlay}
          title={isCurrent && isPlaying ? 'Now playing' : 'Play this wallpaper'}
          className="group relative h-10 w-16 shrink-0 overflow-hidden rounded bg-[#111]"
        >
          {previewSrc && (
            <img src={previewSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
          )}
          <div
            className={clsx(
              'absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity',
              isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            {isCurrent && isPlaying ? (
              <Pause size={14} className="text-white" />
            ) : (
              <Play size={14} className="text-white" />
            )}
          </div>
        </button>
        <button
          onClick={onOpenDetail}
          title="View details"
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm text-gray-200 hover:text-white" title={wallpaper?.title}>
            {wallpaper?.title ?? item.wallpaperId}
          </p>
          <p className="text-xs text-gray-600">
            {item.durationSec ?? defaultDurationSec}s · Vol {item.volume ?? defaultVolume}
          </p>
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          title="Per-wallpaper overrides"
          className="rounded p-1.5 text-gray-500 hover:bg-white/5 hover:text-gray-300"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={onRemove}
          title="Remove from playlist"
          className="rounded p-1.5 text-gray-500 hover:bg-red-500/20 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-wrap items-center gap-4 border-t border-white/5 px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <Volume2 size={12} />
            Volume
            <input
              type="range"
              min={0}
              max={100}
              value={item.volume ?? defaultVolume}
              onChange={(e) => onUpdate({ volume: Number(e.target.value) })}
              className="w-24 accent-indigo-500"
            />
            <span className="w-8 text-gray-300">{item.volume ?? defaultVolume}</span>
            {item.volume !== undefined && (
              <button
                onClick={() => onUpdate({ volume: undefined })}
                className="text-gray-600 hover:text-gray-300"
              >
                Reset
              </button>
            )}
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <Clock size={12} />
            Duration (s)
            <input
              type="number"
              min={1}
              placeholder={String(defaultDurationSec)}
              value={item.durationSec ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim()
                onUpdate({ durationSec: v === '' ? undefined : Number(v) })
              }}
              className="w-20 rounded bg-white/5 px-2 py-1 text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
        </div>
      )}
    </div>
  )
}
