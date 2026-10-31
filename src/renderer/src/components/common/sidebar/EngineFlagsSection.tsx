import { useState } from 'react'
import { ChevronDown, ChevronRight, Gauge, Loader2, TriangleAlert } from 'lucide-react'
import type { EngineFlags, FullscreenPauseMode, WallpaperMeta } from '@shared/types'
import { hasEngineFlags } from '@shared/engineFlags'
import { BOOLEAN_FLAGS, CHOICE_FLAGS, FULLSCREEN_PAUSE_OPTIONS, optionLabel, presetName } from '../../../constants/engineFlags'
import { useConfig } from '../../../hooks/queries'
import { t } from '../../../i18n'

interface Props {
  flags?: EngineFlags
  onChange: (patch: Pick<WallpaperMeta, 'engineFlags' | 'fpsOverride'>) => Promise<void>
}

const selectClass = 'rounded bg-fg/5 px-1.5 py-1 text-xs text-gray-200 outline-none disabled:opacity-50'

const onOff = (value: boolean | undefined) => (value ? 'on' : 'off')
const onOffLabel = (value: boolean | undefined) => (value ? t('common.on') : t('common.off'))

export default function EngineFlagsSection({ flags = {}, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const config = useConfig()
  const global = config?.engineFlags ?? {}
  const presets = config?.engineFlagPresets ?? []

  async function commit(patch: Pick<WallpaperMeta, 'engineFlags' | 'fpsOverride'>) {
    setBusy(true)
    try {
      await onChange(patch)
    } finally {
      setBusy(false)
    }
  }

  function setFlag<K extends keyof EngineFlags>(key: K, value: EngineFlags[K] | undefined) {
    const next = { ...flags, [key]: value }
    if (value === undefined) delete next[key]
    void commit({ engineFlags: hasEngineFlags(next) ? next : undefined })
  }

  function applyPreset(id: string) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    const patch: Pick<WallpaperMeta, 'engineFlags' | 'fpsOverride'> = { engineFlags: { ...flags, ...preset.flags } }
    if (preset.fps !== undefined) patch.fpsOverride = preset.fps ?? undefined
    void commit(patch)
  }

  return (
    <div className="border-t border-fg/5 pt-3">
      <button
        onClick={() => { setOpen((v) => !v) }}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Gauge size={12} />
        <span className="flex-1 text-left">{t('perf.title')}</span>
        {hasEngineFlags(flags) && (
          <span className="rounded-full bg-accent-600/30 px-1.5 normal-case text-accent-300">{t('thumb.customBadge')}</span>
        )}
        {busy && <Loader2 size={11} className="animate-spin" />}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[11px] text-gray-600">{t('perf.overrideHint')}</p>

          <div className="flex items-center gap-2">
            <select
              value=""
              disabled={busy}
              onChange={(e) => { applyPreset(e.target.value) }}
              className={`${selectClass} flex-1`}
            >
              <option value="" disabled>
                {t('perf.applyPreset')}
              </option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {presetName(p)}
                </option>
              ))}
            </select>
            {hasEngineFlags(flags) && (
              <button
                onClick={() => void commit({ engineFlags: undefined })}
                disabled={busy}
                className="rounded bg-fg/5 px-2 py-1 text-xs text-gray-400 hover:bg-fg/10 disabled:opacity-50"
              >
                {t('common.reset')}
              </button>
            )}
          </div>

          {BOOLEAN_FLAGS.map(({ key, label, hint }) => (
            <label key={key} className="flex items-center justify-between gap-2 text-xs text-gray-300" title={hint && t(hint)}>
              <span>{t(label)}</span>
              <select
                value={flags[key] === undefined ? 'inherit' : onOff(flags[key])}
                disabled={busy}
                onChange={(e) => { setFlag(key, e.target.value === 'inherit' ? undefined : e.target.value === 'on') }}
                className={selectClass}
              >
                <option value="inherit">{t('common.defaultValue', { value: onOffLabel(global[key]) })}</option>
                <option value="on">{t('common.on')}</option>
                <option value="off">{t('common.off')}</option>
              </select>
            </label>
          ))}

          {CHOICE_FLAGS.map(({ key, label, hint, wallpaperNote, fallback, options }) => (
            <div key={key}>
              <label className="flex items-center justify-between gap-2 text-xs text-gray-300" title={t(hint)}>
                <span>{t(label)}</span>
                <select
                  value={flags[key] ?? 'inherit'}
                  disabled={busy}
                  onChange={(e) => { setFlag(key, e.target.value === 'inherit' ? undefined : (e.target.value as EngineFlags[typeof key])) }
                  }
                  className={selectClass}
                >
                  <option value="inherit">
                    {t('common.defaultValue', {
                      value: optionLabel(options.find((o) => o.value === (global[key] ?? fallback))?.label ?? '')
                    })}
                  </option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {optionLabel(o.label)}
                    </option>
                  ))}
                </select>
              </label>
              {wallpaperNote && flags[key] !== undefined && flags[key] !== fallback && (
                <p className="mt-1 flex gap-1.5 text-[11px] leading-snug text-amber-300">
                  <TriangleAlert size={12} className="mt-px shrink-0" />
                  {t(wallpaperNote)}
                </p>
              )}
            </div>
          ))}

          <label className="flex flex-col gap-1 text-xs text-gray-300">
            <span>{t('perf.fullscreenApps')}</span>
            <select
              value={flags.fullscreenPause ?? 'inherit'}
              disabled={busy}
              onChange={(e) => { setFlag('fullscreenPause', e.target.value === 'inherit' ? undefined : (e.target.value as FullscreenPauseMode)) }
              }
              className={selectClass}
            >
              <option value="inherit">
                {t('common.defaultValue', {
                  value: t(FULLSCREEN_PAUSE_OPTIONS.find((o) => o.value === (global.fullscreenPause ?? 'default'))!.label)
                })}
              </option>
              {FULLSCREEN_PAUSE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.label)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
