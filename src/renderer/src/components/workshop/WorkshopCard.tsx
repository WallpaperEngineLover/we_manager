import { useState } from 'react'
import { Download, Check, Loader2 } from 'lucide-react'
import type { WorkshopItem } from '@shared/types'
import clsx from 'clsx'

interface WorkshopCardProps {
  item: WorkshopItem
  selected?: boolean
  onToggleSelect?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function WorkshopCard({
  item,
  selected = false,
  onToggleSelect,
  onContextMenu
}: WorkshopCardProps) {
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [subscribed, setSubscribed] = useState(item.isSubscribed)

  async function handleSubscribe(e: React.MouseEvent) {
    e.stopPropagation()
    setIsSubscribing(true)
    try {
      await window.electronAPI.steam.subscribe(item.publishedFileId)
      setSubscribed(true)
    } catch (err) {
      console.error('Subscribe failed:', err)
    } finally {
      setIsSubscribing(false)
    }
  }

  return (
    <div
      className={clsx(
        'group relative overflow-hidden rounded-lg bg-[#1a1a1a] transition-all hover:ring-1',
        selected ? 'ring-2 ring-indigo-500' : 'hover:ring-indigo-500/50'
      )}
      onContextMenu={onContextMenu}
      onClick={onToggleSelect}
    >
      {/* Selection checkbox */}
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

      {/* Preview image */}
      <div className="aspect-video overflow-hidden bg-[#111]">
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
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-gray-200" title={item.title}>
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-gray-500">{item.subscriptions.toLocaleString()} subscribers</p>
      </div>

      {/* Subscribe button */}
      <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
        {subscribed ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600/80 text-white">
            <Check size={14} />
          </div>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={isSubscribing}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-indigo-600 group-hover:opacity-100 disabled:cursor-not-allowed"
          >
            {isSubscribing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}
