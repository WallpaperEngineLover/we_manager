import { useState } from 'react'
import Toggle from '../common/Toggle'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Save, Trash2, TriangleAlert } from 'lucide-react'
import type { EngineFlagPreset, EngineFlags, FullscreenPauseMode } from '@shared/types'
import { isWlrootsStyle } from '@shared/desktop'
import { BOOLEAN_FLAGS, CHOICE_FLAGS, FULLSCREEN_PAUSE_OPTIONS, optionLabel, presetName } from '../../constants/engineFlags'
import { useConfig } from '../../hooks/queries'
import CopyField from '../common/CopyField'
import { t, tn, inSentence } from '../../i18n'

interface Props {
  defaultFps: number | null
  onDefaultFpsChanged: (fps: number | null) => void
}

function describePreset(preset: EngineFlagPreset): string {
  const parts = BOOLEAN_FLAGS.filter((f) => preset.flags[f.key]).map((f) => inSentence(t(f.label)))
  const pause = FULLSCREEN_PAUSE_OPTIONS.find((o) => o.value === preset.flags.fullscreenPause)
  if (pause && pause.value !== 'default') parts.push(inSentence(t(pause.label)))
  for (const { key, label, fallback, options } of CHOICE_FLAGS) {
    const value = preset.flags[key]
    const option = options.find((o) => o.value === value)
    if (value && value !== fallback && option) {
      parts.push(`${inSentence(t(label))} ${inSentence(optionLabel(option.label))}`)
    }
  }
  if (preset.fps) parts.push(`${preset.fps} FPS`)
  return parts.length ? parts.join(', ') : t('perf.everythingOn')
}

export default function PerformanceSettings({ defaultFps, onDefaultFpsChanged }: Props) {
  const queryClient = useQueryClient()
  const config = useConfig()
  const flags: EngineFlags = config?.engineFlags ?? {}
  const presets = config?.engineFlagPresets ?? []
  const { data: environment } = useQuery({
    queryKey: ['environment'],
    queryFn: () => window.electronAPI.wallpaper.detectEnvironment()
  })
  const desktopEnv = environment?.desktopEnv
  const wlroots = !!desktopEnv && isWlrootsStyle(desktopEnv)
  const { data: inputFiles = [] } = useQuery({
    queryKey: ['input-files'],
    queryFn: () => window.electronAPI.lwe.inputFiles(),
    enabled: wlroots
  })
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
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('perf.title')}</label>
      <p className="mt-1 text-xs text-gray-600">{t('perf.description')}</p>

      <div className="mt-3 space-y-2">
        {BOOLEAN_FLAGS.map(({ key, label, hint }) => (
          <label key={key} className="flex cursor-pointer items-center gap-3" title={hint && t(hint)}>
            <Toggle on={!!flags[key]} onClick={() => saveFlags({ ...flags, [key]: !flags[key] })} />
            <span className="text-sm text-gray-300">{t(label)}</span>
          </label>
        ))}
        {(desktopEnv === 'kde' || wlroots) && (
          <div>
            <label className="flex cursor-pointer items-center gap-3">
              <Toggle
                on={!!flags.kdeBackgroundLayer}
                onClick={() => saveFlags({ ...flags, kdeBackgroundLayer: !flags.kdeBackgroundLayer })}
              />
              <span className="text-sm text-gray-300">{t('perf.backgroundLayer')}</span>
            </label>
            <p className="ml-12 mt-1 text-xs text-gray-600">
              {t('perf.backgroundLayerHint')}
              {desktopEnv === 'kde' && <> {t('perf.backgroundLayerKde')}</>}
            </p>
          </div>
        )}
        {wlroots && inputFiles.length > 0 && (
          <div>
            <p className="text-sm text-gray-300">{t('perf.clickForwarding')}</p>
            <p className="mt-1 text-xs text-gray-600">
              {tn('perf.clickForwardingHint', { json: '{"leftDown":true}' })}
            </p>
            <div className="mt-2 space-y-1">
              {inputFiles.map((file) => (
                <CopyField key={file.screen} label={file.screen === '*' ? t('common.allScreens') : file.screen} text={file.path} />
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-3 text-sm text-gray-300">
          <span>{t('perf.fullscreenApps')}</span>
          <select
            value={flags.fullscreenPause ?? 'default'}
            onChange={(e) => saveFlags({ ...flags, fullscreenPause: e.target.value as FullscreenPauseMode })}
            className="rounded-lg bg-fg/5 px-2 py-1.5 text-sm text-gray-200 outline-none"
          >
            {FULLSCREEN_PAUSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.label)}
              </option>
            ))}
          </select>
        </label>
        {CHOICE_FLAGS.map(({ key, label, hint, note, warning, fallback, options }) => (
          <div key={key} className={note || warning ? '-mx-3 rounded-lg bg-fg/5 px-3 py-2' : undefined}>
            <label className="flex items-center gap-3 text-sm text-gray-300" title={t(hint)}>
              <span>{t(label)}</span>
              <select
                value={flags[key] ?? fallback}
                onChange={(e) => saveFlags({ ...flags, [key]: e.target.value })}
                className="rounded-lg bg-fg/5 px-2 py-1.5 text-sm text-gray-200 outline-none"
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {optionLabel(o.label)}
                  </option>
                ))}
              </select>
            </label>
            {note && <p className="mt-1.5 border-l-2 border-fg/10 pl-2 text-xs text-gray-500">{t(note)}</p>}
            {warning && (
              <p className="mt-1.5 flex gap-2 rounded-lg bg-amber-600/15 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
                <TriangleAlert size={13} className="mt-px shrink-0" />
                {t(warning)}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs font-medium text-gray-400">{t('perf.presets')}</p>
      <p className="mt-1 text-xs text-gray-600">{t('perf.presetsHint')}</p>
      <div className="mt-2 space-y-1.5">
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-200">{presetName(preset)}</p>
              <p className="truncate text-xs text-gray-500">{describePreset(preset)}</p>
            </div>
            <button
              onClick={() => applyPreset(preset)}
              className="flex items-center gap-1 rounded bg-accent-600 px-2 py-1 text-xs text-white hover:bg-accent-500"
            >
              {appliedId === preset.id && <Check size={11} />}
              {t('common.apply')}
            </button>
            {!preset.builtIn && (
              <>
                <button
                  onClick={() => overwritePreset(preset)}
                  title={t('perf.overwritePreset')}
                  className="rounded p-1 text-gray-500 hover:text-gray-200"
                >
                  <Save size={13} />
                </button>
                <button
                  onClick={() => deletePreset(preset.id)}
                  title={t('perf.deletePreset')}
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
          placeholder={t('perf.newPreset')}
          className="flex-1 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
        />
        <button
          onClick={createPreset}
          disabled={!newName.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-300 hover:bg-fg/10 disabled:opacity-50"
        >
          <Plus size={14} />
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}
