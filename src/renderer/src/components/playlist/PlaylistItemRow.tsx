import { useState } from 'react'
import { GripVertical, Trash2, Volume2, Clock, ChevronDown, ChevronUp, Play, Pause } from 'lucide-react'
import clsx from 'clsx'
import CompatBadge from '../common/CompatBadge'
import type { PlaylistItem, PlaylistMode, WallpaperMeta } from '@shared/types'
import { getPreviewSrc } from '../../utils/preview'
import { t } from '../../i18n'
import { parseTime } from '@shared/schedule'

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
  onUpdate: (patch: { volume?: number; durationSec?: number; endMinute?: number }) => void
  onContextMenu: (e: React.MouseEvent) => void
  onOpenDetail: () => void
  defaultDurationSec: number
  mode: PlaylistMode
  defaultVolume: number
  earlierEnd: number
  isLast: boolean
}

function formatMinute(minute: number): string {
  const clamped = Math.min(Math.max(Math.round(minute), 0), 1439)
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

function parseMinute(time: string): number | undefined {
  const parsed = parseTime(time)
  const minute = parsed ? parsed.hours * 60 + parsed.minutes : 0
  return minute > 0 ? minute : undefined
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
  mode,
  defaultVolume,
  earlierEnd,
  isLast
}: PlaylistItemRowProps) {
  const [expanded, setExpanded] = useState(false)

  const previewSrc = getPreviewSrc(wallpaper)

  return (
    <div
      draggable
      onDragStart={() => { onDragStart(index) }}
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
        isCurrent ? 'border-accent-500/60 bg-accent-500/10' : 'border-fg/5 bg-card'
      )}
    >
      <div className="flex items-center gap-2 p-2">
        <GripVertical size={14} className="shrink-0 cursor-grab text-gray-600" />
        <span className="w-5 shrink-0 text-center text-xs text-gray-600">{index + 1}</span>
        <button
          onClick={onPlay}
          title={isCurrent && isPlaying ? t('playlist.nowPlaying') : t('playlist.playThis')}
          className="group relative h-10 w-16 shrink-0 overflow-hidden rounded bg-sunken"
        >
          {previewSrc && (
            <img src={previewSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
          )}
          <CompatBadge compat={wallpaper?.compat} className="absolute bottom-0.5 left-0.5 z-10" />
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
          title={t('playlist.viewDetails')}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm text-gray-200 hover:text-fg" title={wallpaper?.title}>
            {wallpaper?.title ?? item.wallpaperId}
          </p>
          <p className="text-xs text-gray-600">
            {mode === 'timer'
              ? t('playlist.itemSummary', { seconds: item.durationSec ?? defaultDurationSec, volume: item.volume ?? defaultVolume })
              : mode === 'daytime' && (item.endMinute ?? 0) > 0
                ? t('playlist.itemUntil', { time: formatMinute(item.endMinute ?? 0), volume: item.volume ?? defaultVolume })
                : t('playlist.itemVolume', { volume: item.volume ?? defaultVolume })}
          </p>
        </button>
        <button
          onClick={() => { setExpanded((v) => !v) }}
          title={t('playlist.overrides')}
          className="rounded p-1.5 text-gray-500 hover:bg-fg/5 hover:text-gray-300"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={onRemove}
          title={t('playlist.removeItem')}
          className="rounded p-1.5 text-gray-500 hover:bg-red-500/20 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-wrap items-center gap-4 border-t border-fg/5 px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <Volume2 size={12} />
            {t('playlist.volume')}
            <input
              type="range"
              min={0}
              max={100}
              value={item.volume ?? defaultVolume}
              onChange={(e) => { onUpdate({ volume: Number(e.target.value) }); }}
              className="w-24 accent-accent-500"
            />
            <span className="w-8 text-gray-300">{item.volume ?? defaultVolume}</span>
            {item.volume !== undefined && (
              <button
                onClick={() => { onUpdate({ volume: undefined }); }}
                className="text-gray-600 hover:text-gray-300"
              >
                {t('common.reset')}
              </button>
            )}
          </label>
          {mode === 'timer' && (
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <Clock size={12} />
              {t('playlist.durationSeconds')}
              <input
                type="number"
                min={1}
                placeholder={String(defaultDurationSec)}
                value={item.durationSec ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  onUpdate({ durationSec: v === '' ? undefined : Number(v) })
                }}
                className="w-20 rounded bg-fg/5 px-2 py-1 text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
          )}
          {mode === 'daytime' && (
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <Clock size={12} />
              {t('playlist.until')}
              <input
                type="time"
                defaultValue={(item.endMinute ?? 0) > 0 ? formatMinute(item.endMinute ?? 0) : ''}
                onChange={(e) => {
                  const minute = parseMinute(e.target.value)
                  if (minute !== undefined) {
                    onUpdate({ endMinute: minute })
                  } else if (e.target.value === '00:00' && item.endMinute !== undefined) {
                    e.target.value = ''
                    onUpdate({ endMinute: undefined })
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '' && item.endMinute !== undefined) onUpdate({ endMinute: undefined })
                }}
                className="rounded bg-fg/5 px-2 py-1 text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
              />
              {!isLast && earlierEnd > 0 && (item.endMinute ?? 0) > 0 && (item.endMinute ?? 0) <= earlierEnd ? (
                <span className="text-amber-400">{t('playlist.untilNotLater', { time: formatMinute(earlierEnd) })}</span>
              ) : (
                <span className="text-gray-600">{t('playlist.untilHint')}</span>
              )}
            </label>
          )}
        </div>
      )}
    </div>
  )
}
