import { useState } from 'react'
import { Download, Check, Loader2, Clock, AlertTriangle } from 'lucide-react'
import type { WorkshopItem } from '@shared/types'
import { isSubscribedState, type SubscribeState } from '../../hooks/useSubscriptionQueue'
import { formatFileSize } from '../../utils/format'
import { CardPreview, CornerBadge, GridCard, LikeAction, PlayButton, ProgressBar, SteamAction } from '../common/GridCard'

interface WorkshopCardProps {
  item: WorkshopItem
  selected: boolean
  isDetailOpen: boolean
  ignored: boolean
  isLiked: boolean
  voteError?: string
  showVoteBorder: boolean
  canPlay: boolean
  lweInstalled: boolean
  subscribeState?: SubscribeState
  downloadPercentage?: number
  onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onPlay: () => Promise<void>
  onSubscribe: () => void
}

const STATUS_CLASS = 'flex h-7 w-7 items-center justify-center rounded-full'

export default function WorkshopCard({
  item,
  selected,
  isDetailOpen,
  ignored,
  isLiked,
  voteError,
  showVoteBorder,
  canPlay,
  lweInstalled,
  subscribeState,
  downloadPercentage,
  onSelect,
  onContextMenu,
  onPlay,
  onSubscribe
}: WorkshopCardProps) {
  const [isApplying, setIsApplying] = useState(false)
  const fileSizeLabel = formatFileSize(item.fileSize)
  const subscribed = item.isSubscribed || isSubscribedState(subscribeState)

  function handleSubscribe(e: React.MouseEvent) {
    e.stopPropagation()
    onSubscribe()
  }

  async function handlePlay() {
    if (isApplying) return
    setIsApplying(true)
    try {
      await onPlay()
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <GridCard
      data-workshop-id={item.publishedFileId}
      selected={selected}
      isDetailOpen={isDetailOpen}
      isLiked={isLiked}
      voteError={voteError}
      showVoteBorder={showVoteBorder}
      onContextMenu={onContextMenu}
      onClick={onSelect}
    >
      <CardPreview src={item.previewUrl} alt={item.title} dimmed={ignored}>
        {ignored && (
          <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-gray-300">
            Ignored
          </div>
        )}
        {subscribeState === 'downloading' && downloadPercentage != null && (
          <ProgressBar percentage={downloadPercentage} className="absolute bottom-0 left-0 right-0 h-1 bg-black/40" />
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
          <CornerBadge
            className="bottom-2 right-2 bg-black/60 text-indigo-300"
            title={
              subscribeState === 'downloading' && downloadPercentage != null
                ? `Downloading... ${downloadPercentage}%`
                : 'Queued to download'
            }
          >
            {subscribeState === 'downloading' ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
          </CornerBadge>
        )}
      </CardPreview>

      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-gray-200" title={item.title}>
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          {item.subscriptions.toLocaleString()} subscribers
          {fileSizeLabel ? ` · ${fileSizeLabel}` : ''}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <LikeAction id={item.publishedFileId} isLiked={isLiked} />
          <SteamAction id={item.publishedFileId} />
        </div>
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {canPlay && (
          <PlayButton
            busy={isApplying}
            ready={lweInstalled}
            disabled={isApplying || !lweInstalled}
            title={lweInstalled ? 'Play wallpaper' : 'Install linux-wallpaperengine in Settings first'}
            onClick={handlePlay}
          />
        )}
        {subscribed ? (
          <div className={`${STATUS_CLASS} bg-green-600/80 text-white`} title="Subscribed">
            <Check size={14} />
          </div>
        ) : subscribeState === 'queued' ? (
          <div className={`${STATUS_CLASS} bg-black/60 text-gray-300`} title="Queued to subscribe">
            <Clock size={14} />
          </div>
        ) : subscribeState === 'subscribing' ? (
          <div className={`${STATUS_CLASS} bg-black/60 text-indigo-300`} title="Subscribing...">
            <Loader2 size={14} className="animate-spin" />
          </div>
        ) : subscribeState === 'subscribe-error' ? (
          <button
            onClick={handleSubscribe}
            title="Subscribe failed, click to retry"
            className={`${STATUS_CLASS} bg-red-600/80 text-white hover:bg-red-600`}
          >
            <AlertTriangle size={14} />
          </button>
        ) : (
          <button
            onClick={handleSubscribe}
            className={`${STATUS_CLASS} bg-black/60 text-white opacity-0 transition-opacity hover:bg-indigo-600 group-hover:opacity-100`}
          >
            <Download size={14} />
          </button>
        )}
      </div>
    </GridCard>
  )
}
