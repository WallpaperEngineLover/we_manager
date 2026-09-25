import { useState } from 'react'
import { Loader2, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { ImageAdjustments } from '@shared/types'
import { IMAGE_FILTERS, NEUTRAL_COLOR_VALUE, hasImageAdjustments } from '@shared/imageAdjustments'

interface Props {
  adjustments?: ImageAdjustments
  live: boolean
  onCommit: (adjustments: ImageAdjustments | undefined) => Promise<void>
  onPreview: (adjustments: ImageAdjustments) => void
}

type SliderKey = 'filterStrength' | 'brightness' | 'contrast' | 'saturation' | 'hue'

const COLOR_SLIDERS: { key: SliderKey; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'hue', label: 'Hue shift' }
]

const selectClass = 'w-full rounded bg-white/5 px-1.5 py-1 text-xs text-gray-200 outline-none disabled:opacity-50'

export default function ImageAdjustmentsSection({ adjustments = {}, live, onCommit, onPreview }: Props) {
  const [draft, setDraft] = useState<ImageAdjustments | null>(null)
  const [busy, setBusy] = useState(false)
  const current = draft ?? adjustments

  async function commit(next: ImageAdjustments) {
    setBusy(true)
    try {
      await onCommit(hasImageAdjustments(next) ? next : undefined)
    } finally {
      setDraft(null)
      setBusy(false)
    }
  }

  function slide(key: SliderKey, value: number) {
    const next = { ...current, [key]: value }
    setDraft(next)
    onPreview(next)
  }

  function slider(key: SliderKey, label: string, fallback: number) {
    const value = current[key] ?? fallback
    return (
      <div key={key}>
        <div className="flex items-center text-[11px] text-gray-400">
          <span className="flex-1">{label}</span>
          <span>{value}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          disabled={busy}
          onChange={(e) => slide(key, Number(e.target.value))}
          onMouseUp={() => draft && commit(draft)}
          onTouchEnd={() => draft && commit(draft)}
          onKeyUp={() => draft && commit(draft)}
          className="w-full accent-indigo-500 disabled:opacity-50"
        />
      </div>
    )
  }

  const colorsChanged = COLOR_SLIDERS.some(({ key }) => (current[key] ?? NEUTRAL_COLOR_VALUE) !== NEUTRAL_COLOR_VALUE)

  return (
    <div className="border-t border-white/5 pt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <SlidersHorizontal size={12} />
        <span className="flex-1 text-left">Image</span>
        {live && <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">live</span>}
        {busy && <Loader2 size={11} className="animate-spin" />}
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] text-gray-400">
          Image filter
          <select
            value={current.filter ?? ''}
            disabled={busy}
            onChange={(e) => commit({ ...current, filter: e.target.value })}
            className={selectClass}
          >
            <option value="">None</option>
            {IMAGE_FILTERS.map((f, i) => (
              <option key={f.value} value={f.value}>
                {i + 1} {f.label}
              </option>
            ))}
          </select>
        </label>

        {current.filter && slider('filterStrength', 'Filter strength', 100)}

        <label className="flex items-center gap-2 text-[11px] text-gray-400">
          <input
            type="checkbox"
            checked={current.colorEnabled ?? false}
            disabled={busy}
            onChange={(e) => commit({ ...current, colorEnabled: e.target.checked })}
            className="accent-indigo-500"
          />
          <span className="flex-1">Color options</span>
          {current.colorEnabled && colorsChanged && (
            <button
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                // explicit values, a running engine keeps whatever a request leaves out
                void commit({
                  ...current,
                  brightness: NEUTRAL_COLOR_VALUE,
                  contrast: NEUTRAL_COLOR_VALUE,
                  saturation: NEUTRAL_COLOR_VALUE,
                  hue: NEUTRAL_COLOR_VALUE
                })
              }}
              title="Back to the original colors"
              className="text-gray-500 hover:text-gray-300 disabled:opacity-50"
            >
              <RotateCcw size={11} />
            </button>
          )}
        </label>

        {current.colorEnabled && COLOR_SLIDERS.map(({ key, label }) => slider(key, label, NEUTRAL_COLOR_VALUE))}

        <label className="flex items-center gap-2 text-[11px] text-gray-400">
          <input
            type="checkbox"
            checked={current.flip ?? false}
            disabled={busy}
            onChange={(e) => commit({ ...current, flip: e.target.checked })}
            className="accent-indigo-500"
          />
          Flip horizontally
        </label>
      </div>
    </div>
  )
}
