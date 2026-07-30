import { useState } from 'react'
import { Download, Check, Loader2, ThumbsUp, ExternalLink, Play, Clock, AlertTriangle } from 'lucide-react'
import type { WorkshopItem } from '@shared/types'
import type { SubscribeState } from '../../hooks/useSubscriptionQueue'
import clsx from 'clsx'
import { openWorkshopPage } from '../../utils/steam'

interface WorkshopCardProps {
  item: WorkshopItem
  selected?: boolean
  isLiked?: boolean
  canPlay?: boolean
  lweInstalled?: boolean
  subscribeState?: SubscribeState
  downloadPercentage?: number
  onSelect?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onLiked?: () => void
  onPlay?: () => void | Promise<void>
  onSubscribe?: () => void
  onOpenDetail?: () => void
}

export default function WorkshopCard({
  item,
  selected = false,
  isLiked = false,
  canPlay = false,
  lweInstalled = false,
  subscribeState,
  downloadPercentage,
  onSelect,
  onContextMenu,
  onLiked,
  onPlay,
  onSubscribe,
  onOpenDetail
}: WorkshopCardProps) {
  const [isLiking, setIsLiking] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  const subscribed =
    item.isSubscribed ||
    subscribeState === 'download-queued' ||
    subscribeState === 'downloading' ||
    subscribeState === 'done' ||
    subscribeState === 'download-error'

  function handleSubscribe(e: React.MouseEvent) {
    e.stopPropagation()
    onSubscribe?.()
  }

  async function handlePlay(e: React.MouseEvent) {
    e.stopPropagation()
    if (!canPlay || isApplying) return
    setIsApplying(true)
    try {
      await onPlay?.()
    } finally {
      setIsApplying(false)
    }
  }

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation()
    if (isLiked || isLiking) return
    setIsLiking(true)
    try {
      await window.electronAPI.steam.vote(item.publishedFileId, true)
      onLiked?.()
    } catch (err) {
      console.error('Like failed:', err)
    } finally {
      setIsLiking(false)
    }
  }

  return (
    <div
      data-workshop-id={item.publishedFileId}
      className={clsx(
        'group relative overflow-hidden rounded-lg bg-[#1a1a1a] transition-all hover:ring-1',
        selected ? 'ring-2 ring-indigo-500' : 'hover:ring-indigo-500/50'
      )}
      onContextMenu={onContextMenu}
      onClick={onSelect}
    >
      <div
        className={clsx(
          'absolute left-2 top-2 z-10 transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <div
          className={clsx(
            'flex h-5 w-5 items-center justify-center rounded border',
            selected
              ? 'border-indigo-500 bg-indigo-500'
              : 'border-white/40 bg-black/60'
          )}
        >
          {selected && <Check size={12} className="text-white" />}
        </div>
      </div>

      <div
        className="aspect-video overflow-hidden bg-[#111] relative cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          onOpenDetail?.()
        }}
      >
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-600">No preview</div>
        )}
        {subscribeState === 'downloading' && downloadPercentage != null && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div
              className="h-full bg-indigo-500 transition-[width]"
              style={{ width: `${downloadPercentage}%` }}
            />
          </div>
        )}
        {subscribeState === 'download-error' && (
          <button
            onClick={handleSubscribe}
            title="Subscribed, but the download failed (disk full?) - click to retry"
            className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded bg-red-600/80 text-white hover:bg-red-600"
          >
            <AlertTriangle size={12} />
          </button>
        )}
        {(subscribeState === 'download-queued' || subscribeState === 'downloading') && (
          <div
            className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-indigo-300"
            title={
              subscribeState === 'downloading' && downloadPercentage != null
                ? `Downloading... ${downloadPercentage}%`
                : 'Queued to download'
            }
          >
            {subscribeState === 'downloading' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Clock size={12} />
            )}
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-gray-200" title={item.title}>
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-gray-500">{item.subscriptions.toLocaleString()} subscribers</p>
        <div className="mt-2 flex items-center gap-1.5">
          {onLiked && (
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
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              openWorkshopPage(item.publishedFileId)
            }}
            title="Open in Steam Workshop"
            className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
          >
            <ExternalLink size={11} />
            Steam
          </button>
        </div>
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {canPlay && (
          <button
            onClick={handlePlay}
            disabled={isApplying || !lweInstalled}
            title={lweInstalled ? 'Play wallpaper' : 'Install linux-wallpaperengine in Settings first'}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-opacity disabled:cursor-not-allowed',
              lweInstalled
                ? 'opacity-0 hover:bg-indigo-600 group-hover:opacity-100'
                : 'text-gray-500 opacity-0 group-hover:opacity-100'
            )}
          >
            {isApplying ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
        )}
        {subscribed ? (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600/80 text-white"
            title="Subscribed"
          >
            <Check size={14} />
          </div>
        ) : subscribeState === 'queued' ? (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-gray-300"
            title="Queued to subscribe"
          >
            <Clock size={14} />
          </div>
        ) : subscribeState === 'subscribing' ? (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-indigo-300"
            title="Subscribing..."
          >
            <Loader2 size={14} className="animate-spin" />
          </div>
        ) : subscribeState === 'subscribe-error' ? (
          <button
            onClick={handleSubscribe}
            title="Subscribe failed, click to retry"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600/80 text-white hover:bg-red-600"
          >
            <AlertTriangle size={14} />
          </button>
        ) : (
          <button
            onClick={handleSubscribe}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-indigo-600 group-hover:opacity-100"
          >
            <Download size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
