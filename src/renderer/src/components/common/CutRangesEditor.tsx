import { useEffect, useRef, useState } from 'react'
import { Plus, SkipForward, X } from 'lucide-react'
import { cutRangesProblem, type CutRange } from '@shared/video-tools'
import { formatVideoTimeExact, parseVideoTime } from '@shared/videoTrim'
import Toggle from './Toggle'
import { inputClass } from './inputClass'
import { t } from '../../i18n'

export interface CutPartText {
  start: string
  end: string
}

export function partsFromRanges(ranges: CutRange[]): CutPartText[] {
  return ranges.map((r) => ({ start: formatVideoTimeExact(r.start), end: formatVideoTimeExact(r.end) }))
}

export function parseParts(parts: CutPartText[]): (CutRange | null)[] {
  return parts.map((p) => {
    const start = parseVideoTime(p.start)
    const end = parseVideoTime(p.end)
    return start === null || end === null ? null : { start, end }
  })
}

export function cutProblem(parts: CutPartText[], duration: number): 'range' | 'order' | null {
  const parsed = parseParts(parts)
  if (parsed.some((r) => r === null)) return 'range'
  return cutRangesProblem(parsed as CutRange[], duration)
}

const SEAM_LEAD = 2
const SLIDER_STEP = 10

// whole milliseconds, 1.1 * 10 is 11.000000000000002 and would count as a step more
const toSteps = (seconds: number): number => Math.round(seconds * 1000) / (1000 / SLIDER_STEP)

interface Props {
  parts: CutPartText[]
  duration: number
  previewUrl: string | null
  onChange: (parts: CutPartText[]) => void
}

export default function CutRangesEditor({ parts, duration, previewUrl, onChange }: Props) {
  const [selected, setSelected] = useState(0)
  const [previewOn, setPreviewOn] = useState(false)
  const [playError, setPlayError] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const index = Math.min(selected, parts.length - 1)
  const parsed = parseParts(parts)
  const problem = cutProblem(parts, duration)
  const valid = parsed.filter((r): r is CutRange => r !== null && r.end > r.start)
  const steps = toSteps(duration)
  const endMax = Math.max(1, Math.ceil(steps))
  // the end of the video sits on the last step, which can be short of a whole one, any other time on the nearest
  const endStep = (end: number): number => (Math.abs(end - duration) < 0.001 ? endMax : Math.min(Math.round(toSteps(end)), endMax))
  const kept = valid.reduce((sum, r) => sum + Math.min(r.end, duration) - r.start, 0)
  const validRef = useRef<CutRange[]>([])
  const validKey = valid.map((r) => `${r.start}-${r.end}`).join(',')
  useEffect(() => {
    validRef.current = valid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validKey])

  function setPart(i: number, patch: Partial<CutPartText>) {
    onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  function addPart() {
    const last = parsed[parsed.length - 1]
    const from = last ? Math.min(last.end, duration) : 0
    if (from >= duration - 0.5) return
    const to = Math.min(duration, from + Math.max(1, Math.round(duration / 10)))
    setSelected(parts.length)
    onChange([...parts, { start: formatVideoTimeExact(from), end: formatVideoTimeExact(to) }])
  }

  function removePart(i: number) {
    setSelected(Math.max(0, i - 1))
    onChange(parts.filter((_, j) => j !== i))
  }

  function playFrom(seconds: number) {
    const el = video.current
    if (!el) return
    el.currentTime = seconds
    void el.play().catch(() => { setPlayError(true) })
  }

  useEffect(() => {
    const el = video.current
    if (!previewOn || !el) return
    let frame = 0
    const tick = () => {
      const ranges = validRef.current
      if (!el.paused && ranges.length > 0) {
        const now = el.currentTime
        const inside = ranges.some((r) => now >= r.start && now < r.end)
        if (!inside) {
          const next = ranges.find((r) => r.start > now)
          // past the last part the preview starts over
          el.currentTime = (next ?? ranges[0]).start
        }
      }
      frame = requestAnimationFrame(tick)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(tick)
    }
    const stop = () => { cancelAnimationFrame(frame) }
    el.addEventListener('play', start)
    el.addEventListener('pause', stop)
    el.addEventListener('ended', stop)
    if (!el.paused) start()
    return () => {
      stop()
      el.removeEventListener('play', start)
      el.removeEventListener('pause', stop)
      el.removeEventListener('ended', stop)
    }
  }, [previewOn])

  const part = index >= 0 ? parsed[index] : null

  return (
    <div className="flex flex-col gap-2 text-sm text-gray-400">
      <div className="relative h-3 overflow-hidden rounded bg-fg/10" title={t('optimize.cutJoinHint')}>
        {valid.map((r, i) => (
          <div
            key={i}
            className="absolute inset-y-0 bg-accent-500/80"
            style={{ left: `${(r.start / duration) * 100}%`, width: `${((Math.min(r.end, duration) - r.start) / duration) * 100}%` }}
          />
        ))}
      </div>

      {parts.map((p, i) => (
        <div
          key={i}
          onClick={() => { setSelected(i) }}
          className={`flex items-center gap-2 rounded px-1 py-0.5 ${i === index ? 'bg-fg/5' : ''}`}
        >
          <span className="w-14 text-xs text-gray-500">{t('optimize.cutPartLabel', { n: i + 1 })}</span>
          <input value={p.start} onChange={(e) => { setPart(i, { start: e.target.value }) }} className={`${inputClass} w-24`} />
          <span>-</span>
          <input value={p.end} onChange={(e) => { setPart(i, { end: e.target.value }) }} className={`${inputClass} w-24`} />
          {i === 0 && <span className="text-xs text-gray-500">/ {formatVideoTimeExact(duration)}</span>}
          {previewOn && i < parts.length - 1 && parsed[i] && (
            <button
              type="button"
              title={t('optimize.cutSeam')}
              onClick={() => { playFrom(Math.max(parsed[i]!.start, parsed[i]!.end - SEAM_LEAD)) }}
              className="rounded p-1 text-gray-400 hover:bg-fg/10"
            >
              <SkipForward size={14} />
            </button>
          )}
          {parts.length > 1 && (
            <button
              type="button"
              title={t('optimize.cutRemovePart')}
              onClick={(e) => { e.stopPropagation(); removePart(i) }}
              className="ml-auto rounded p-1 text-gray-400 hover:bg-fg/10"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}

      {part && index >= 0 && (
        <>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(steps))}
            value={Math.round(part.start * SLIDER_STEP)}
            onChange={(e) => { setPart(index, { start: formatVideoTimeExact(Number(e.target.value) / SLIDER_STEP) }) }}
            className="w-full"
          />
          <input
            type="range"
            min={0}
            max={endMax}
            value={endStep(part.end)}
            onChange={(e) => { setPart(index, { end: formatVideoTimeExact(Math.min(Number(e.target.value) / SLIDER_STEP, duration)) }) }}
            className="w-full"
          />
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addPart}
          className="flex items-center gap-1 rounded bg-fg/5 px-2 py-1 text-xs text-gray-300 hover:bg-fg/10"
        >
          <Plus size={12} />
          {t('optimize.cutAddPart')}
        </button>
        {!problem && <span className="text-xs text-gray-500">{t('optimize.cutResult', { length: formatVideoTimeExact(kept), parts: valid.length })}</span>}
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-300">
          {t('optimize.cutPreview')}
          <Toggle on={previewOn && !!previewUrl} onClick={() => { setPreviewOn(!previewOn); setPlayError(false) }} disabled={!previewUrl} />
        </label>
      </div>

      {problem === 'range' && <p className="text-xs text-red-400">{t('optimize.errCut')}</p>}
      {problem === 'order' && <p className="text-xs text-red-400">{t('optimize.errCutOrder')}</p>}
      {!previewUrl && <p className="text-xs text-gray-500">{t('optimize.cutPreviewUnsupported')}</p>}

      {previewOn && previewUrl && (
        <div className="flex flex-col gap-1">
          <video
            ref={video}
            src={previewUrl}
            controls
            muted
            onPlay={() => {
              const el = video.current
              if (el && valid.length > 0 && !valid.some((r) => el.currentTime >= r.start && el.currentTime < r.end)) {
                el.currentTime = (valid.find((r) => r.start > el.currentTime) ?? valid[0]).start
              }
            }}
            onError={() => { setPlayError(true) }}
            className="w-full rounded bg-black"
          />
          {playError && <p className="text-xs text-red-400">{t('optimize.cutPreviewUnsupported')}</p>}
        </div>
      )}
    </div>
  )
}
