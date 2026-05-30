import { useState } from 'react'
import { Play, Loader2, Check, ThumbsUp, Trash2, ExternalLink, Download } from 'lucide-react'
import type { WallpaperMeta } from '@shared/types'
import clsx from 'clsx'

interface WallpaperCardProps {
  wallpaper: WallpaperMeta
  selected?: boolean
  lweInstalled?: boolean
  isLiked?: boolean
  onApplied?: () => void
  onLiked?: () => void
  onUnsubscribed?: () => void
  onSelect?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function WallpaperCard({
  wallpaper,
  selected,
  lweInstalled,
  isLiked = false,
  onApplied,
  onLiked,
  onUnsubscribed,
  onSelect,
  onContextMenu
}: WallpaperCardProps) {
  const [isApplying, setIsApplying] = useState(false)
  const [isLiking, setIsLiking] = useState(false)
  const [unsubState, setUnsubState] = useState<'idle' | 'confirm' | 'pending'>('idle')
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

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation()
    if (isLiked || isLiking) return
    setIsLiking(true)
    try {
      await window.electronAPI.steam.vote(wallpaper.id, true)
      onLiked?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLiking(false)
    }
  }

  async function handleUnsubscribeClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (unsubState === 'idle') { setUnsubState('confirm'); return }
    if (unsubState !== 'confirm') return
    setUnsubState('pending')
    try {
      await window.electronAPI.steam.unsubscribe(wallpaper.id)
      onUnsubscribed?.()
    } catch (err) {
      setError((err as Error).message)
      setUnsubState('idle')
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

      <div className="aspect-video overflow-hidden bg-[#111] relative">
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
        {wallpaper.downloading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70">
            <Download size={20} className="text-indigo-400 animate-bounce" />
            <span className="text-xs text-gray-300">Downloading…</span>
          </div>
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
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleLike}
            disabled={isLiked || isLiking}
            title={isLiked ? 'Already liked on Steam' : 'Like on Steam'}
            className={clsx(
              'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:cursor-default',
              isLiked
                ? 'bg-green-600/30 text-green-300'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
            )}
          >
            {isLiking ? <Loader2 size={11} className="animate-spin" /> : <ThumbsUp size={11} />}
            {isLiked ? 'Liked' : 'Like'}
          </button>
          {unsubState === 'confirm' ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">Sure?</span>
              <button
                onClick={handleUnsubscribeClick}
                className="rounded bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-600"
              >
                Yes
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setUnsubState('idle') }}
                className="rounded bg-white/5 px-2 py-1 text-xs text-gray-400 hover:bg-white/10"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={handleUnsubscribeClick}
              disabled={unsubState === 'pending'}
              title="Unsubscribe and delete files"
              className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {unsubState === 'pending' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              Unsub
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              window.electronAPI.shell.openExternal(`steam://url/CommunityFilePage/${wallpaper.id}`)
            }}
            title="Open in Steam Workshop"
            className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
          >
            <ExternalLink size={11} />
            Steam
          </button>
        </div>
      </div>

      {/* Apply button */}
      <div className="absolute right-2 top-2">
        <button
          onClick={handleApply}
          disabled={isApplying || !lweInstalled || wallpaper.downloading}
          title={wallpaper.downloading ? 'Wallpaper is still downloading' : !lweInstalled ? 'Install linux-wallpaperengine in Settings first' : 'Play wallpaper'}
          className={clsx(
            'flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:cursor-not-allowed',
            !lweInstalled || wallpaper.downloading
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
