import { useState } from 'react'
import { Loader2, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { ImageAdjustments } from '@shared/types'
import { IMAGE_FILTERS, NEUTRAL_COLOR_VALUE, hasImageAdjustments } from '@shared/imageAdjustments'
import { t, translatedOr } from '../../../i18n'
import type { MessageKey } from '@shared/i18n'

interface Props {
  adjustments?: ImageAdjustments
  live: boolean
  onCommit: (adjustments: ImageAdjustments | undefined) => Promise<void>
  onPreview: (adjustments: ImageAdjustments) => void
}

type SliderKey = 'filterStrength' | 'brightness' | 'contrast' | 'saturation' | 'hue'

const COLOR_SLIDERS: { key: SliderKey; label: MessageKey }[] = [
  { key: 'brightness', label: 'image.brightness' },
  { key: 'contrast', label: 'image.contrast' },
  { key: 'saturation', label: 'image.saturation' },
  { key: 'hue', label: 'image.hue' }
]

const selectClass = 'w-full rounded bg-fg/5 px-1.5 py-1 text-xs text-gray-200 outline-none disabled:opacity-50'

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
          onChange={(e) => { slide(key, Number(e.target.value)) }}
          onMouseUp={() => void (draft && commit(draft))}
          onTouchEnd={() => void (draft && commit(draft))}
          onKeyUp={() => void (draft && commit(draft))}
          className="w-full accent-accent-500 disabled:opacity-50"
        />
      </div>
    )
  }

  const colorsChanged = COLOR_SLIDERS.some(({ key }) => (current[key] ?? NEUTRAL_COLOR_VALUE) !== NEUTRAL_COLOR_VALUE)

  return (
    <div className="border-t border-fg/5 pt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <SlidersHorizontal size={12} />
        <span className="flex-1 text-left">{t('image.title')}</span>
        {live && <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">{t('image.live')}</span>}
        {busy && <Loader2 size={11} className="animate-spin" />}
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] text-gray-400">
          {t('image.filter')}
          <select
            value={current.filter ?? ''}
            disabled={busy}
            onChange={(e) => void commit({ ...current, filter: e.target.value })}
            className={selectClass}
          >
            <option value="">{t('image.noFilter')}</option>
            {IMAGE_FILTERS.map((f, i) => (
              <option key={f.value} value={f.value}>
                {i + 1} {translatedOr(`imageFilter.${f.value}`, f.label)}
              </option>
            ))}
          </select>
        </label>

        {current.filter && slider('filterStrength', t('image.filterStrength'), 100)}

        <label className="flex items-center gap-2 text-[11px] text-gray-400">
          <input
            type="checkbox"
            checked={current.colorEnabled ?? false}
            disabled={busy}
            onChange={(e) => void commit({ ...current, colorEnabled: e.target.checked })}
            className="accent-accent-500"
          />
          <span className="flex-1">{t('image.colorOptions')}</span>
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
              title={t('image.resetColors')}
              className="text-gray-500 hover:text-gray-300 disabled:opacity-50"
            >
              <RotateCcw size={11} />
            </button>
          )}
        </label>

        {current.colorEnabled && COLOR_SLIDERS.map(({ key, label }) => slider(key, t(label), NEUTRAL_COLOR_VALUE))}

        <label className="flex items-center gap-2 text-[11px] text-gray-400">
          <input
            type="checkbox"
            checked={current.flip ?? false}
            disabled={busy}
            onChange={(e) => void commit({ ...current, flip: e.target.checked })}
            className="accent-accent-500"
          />
          {t('image.flip')}
        </label>
      </div>
    </div>
  )
}
