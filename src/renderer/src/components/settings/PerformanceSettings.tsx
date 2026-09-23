import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Save, Trash2 } from 'lucide-react'
import type { EngineFlagPreset, EngineFlags, FullscreenPauseMode } from '@shared/types'
import { BOOLEAN_FLAGS, FULLSCREEN_PAUSE_OPTIONS } from '../../constants/engineFlags'

interface Props {
  defaultFps: number | null
  onDefaultFpsChanged: (fps: number | null) => void
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        on ? 'bg-indigo-600' : 'bg-white/10'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function describePreset(preset: EngineFlagPreset): string {
  const parts = BOOLEAN_FLAGS.filter((f) => preset.flags[f.key]).map((f) => f.label.toLowerCase())
  const pause = FULLSCREEN_PAUSE_OPTIONS.find((o) => o.value === preset.flags.fullscreenPause)
  if (pause && pause.value !== 'default') parts.push(pause.label.toLowerCase())
  if (preset.fps) parts.push(`${preset.fps} FPS`)
  return parts.length ? parts.join(', ') : 'everything on'
}

export default function PerformanceSettings({ defaultFps, onDefaultFpsChanged }: Props) {
  const queryClient = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => window.electronAPI.config.get()
  })
  const flags: EngineFlags = config?.engineFlags ?? {}
  const presets = config?.engineFlagPresets ?? []
  const [newName, setNewName] = useState('')
  const [appliedId, setAppliedId] = useState<string | null>(null)

  async function saveFlags(next: EngineFlags) {
    queryClient.setQueryData(['config'], { ...config!, engineFlags: next })
    await window.electronAPI.config.setEngineFlags(next)
    queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  async function savePresets(next: EngineFlagPreset[]) {
    await window.electronAPI.config.setEnginePresets(next)
    queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  async function applyPreset(preset: EngineFlagPreset) {
    await saveFlags({ ...flags, ...preset.flags })
    if (preset.fps !== undefined) {
      await window.electronAPI.config.setDefaultFps(preset.fps)
      onDefaultFpsChanged(preset.fps)
    }
    setAppliedId(preset.id)
    setTimeout(() => setAppliedId(null), 2000)
  }

  async function createPreset() {
    const name = newName.trim()
    if (!name) return
    setNewName('')
    await savePresets([...presets, { id: crypto.randomUUID(), name, flags: { ...flags }, fps: defaultFps }])
  }

  async function overwritePreset(preset: EngineFlagPreset) {
    await savePresets(presets.map((p) => (p.id === preset.id ? { ...p, flags: { ...flags }, fps: defaultFps } : p)))
  }

  async function deletePreset(id: string) {
    await savePresets(presets.filter((p) => p.id !== id))
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Performance</label>
      <p className="mt-1 text-xs text-gray-600">
        Engine settings for every wallpaper. A wallpaper can override each of them in its Performance panel.
        They only take effect when a wallpaper is (re)launched.
      </p>

      <div className="mt-3 space-y-2">
        {BOOLEAN_FLAGS.map(({ key, label, hint }) => (
          <label key={key} className="flex cursor-pointer items-center gap-3" title={hint}>
            <Toggle on={!!flags[key]} onClick={() => saveFlags({ ...flags, [key]: !flags[key] })} />
            <span className="text-sm text-gray-300">{label}</span>
          </label>
        ))}
        <label className="flex items-center gap-3 text-sm text-gray-300">
          <span>Fullscreen apps</span>
          <select
            value={flags.fullscreenPause ?? 'default'}
            onChange={(e) => saveFlags({ ...flags, fullscreenPause: e.target.value as FullscreenPauseMode })}
            className="rounded-lg bg-white/5 px-2 py-1.5 text-sm text-gray-200 outline-none"
          >
            {FULLSCREEN_PAUSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-4 text-xs font-medium text-gray-400">Presets</p>
      <p className="mt-1 text-xs text-gray-600">
        Applying one copies its settings (and FPS limit, if it has one) into the settings above.
      </p>
      <div className="mt-2 space-y-1.5">
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-200">{preset.name}</p>
              <p className="truncate text-xs text-gray-500">{describePreset(preset)}</p>
            </div>
            <button
              onClick={() => applyPreset(preset)}
              className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500"
            >
              {appliedId === preset.id && <Check size={11} />}
              Apply
            </button>
            {!preset.builtIn && (
              <>
                <button
                  onClick={() => overwritePreset(preset)}
                  title="Replace with the current settings"
                  className="rounded p-1 text-gray-500 hover:text-gray-200"
                >
                  <Save size={13} />
                </button>
                <button
                  onClick={() => deletePreset(preset.id)}
                  title="Delete preset"
                  className="rounded p-1 text-gray-500 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createPreset()}
          placeholder="New preset from the current settings"
          className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={createPreset}
          disabled={!newName.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
        >
          <Plus size={14} />
          Save
        </button>
      </div>
    </div>
  )
}
