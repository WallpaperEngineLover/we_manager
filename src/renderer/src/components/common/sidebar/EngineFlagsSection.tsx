import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Gauge, Loader2 } from 'lucide-react'
import type { EngineFlags, FullscreenPauseMode, WallpaperMeta } from '@shared/types'
import { hasEngineFlags } from '@shared/engineFlags'
import { BOOLEAN_FLAGS, FULLSCREEN_PAUSE_OPTIONS } from '../../../constants/engineFlags'

interface Props {
  flags?: EngineFlags
  onChange: (patch: Pick<WallpaperMeta, 'engineFlags' | 'fpsOverride'>) => Promise<void>
}

const selectClass = 'rounded bg-white/5 px-1.5 py-1 text-xs text-gray-200 outline-none disabled:opacity-50'

const onOff = (value: boolean | undefined) => (value ? 'on' : 'off')

export default function EngineFlagsSection({ flags = {}, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => window.electronAPI.config.get()
  })
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
    <div className="border-t border-white/5 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Gauge size={12} />
        <span className="flex-1 text-left">Performance</span>
        {hasEngineFlags(flags) && (
          <span className="rounded-full bg-indigo-600/30 px-1.5 normal-case text-indigo-300">custom</span>
        )}
        {busy && <Loader2 size={11} className="animate-spin" />}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[11px] text-gray-600">
            Overrides the global settings for this wallpaper. Changing one restarts it if it's playing.
          </p>

          <div className="flex items-center gap-2">
            <select
              value=""
              disabled={busy}
              onChange={(e) => applyPreset(e.target.value)}
              className={`${selectClass} flex-1`}
            >
              <option value="" disabled>
                Apply a preset...
              </option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {hasEngineFlags(flags) && (
              <button
                onClick={() => commit({ engineFlags: undefined })}
                disabled={busy}
                className="rounded bg-white/5 px-2 py-1 text-xs text-gray-400 hover:bg-white/10 disabled:opacity-50"
              >
                Reset
              </button>
            )}
          </div>

          {BOOLEAN_FLAGS.map(({ key, label, hint }) => (
            <label key={key} className="flex items-center justify-between gap-2 text-xs text-gray-300" title={hint}>
              <span>{label}</span>
              <select
                value={flags[key] === undefined ? 'inherit' : onOff(flags[key])}
                disabled={busy}
                onChange={(e) => setFlag(key, e.target.value === 'inherit' ? undefined : e.target.value === 'on')}
                className={selectClass}
              >
                <option value="inherit">Default ({onOff(global[key])})</option>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>
          ))}

          <label className="flex flex-col gap-1 text-xs text-gray-300">
            <span>Fullscreen apps</span>
            <select
              value={flags.fullscreenPause ?? 'inherit'}
              disabled={busy}
              onChange={(e) =>
                setFlag('fullscreenPause', e.target.value === 'inherit' ? undefined : (e.target.value as FullscreenPauseMode))
              }
              className={selectClass}
            >
              <option value="inherit">
                Default ({FULLSCREEN_PAUSE_OPTIONS.find((o) => o.value === (global.fullscreenPause ?? 'default'))?.label})
              </option>
              {FULLSCREEN_PAUSE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
