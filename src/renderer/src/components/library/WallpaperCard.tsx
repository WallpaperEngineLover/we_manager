import { useState, useEffect } from 'react'
import { Play, Loader2, Check, X, ThumbsUp, Trash2, ExternalLink, Download, Archive, AlertTriangle, RotateCw, Plus, FolderOpen, WifiOff } from 'lucide-react'
import type { WallpaperMeta } from '@shared/types'
import clsx from 'clsx'
import { getPreviewSrc } from '../../utils/preview'
import { openWorkshopPage } from '../../utils/steam'
import { useToast } from '../common/Toast'
import type { PreviewSize } from '../../hooks/usePreviewSize'

interface WallpaperCardProps {
  wallpaper: WallpaperMeta
  selected?: boolean
  isDetailOpen?: boolean
  lweInstalled?: boolean
  isLiked?: boolean
  currentPlaylistId?: string | null
  previewSize?: PreviewSize
  onApplied?: () => void
  onLiked?: () => void
  onUnsubscribed?: () => void
  onAddedToPlaylist?: () => void
  onRedownloaded?: () => void
  onSelect?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function WallpaperCard({
  wallpaper,
  selected,
  isDetailOpen,
  lweInstalled,
  isLiked = false,
  currentPlaylistId = null,
  previewSize = 'normal',
  onApplied,
  onLiked,
  onUnsubscribed,
  onAddedToPlaylist,
  onRedownloaded,
  onSelect,
  onContextMenu
}: WallpaperCardProps) {
  const { showToast } = useToast()
  const [isApplying, setIsApplying] = useState(false)
  const [isLiking, setIsLiking] = useState(false)
  const [unsubState, setUnsubState] = useState<'idle' | 'confirm' | 'pending'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fpsInput, setFpsInput] = useState(wallpaper.fpsOverride != null ? String(wallpaper.fpsOverride) : '')
  const [isAddingToPlaylist, setIsAddingToPlaylist] = useState(false)
  const [isRedownloading, setIsRedownloading] = useState(false)
  const [downloadPercentage, setDownloadPercentage] = useState<number | null>(null)

  useEffect(() => {
    if (!wallpaper.downloading) {
      setDownloadPercentage(null)
      return
    }
    return window.electronAPI.on.downloadProgress((progress) => {
      if (progress.itemId !== wallpaper.id) return
      if (progress.status === 'downloading') {
        setDownloadPercentage(progress.percentage)
      } else {
        setDownloadPercentage(null)
        setIsRedownloading(false)
        onRedownloaded?.()
      }
    })
  }, [wallpaper.downloading, wallpaper.id, onRedownloaded])

  async function handleRedownload(e: React.MouseEvent) {
    e.stopPropagation()
    if (isRedownloading) return
    setIsRedownloading(true)
    setError(null)
    try {
      await window.electronAPI.steam.redownload(wallpaper.id)
      onRedownloaded?.()
    } catch (err) {
      setError((err as Error).message)
      setIsRedownloading(false)
    }
  }

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
    if (isLiked || isLiking || wallpaper.unavailable) return
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

  function handleFpsBlur() {
    const trimmed = fpsInput.trim()
    const parsed = trimmed === '' ? undefined : parseInt(trimmed, 10)
    if (parsed !== undefined && (isNaN(parsed) || parsed < 1)) return
    const current = wallpaper.fpsOverride
    if ((parsed ?? undefined) === current) return
    window.electronAPI.library.update(wallpaper.id, { fpsOverride: parsed })
  }

  async function handleAddToPlaylist(e: React.MouseEvent) {
    e.stopPropagation()
    if (!currentPlaylistId || isAddingToPlaylist) return
    setIsAddingToPlaylist(true)
    setError(null)
    try {
      await window.electronAPI.playlist.addItems(currentPlaylistId, [wallpaper.id])
      showToast('Added to current playlist')
      onAddedToPlaylist?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsAddingToPlaylist(false)
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

  async function handleOpenLocally(e: React.MouseEvent) {
    e.stopPropagation()
    if (!wallpaper.localPath) return
    await window.electronAPI.shell.openPath(wallpaper.localPath)
  }

  const previewSrc = getPreviewSrc(wallpaper)
  const compact = previewSize !== 'big'

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
        isDetailOpen
          ? 'ring-2 ring-sky-400'
          : selected
            ? 'ring-2 ring-indigo-500'
            : 'hover:ring-1 hover:ring-indigo-500/50'
      )}
    >
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 px-4">
            <Download size={20} className="text-indigo-400 animate-bounce" />
            <span className="text-xs text-gray-300">
              {downloadPercentage != null ? `Downloading... ${downloadPercentage}%` : 'Downloading...'}
            </span>
            {downloadPercentage != null && (
              <div className="h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-indigo-500 transition-[width]"
                  style={{ width: `${downloadPercentage}%` }}
                />
              </div>
            )}
          </div>
        )}
        {wallpaper.downloadFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 px-4 text-center">
            <AlertTriangle size={20} className="text-red-400" />
            <span className="text-xs text-gray-300">Download failed</span>
            <button
              onClick={handleRedownload}
              disabled={isRedownloading}
              className="flex items-center gap-1 rounded bg-indigo-600/80 px-2 py-1 text-xs text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRedownloading ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />}
              Redownload
            </button>
          </div>
        )}
        {(wallpaper.backedUp || wallpaper.source === 'backup') && (
          <div
            className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-indigo-300"
            title="Backed up locally"
          >
            <Archive size={12} />
          </div>
        )}
        {wallpaper.unavailable && (
          <div
            className="absolute bottom-2 left-2 flex h-5 w-5 items-center justify-center rounded bg-amber-600/80 text-white"
            title="Removed from the Steam Workshop - back it up before it's lost"
          >
            <WifiOff size={12} />
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
        <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-gray-500">FPS:</span>
          <input
            type="number"
            min={1}
            max={360}
            placeholder="default"
            value={fpsInput}
            onChange={(e) => setFpsInput(e.target.value)}
            onBlur={handleFpsBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
            className="w-16 rounded bg-white/5 px-1.5 py-0.5 text-xs text-gray-300 outline-none focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        <div className={clsx('mt-2 flex items-center', compact ? 'gap-1' : 'gap-2')}>
          <button
            onClick={handleLike}
            disabled={isLiked || isLiking || wallpaper.unavailable}
            title={
              wallpaper.unavailable
                ? 'Removed from the Steam Workshop - voting is no longer possible'
                : isLiked
                  ? 'Already liked on Steam'
                  : 'Like on Steam'
            }
            className={clsx(
              'flex items-center gap-1 rounded text-xs transition-colors disabled:cursor-not-allowed',
              compact ? 'p-1.5' : 'px-2 py-1',
              wallpaper.unavailable
                ? 'bg-white/5 text-gray-600 opacity-50'
                : isLiked
                  ? 'bg-green-600/30 text-green-300'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
            )}
          >
            {isLiking ? <Loader2 size={11} className="animate-spin" /> : <ThumbsUp size={11} />}
            {!compact && (isLiked ? 'Liked' : 'Like')}
          </button>
          <button
            onClick={handleAddToPlaylist}
            disabled={!currentPlaylistId || isAddingToPlaylist}
            title={currentPlaylistId ? 'Add to current playlist (+)' : 'No playlist is currently active'}
            className={clsx(
              'flex items-center gap-1 rounded bg-white/5 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50',
              compact ? 'p-1.5' : 'px-2 py-1'
            )}
          >
            {isAddingToPlaylist ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            {!compact && 'Add'}
          </button>
          {unsubState === 'confirm' ? (
            <div className="flex items-center gap-1">
              {!compact && <span className="text-xs text-gray-400">Sure?</span>}
              <button
                onClick={handleUnsubscribeClick}
                title="Confirm unsubscribe"
                className={clsx('rounded bg-red-600/80 text-xs text-white hover:bg-red-600', compact ? 'p-1.5' : 'px-2 py-1')}
              >
                {compact ? <Check size={11} /> : 'Yes'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setUnsubState('idle') }}
                title="Cancel"
                className={clsx('rounded bg-white/5 text-xs text-gray-400 hover:bg-white/10', compact ? 'p-1.5' : 'px-2 py-1')}
              >
                {compact ? <X size={11} /> : 'No'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleUnsubscribeClick}
              disabled={unsubState === 'pending'}
              title="Unsubscribe and delete files"
              className={clsx(
                'flex items-center gap-1 rounded bg-white/5 text-xs text-gray-400 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50',
                compact ? 'p-1.5' : 'px-2 py-1'
              )}
            >
              {unsubState === 'pending' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              {!compact && 'Unsub'}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              openWorkshopPage(wallpaper.id)
            }}
            title="Open in Steam Workshop"
            className={clsx(
              'flex items-center gap-1 rounded bg-white/5 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200',
              compact ? 'p-1.5' : 'px-2 py-1'
            )}
          >
            <ExternalLink size={11} />
            {!compact && 'Steam'}
          </button>
          <button
            onClick={handleOpenLocally}
            disabled={!wallpaper.localPath}
            title={wallpaper.localPath ? 'Open wallpaper folder' : 'Local files not found'}
            className={clsx(
              'flex items-center gap-1 rounded bg-white/5 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50',
              compact ? 'p-1.5' : 'px-2 py-1'
            )}
          >
            <FolderOpen size={11} />
            {!compact && 'Open'}
          </button>
        </div>
      </div>

      <div className="absolute right-2 top-2">
        <button
          onClick={handleApply}
          disabled={isApplying || !lweInstalled || wallpaper.downloading || wallpaper.downloadFailed}
          title={
            wallpaper.downloading
              ? 'Wallpaper is still downloading'
              : wallpaper.downloadFailed
                ? 'Download failed - use Redownload to try again'
                : !lweInstalled
                  ? 'Install linux-wallpaperengine in Settings first'
                  : 'Play wallpaper'
          }
          className={clsx(
            'flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:cursor-not-allowed',
            !lweInstalled || wallpaper.downloading || wallpaper.downloadFailed
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
