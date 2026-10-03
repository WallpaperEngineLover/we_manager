import { useState } from 'react'
import { Loader2, Play, RotateCcw, Scissors } from 'lucide-react'
import { formatVideoTime, parseVideoTime, trimmedVideoLength } from '@shared/videoTrim'

export interface VideoTrim {
  start?: number
  end?: number
}

interface Props {
  start?: number
  end?: number
  /** Length of the whole video in seconds, null when it couldn't be measured (no ffprobe) */
  duration: number | null
  live: boolean
  onCommit: (trim: VideoTrim) => Promise<void>
  /** seek is where playback should jump right after, to watch the loop point */
  onPreview: (trim: VideoTrim, seek?: number) => void
}

// a loop shorter than this is almost always a slip of the slider
const MIN_LENGTH = 0.5
// how much before the end the loop point preview starts
const SEAM_LEAD = 3

const timeInputClass =
  'w-16 rounded bg-white/5 px-1 py-0.5 text-right text-gray-300 outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50'

export default function VideoTrimSection({ start, end, duration, live, onCommit, onPreview }: Props) {
  const [draft, setDraft] = useState<VideoTrim | null>(null)
  const [startText, setStartText] = useState<string | null>(null)
  const [endText, setEndText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const current = draft ?? { start, end }
  const startValue = current.start ?? 0
  const loopEnd = current.end ?? duration
  const trimmed = start !== undefined || end !== undefined

  // the very start and the very end are the same as no trim at all
  function normalize(trim: VideoTrim): VideoTrim {
    return {
      start: trim.start !== undefined && trim.start > 0 ? trim.start : undefined,
      end: trim.end !== undefined && (duration === null || trim.end < duration) ? trim.end : undefined
    }
  }

  function seamSeek(trim: VideoTrim): number | undefined {
    const endOfLoop = trim.end ?? duration
    return endOfLoop === null ? undefined : Math.max(trim.start ?? 0, endOfLoop - SEAM_LEAD)
  }

  async function commit(next: VideoTrim) {
    setBusy(true)
    try {
      await onCommit(normalize(next))
    } finally {
      setDraft(null)
      setStartText(null)
      setEndText(null)
      setBusy(false)
    }
  }

  function slideStart(value: number) {
    const next = { ...current, start: loopEnd === null ? value : Math.min(value, loopEnd - MIN_LENGTH) }
    setDraft(next)
    onPreview(normalize(next))
  }

  function slideEnd(value: number) {
    const next = { ...current, end: Math.max(value, startValue + MIN_LENGTH) }
    setDraft(next)
    onPreview(normalize(next), seamSeek(next))
  }

  function commitText(side: 'start' | 'end', text: string) {
    const reset = () => (side === 'start' ? setStartText(null) : setEndText(null))
    const value = text.trim() === '' ? undefined : parseVideoTime(text)
    if (value === null) return reset()
    const next = { ...current, [side]: value }
    const length = (next.end ?? duration ?? Infinity) - (next.start ?? 0)
    if (length < MIN_LENGTH || (side === 'start' && duration !== null && (value ?? 0) >= duration)) return reset()
    if (value === current[side]) return reset()
    void commit(next)
  }

  function timeInput(side: 'start' | 'end') {
    const text = side === 'start' ? startText : endText
    const setText = side === 'start' ? setStartText : setEndText
    const value = side === 'start' ? startValue : loopEnd
    return (
      <input
        type="text"
        value={text ?? (value === null ? '' : formatVideoTime(value))}
        placeholder={side === 'start' ? '0:00' : 'end'}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setText(null)
        }}
        onBlur={(e) => text !== null && commitText(side, e.currentTarget.value)}
        title="Seconds, m:ss or h:mm:ss - applies on Enter or clicking away"
        className={timeInputClass}
      />
    )
  }

  function slider(side: 'start' | 'end') {
    if (duration === null) return null
    const value = side === 'start' ? startValue : (loopEnd ?? duration)
    return (
      <input
        type="range"
        min={0}
        max={duration}
        step={0.1}
        value={value}
        disabled={busy}
        onChange={(e) => (side === 'start' ? slideStart : slideEnd)(Number(e.target.value))}
        onMouseUp={() => draft && commit(draft)}
        onTouchEnd={() => draft && commit(draft)}
        onKeyUp={() => draft && commit(draft)}
        title={side === 'start' ? 'Where the loop starts' : 'Where the loop ends and jumps back to the start'}
        className="w-full accent-indigo-500 disabled:opacity-50"
      />
    )
  }

  return (
    <div className="border-t border-white/5 pt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Scissors size={12} />
        <span className="flex-1 text-left">Video trim</span>
        {live && <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">live</span>}
        {busy && <Loader2 size={11} className="animate-spin" />}
        {trimmed && (
          <button
            disabled={busy}
            onClick={() => commit({})}
            title="Play the whole video again"
            className="text-gray-500 hover:text-gray-300 disabled:opacity-50"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>
      <p className="mb-1.5 text-[11px] text-gray-600">Only this part of the video plays, over and over.</p>

      <div className="space-y-1.5 text-[11px] text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="flex-1">Start</span>
          {timeInput('start')}
        </div>
        {slider('start')}
        <div className="flex items-center gap-1.5">
          <span className="flex-1">End</span>
          {timeInput('end')}
        </div>
        {slider('end')}

        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="flex-1 text-gray-500">
            {duration !== null &&
              `Loops ${formatVideoTime(trimmedVideoLength(duration, current.start, current.end))} of ${formatVideoTime(duration)}`}
          </span>
          {live && trimmed && seamSeek({ start, end }) !== undefined && (
            <button
              disabled={busy}
              onClick={() => onPreview({ start, end }, seamSeek({ start, end }))}
              title={`Jumps ${SEAM_LEAD} seconds before the end, to see how the loop point looks`}
              className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-white/15 disabled:opacity-40"
            >
              <Play size={9} />
              Loop point
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
