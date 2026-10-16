import { useState } from 'react'
import { Loader2, Play, Plus, RotateCcw, Scissors, X } from 'lucide-react'
import {
  formatVideoTime,
  normalizeVideoSegments,
  parseVideoTime,
  trimmedVideoLength,
  type VideoSegment
} from '@shared/videoTrim'
import { t } from '../../../i18n'

interface Props {
  segments: VideoSegment[]
  /** Seconds, null without ffprobe */

  duration: number | null
  live: boolean
  onCommit: (segments: VideoSegment[]) => Promise<void>
  /** seek: where playback jumps afterwards */
  onPreview: (segments: VideoSegment[], seek?: number) => void
}

const MIN_LENGTH = 0.5
// preview starts this long before a cut
const SEAM_LEAD = 3
const NEW_PART_LENGTH = 30

const timeInputClass =
  'w-16 rounded bg-fg/5 px-1 py-0.5 text-right text-gray-300 outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-50'

export default function VideoTrimSection({ segments, duration, live, onCommit, onPreview }: Props) {
  const [draft, setDraft] = useState<VideoSegment[] | null>(null)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const rows = draft ?? segments
  const index = Math.min(selected, rows.length - 1)
  const part = index >= 0 ? rows[index] : undefined
  const trimmed = segments.length > 0

  function endOf(segment: VideoSegment): number | null {
    return segment.end ?? duration
  }

  function seamSeek(segment: VideoSegment): number | undefined {
    const end = endOf(segment)
    return end === null ? undefined : Math.max(segment.start, end - SEAM_LEAD)
  }

  function clearText(key: string) {
    setTexts((prev) => {
      const rest = { ...prev }
      delete rest[key]
      return rest
    })
  }

  function withPart(i: number, changed: VideoSegment): VideoSegment[] {
    return rows.map((s, j) => (j === i ? changed : s))
  }

  async function commit(next: VideoSegment[]) {
    setBusy(true)
    try {
      await onCommit(normalizeVideoSegments(next, duration))
    } finally {
      setDraft(null)
      setTexts({})
      setBusy(false)
    }
  }

  function slide(side: 'start' | 'end', value: number) {
    if (!part) return
    const end = endOf(part)
    const changed =
      side === 'start'
        ? { ...part, start: end === null ? value : Math.min(value, end - MIN_LENGTH) }
        : { ...part, end: Math.max(value, part.start + MIN_LENGTH) }
    const next = withPart(index, changed)
    setDraft(next)
    onPreview(normalizeVideoSegments(next, duration), side === 'end' ? seamSeek(changed) : undefined)
  }

  function commitText(i: number, side: 'start' | 'end', text: string) {
    const key = `${i}-${side}`
    const reset = () => clearText(key)
    const value = text.trim() === '' ? (side === 'start' ? 0 : undefined) : parseVideoTime(text)
    if (value === null) return reset()
    const changed = { ...rows[i], [side]: value }
    if (changed.start === rows[i].start && changed.end === rows[i].end) return reset()
    const length = (changed.end ?? duration ?? Infinity) - changed.start
    if (length < MIN_LENGTH || (duration !== null && changed.start >= duration)) return reset()
    void commit(withPart(i, changed))
  }

  function newPart(): VideoSegment | null {
    const last = rows[rows.length - 1]
    const start = last ? last.end : 0
    if (start === undefined) return null
    if (duration === null) return { start, end: start + NEW_PART_LENGTH }
    if (start > duration - MIN_LENGTH) return null
    return { start, end: Math.min(start + NEW_PART_LENGTH, duration) }
  }

  function addPart() {
    const added = newPart()
    if (!added) return
    setSelected(rows.length)
    void commit([...rows, added])
  }

  function removePart(i: number) {
    setSelected(Math.max(0, i - 1))
    void commit(rows.filter((_, j) => j !== i))
  }

  function timeInput(i: number, side: 'start' | 'end') {
    const key = `${i}-${side}`
    const value = side === 'start' ? rows[i].start : endOf(rows[i])
    return (
      <input
        type="text"
        value={texts[key] ?? (value === null ? '' : formatVideoTime(value))}
        placeholder={side === 'start' ? '0:00' : t('trim.endPlaceholder')}
        disabled={busy}
        onFocus={() => setSelected(i)}
        onChange={(e) => setTexts((prev) => ({ ...prev, [key]: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') clearText(key)
        }}
        onBlur={(e) => texts[key] !== undefined && commitText(i, side, e.currentTarget.value)}
        title={t('trim.timeHint')}
        className={timeInputClass}
      />
    )
  }

  function slider(side: 'start' | 'end') {
    if (duration === null || !part) return null
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-7 text-gray-500">{side === 'start' ? t('trim.start') : t('trim.end')}</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={side === 'start' ? part.start : (part.end ?? duration)}
          disabled={busy}
          onChange={(e) => slide(side, Number(e.target.value))}
          onMouseUp={() => draft && commit(draft)}
          onTouchEnd={() => draft && commit(draft)}
          onKeyUp={() => draft && commit(draft)}
          title={side === 'start' ? t('trim.startHint') : t('trim.endHint')}
          className="w-full accent-accent-500 disabled:opacity-50"
        />
      </div>
    )
  }

  return (
    <div className="border-t border-fg/5 pt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Scissors size={12} />
        <span className="flex-1 text-left">{t('trim.title')}</span>
        {live && <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">{t('image.live')}</span>}
        {busy && <Loader2 size={11} className="animate-spin" />}
        {trimmed && (
          <button
            disabled={busy}
            onClick={() => commit([])}
            title={t('trim.reset')}
            className="text-gray-500 hover:text-gray-300 disabled:opacity-50"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>
      <p className="mb-1.5 text-[11px] text-gray-600">
        {t('trim.description')}
      </p>

      <div className="space-y-1.5 text-[11px] text-gray-400">
        {duration !== null && (
          <div className="relative h-2.5 overflow-hidden rounded bg-fg/5">
            {(rows.length ? rows : [{ start: 0 }]).map((s, i) => (
              <button
                key={i}
                disabled={!rows.length}
                onClick={() => setSelected(i)}
                title={`${formatVideoTime(s.start)} - ${formatVideoTime(endOf(s) ?? duration)}`}
                className={`absolute inset-y-0 ${rows.length && i === index ? 'bg-accent-400' : 'bg-accent-500/50'}`}
                style={{
                  left: `${(Math.min(s.start, duration) / duration) * 100}%`,
                  width: `${((Math.min(endOf(s) ?? duration, duration) - Math.min(s.start, duration)) / duration) * 100}%`
                }}
              />
            ))}
          </div>
        )}

        {rows.length === 0 && <p className="text-gray-600">{t('trim.whole')}</p>}
        {rows.map((s, i) => (
          <div key={i} className={`flex items-center gap-1.5 rounded px-1 ${i === index ? 'bg-fg/5' : ''}`}>
            <button
              onClick={() => setSelected(i)}
              className={`flex-1 text-left ${i === index ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {t('trim.part', { n: i + 1 })}
            </button>
            {timeInput(i, 'start')}
            <span className="text-gray-600">-</span>
            {timeInput(i, 'end')}
            <button
              disabled={busy}
              onClick={() => removePart(i)}
              title={t('trim.removePart')}
              className="text-gray-500 hover:text-red-300 disabled:opacity-50"
            >
              <X size={11} />
            </button>
          </div>
        ))}

        {slider('start')}
        {slider('end')}

        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="flex-1 text-gray-500">
            {duration !== null &&
              trimmed &&
              t('trim.plays', { length: formatVideoTime(trimmedVideoLength(duration, rows)), total: formatVideoTime(duration) })}
          </span>
          <button
            disabled={busy || newPart() === null}
            onClick={addPart}
            title={t('trim.addPartHint')}
            className="flex items-center gap-1 rounded bg-fg/10 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-fg/15 disabled:opacity-40"
          >
            <Plus size={9} />
            {t('trim.addPart')}
          </button>
          {live && trimmed && part && seamSeek(part) !== undefined && (
            <button
              disabled={busy}
              onClick={() => onPreview(segments, seamSeek(part))}
              title={t('trim.cutHint', { seconds: SEAM_LEAD, n: index + 1 })}
              className="flex items-center gap-1 rounded bg-fg/10 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-fg/15 disabled:opacity-40"
            >
              <Play size={9} />
              {t('trim.cut')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
