import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Check, ExternalLink, Loader2, Play, ThumbsUp, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import type { CardBorders } from '@shared/cardBorders'
import { cardFrames, type CardSteamState } from '../../hooks/useCardBorders'
import { useVoteAction } from '../../hooks/useVotes'
import { openWorkshopPage } from '../../utils/steam'
import PreviewImage from './PreviewImage'

// Building blocks shared by the workshop and library wallpaper cards

interface GridCardProps extends HTMLAttributes<HTMLDivElement> {
  selected: boolean
  isDetailOpen: boolean
  steam: CardSteamState
  borders: CardBorders
  [dataAttr: `data-${string}`]: string
}

// outside the card, so a liked favorite shows both colors
const FRAME_INSET_PX = [4, 7]

export function GridCard({ selected, isDetailOpen, steam, borders, className, children, ...rest }: GridCardProps) {
  const { frames, title } = cardFrames(borders, steam)
  return (
    <div
      {...rest}
      data-preview-hover=""
      title={title}
      className={clsx(
        'group relative cursor-pointer select-none rounded-xl bg-card shadow-sm shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/25',
        isDetailOpen ? 'ring-2 ring-sky-400' : selected ? 'ring-2 ring-accent-500' : 'ring-1 ring-fg/5 hover:ring-accent-500/50',
        className
      )}
    >
      {frames.map((frame, i) => (
        <div
          key={frame.kind}
          aria-hidden
          className="pointer-events-none absolute border-2"
          style={{
            inset: -FRAME_INSET_PX[i],
            borderRadius: 12 + FRAME_INSET_PX[i],
            borderColor: frame.color,
            borderStyle: frame.kind === 'failed' ? 'dashed' : 'solid'
          }}
        />
      ))}
      <div className="relative h-full overflow-hidden rounded-xl">
        <div
          className={clsx(
            'absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-all',
            selected
              ? 'border-accent-500 bg-accent-600 text-white opacity-100'
              : 'border-white/30 bg-black/50 text-transparent opacity-0 group-hover:opacity-100'
          )}
        >
          <Check size={12} />
        </div>
        {children}
      </div>
    </div>
  )
}

export function CardPreview({
  src,
  alt,
  dimmed = false,
  children
}: {
  src?: string
  alt: string
  dimmed?: boolean
  children?: ReactNode
}) {
  return (
    <div className="relative aspect-video overflow-hidden bg-sunken">
      {src ? (
        <PreviewImage
          src={src}
          alt={alt}
          className={clsx('transition-transform duration-300 group-hover:scale-105', dimmed && 'brightness-50')}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-600">No preview</div>
      )}
      {children}
    </div>
  )
}

// full-preview status layer (downloading, failed, backing up)
export function CardOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 px-4 text-center">
      {children}
    </div>
  )
}

export function ProgressBar({ percentage, className }: { percentage: number; className: string }) {
  return (
    <div className={clsx('overflow-hidden', className)}>
      <div className="h-full bg-accent-500 transition-[width]" style={{ width: `${percentage}%` }} />
    </div>
  )
}

// small square status icon in a preview corner
export function CornerBadge({ className, title, children }: { className: string; title: string; children: ReactNode }) {
  return (
    <div className={clsx('absolute flex h-5 w-5 items-center justify-center rounded', className)} title={title}>
      {children}
    </div>
  )
}

type ActionTone = 'default' | 'active' | 'danger' | 'muted'

const TONE_CLASS: Record<ActionTone, string> = {
  default: 'bg-fg/5 text-gray-400 hover:bg-fg/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50',
  active: 'bg-green-600/30 text-green-300 disabled:cursor-default',
  danger: 'bg-fg/5 text-gray-400 hover:bg-red-500/20 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50',
  muted: 'bg-fg/5 text-gray-600 opacity-50 disabled:cursor-not-allowed'
}

interface CardActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  busy?: boolean
  compact?: boolean
  tone?: ActionTone
}

// row button under a card's title, icon-only when compact
export function CardAction({ icon: Icon, label, busy, compact = false, tone = 'default', onClick, ...rest }: CardActionProps) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(e)
      }}
      className={clsx(
        'flex items-center gap-1 rounded text-xs transition-colors',
        compact ? 'p-1.5' : 'px-2 py-1',
        TONE_CLASS[tone]
      )}
    >
      {busy ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
      {!compact && label}
    </button>
  )
}

export function LikeAction({
  id,
  isLiked,
  unavailable = false,
  compact,
  onError
}: {
  id: string
  isLiked: boolean
  unavailable?: boolean
  compact?: boolean
  onError?: (message: string) => void
}) {
  const { vote, isLiking } = useVoteAction(onError)
  return (
    <CardAction
      icon={ThumbsUp}
      label={isLiked ? 'Liked' : 'Like'}
      busy={isLiking}
      compact={compact}
      tone={unavailable ? 'muted' : isLiked ? 'active' : 'default'}
      disabled={isLiked || isLiking || unavailable}
      title={
        unavailable
          ? 'Removed from the Steam Workshop - voting is no longer possible'
          : isLiked
            ? 'Already liked on Steam'
            : 'Like on Steam'
      }
      onClick={() => vote(id, true)}
    />
  )
}

export function SteamAction({ id, compact }: { id: string; compact?: boolean }) {
  return (
    <CardAction
      icon={ExternalLink}
      label="Steam"
      compact={compact}
      title="Open in Steam Workshop"
      onClick={() => openWorkshopPage(id)}
    />
  )
}

// round button in the preview's top right corner, shown on hover
export function PlayButton({
  busy,
  ready,
  disabled,
  title,
  onClick
}: {
  busy: boolean
  ready: boolean
  disabled: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      title={title}
      className={clsx(
        'flex h-7 w-7 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed',
        ready ? 'text-white hover:bg-accent-600' : 'text-gray-500'
      )}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
    </button>
  )
}
