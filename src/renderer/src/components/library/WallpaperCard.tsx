import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Check, X, Trash2, Download, Archive, AlertTriangle, RotateCw, Plus, FolderOpen, WifiOff } from 'lucide-react'
import type { WallpaperMeta } from '@shared/types'
import clsx from 'clsx'
import CompatBadge from '../common/CompatBadge'
import { getPreviewSrc } from '../../utils/preview'
import { hasBackup } from '../../utils/wallpaper'
import { useToast } from '../common/Toast'
import type { PreviewSize } from '../../hooks/usePreviewSize'
import {
  CardAction,
  CardOverlay,
  CardPreview,
  CornerBadge,
  GridCard,
  LikeAction,
  PlayButton,
  ProgressBar,
  SteamAction
} from '../common/GridCard'

interface WallpaperCardProps {
  wallpaper: WallpaperMeta
  selected: boolean
  isDetailOpen: boolean
  lweInstalled: boolean
  isLiked: boolean
  voteError?: string
  showVoteBorder: boolean
  currentPlaylistId: string | null
  isInCurrentPlaylist: boolean
  previewSize: PreviewSize
  backupProgress: { percentage: number; status: 'copying' | 'verifying' } | null
  onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

export default function WallpaperCard({
  wallpaper,
  selected,
  isDetailOpen,
  lweInstalled,
  isLiked,
  voteError,
  showVoteBorder,
  currentPlaylistId,
  isInCurrentPlaylist,
  previewSize,
  backupProgress,
  onSelect,
  onContextMenu
}: WallpaperCardProps) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [isApplying, setIsApplying] = useState(false)
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
        queryClient.invalidateQueries({ queryKey: ['library'] })
      }
    })
  }, [wallpaper.downloading, wallpaper.id, queryClient])

  function refreshLibrary() {
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function handleRedownload(e: React.MouseEvent) {
    e.stopPropagation()
    if (isRedownloading) return
    setIsRedownloading(true)
    setError(null)
    try {
      await window.electronAPI.steam.redownload(wallpaper.id)
      refreshLibrary()
    } catch (err) {
      setError((err as Error).message)
      setIsRedownloading(false)
    }
  }

  async function handleApply() {
    setIsApplying(true)
    setError(null)
    try {
      await window.electronAPI.wallpaper.apply({ wallpaperId: wallpaper.id })
      refreshLibrary()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsApplying(false)
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

  async function handleAddToPlaylist() {
    if (!currentPlaylistId || isAddingToPlaylist || isInCurrentPlaylist) return
    setIsAddingToPlaylist(true)
    setError(null)
    try {
      await window.electronAPI.playlist.addItems(currentPlaylistId, [wallpaper.id])
      showToast('Added to current playlist')
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
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
      refreshLibrary()
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    } catch (err) {
      setError((err as Error).message)
      setUnsubState('idle')
    }
  }

  async function handleOpenLocally() {
    if (!wallpaper.localPath) return
    await window.electronAPI.shell.openPath(wallpaper.localPath)
  }

  const previewSrc = getPreviewSrc(wallpaper)
  const compact = previewSize !== 'big'

  const playBlocked = !lweInstalled || !!wallpaper.downloading || !!wallpaper.downloadFailed

  return (
    <GridCard
      data-wallpaper-id={wallpaper.id}
      selected={selected}
      isDetailOpen={isDetailOpen}
      isLiked={isLiked}
      voteError={voteError}
      showVoteBorder={showVoteBorder}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/wallpaper-id', wallpaper.id)
        e.dataTransfer.setData('text/wallpaper-selected', 'true')
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <CardPreview src={previewSrc} alt={wallpaper.title}>
        {wallpaper.downloading && (
          <CardOverlay>
            <Download size={20} className="text-indigo-400 animate-bounce" />
            <span className="text-xs text-gray-300">
              {downloadPercentage != null ? `Downloading... ${downloadPercentage}%` : 'Downloading...'}
            </span>
            {downloadPercentage != null && (
              <ProgressBar percentage={downloadPercentage} className="h-1 w-full max-w-[140px] rounded-full bg-white/10" />
            )}
          </CardOverlay>
        )}
        {wallpaper.downloadFailed && (
          <CardOverlay>
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
          </CardOverlay>
        )}
        {backupProgress != null && (
          <CardOverlay>
            <Archive size={20} className="text-indigo-400 animate-pulse" />
            <span className="text-xs text-gray-300">
              {backupProgress.status === 'verifying'
                ? `Verifying... ${backupProgress.percentage}%`
                : `Backing up... ${backupProgress.percentage}%`}
            </span>
            <ProgressBar percentage={backupProgress.percentage} className="h-1 w-full max-w-[140px] rounded-full bg-white/10" />
          </CardOverlay>
        )}
        {wallpaper.hdr && (
          <span
            className="absolute right-2 top-2 rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold leading-none tracking-wide text-amber-300"
            title={
              wallpaper.type === 'video'
                ? 'HDR video - shown in HDR with the HDR output setting on an HDR monitor'
                : 'Uses HDR rendering - needs post processing set to Ultra'
            }
          >
            HDR
          </span>
        )}
        {backupProgress == null && hasBackup(wallpaper) && (
          <CornerBadge className="bottom-2 right-2 bg-black/60 text-indigo-300" title="Backed up locally">
            <Archive size={12} />
          </CornerBadge>
        )}
        {wallpaper.unavailable && (
          <CornerBadge
            className="bottom-2 left-2 bg-amber-600/80 text-white"
            title="Removed from the Steam Workshop - back it up before it's lost"
          >
            <WifiOff size={12} />
          </CornerBadge>
        )}
        <CompatBadge
          compat={wallpaper.compat}
          className={clsx('absolute bottom-2', wallpaper.unavailable ? 'left-8' : 'left-2')}
        />
      </CardPreview>

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
          <LikeAction
            id={wallpaper.id}
            isLiked={isLiked}
            unavailable={wallpaper.unavailable}
            compact={compact}
            onError={setError}
          />
          <CardAction
            icon={isInCurrentPlaylist ? Check : Plus}
            label={isInCurrentPlaylist ? 'Added' : 'Add'}
            busy={isAddingToPlaylist}
            compact={compact}
            tone={isInCurrentPlaylist ? 'active' : 'default'}
            disabled={!currentPlaylistId || isAddingToPlaylist || isInCurrentPlaylist}
            title={
              !currentPlaylistId
                ? 'No playlist is currently active'
                : isInCurrentPlaylist
                  ? 'Already in current playlist'
                  : 'Add to current playlist (+)'
            }
            onClick={handleAddToPlaylist}
          />
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
            <CardAction
              icon={Trash2}
              label="Unsub"
              busy={unsubState === 'pending'}
              compact={compact}
              tone="danger"
              disabled={unsubState === 'pending'}
              title="Unsubscribe and delete files"
              onClick={handleUnsubscribeClick}
            />
          )}
          <SteamAction id={wallpaper.id} compact={compact} />
          <CardAction
            icon={FolderOpen}
            label="Open"
            compact={compact}
            disabled={!wallpaper.localPath}
            title={wallpaper.localPath ? 'Open wallpaper folder' : 'Local files not found'}
            onClick={handleOpenLocally}
          />
        </div>
      </div>

      <div className="absolute right-2 top-2">
        <PlayButton
          busy={isApplying}
          ready={!playBlocked}
          disabled={isApplying || playBlocked}
          title={
            wallpaper.downloading
              ? 'Wallpaper is still downloading'
              : wallpaper.downloadFailed
                ? 'Download failed - use Redownload to try again'
                : !lweInstalled
                  ? 'Install linux-wallpaperengine in Settings first'
                  : 'Play wallpaper'
          }
          onClick={handleApply}
        />
      </div>
    </GridCard>
  )
}
