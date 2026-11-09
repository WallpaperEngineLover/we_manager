import { useEffect, useRef, useState } from 'react'
import {
  CRF_MAX,
  CRF_MIN,
  ENCODER_LABELS,
  ENCODER_RANKING,
  FPS_MAX,
  FPS_TARGETS,
  normalizeFps,
  SCALE_TARGETS,
  TRIM_MODES,
  type HevcEncoder,
  type ScaleMode,
  type ScaleTarget,
  type TrimMode,
  type VideoToolSettings
} from '@shared/video-tools'
import SettingsCard from './SettingsCard'
import Toggle from '../common/Toggle'
import { inputClass } from '../common/inputClass'
import { t } from '../../i18n'

export default function VideoDefaultsSettings() {
  const [settings, setSettings] = useState<VideoToolSettings | null>(null)
  const latest = useRef<VideoToolSettings | null>(null)
  const sent = useRef(0)
  const [fpsCustom, setFpsCustom] = useState(false)
  const [fpsText, setFpsText] = useState('')

  useEffect(() => {
    void window.electronAPI.videoTools
      .getSettings()
      .then((value) => {
        latest.current = value
        setSettings(value)
        if (value.maxFps && !FPS_TARGETS.includes(value.maxFps)) {
          setFpsCustom(true)
          setFpsText(String(value.maxFps))
        }
      })
      .catch(console.error)
  }, [])

  function change(patch: Partial<VideoToolSettings>) {
    if (!latest.current) return
    const next = { ...latest.current, ...patch }
    latest.current = next
    setSettings(next)
    const mine = ++sent.current
    void window.electronAPI.videoTools
      .setSettings(next)
      .then((saved) => {
        if (mine !== sent.current) return
        latest.current = saved
        setSettings(saved)
      })
      .catch(console.error)
  }

  if (!settings) return null

  return (
    <SettingsCard title={t('videoDefaults.title')} hint={t('videoDefaults.hint')}>
      <div>
        <label className="flex cursor-pointer items-center gap-3">
          <Toggle on={settings.backupOriginal} onClick={() => { change({ backupOriginal: !settings.backupOriginal }) }} />
          <span className="text-sm text-gray-300">{t('videoDefaults.backup')}</span>
        </label>
        <p className="mt-1 pl-12 text-xs text-gray-600">{t('videoDefaults.backupHint')}</p>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-300">
        <span>{t('optimize.encoder')}</span>
        <select value={settings.encoder} onChange={(e) => { change({ encoder: e.target.value as HevcEncoder | 'auto' }) }} className={inputClass}>
          <option value="auto">{t('optimize.auto')}</option>
          {ENCODER_RANKING.map((encoder) => <option key={encoder} value={encoder}>{ENCODER_LABELS[encoder]}</option>)}
        </select>
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span>{t('optimize.quality')}</span>
          <input
            type="range"
            min={CRF_MIN}
            max={CRF_MAX}
            step={1}
            value={settings.crf}
            onChange={(e) => { change({ crf: Number(e.target.value) }) }}
            className="w-40"
          />
          <span className="w-6 text-right tabular-nums">{settings.crf}</span>
        </div>
        <p className="mt-1 text-xs text-gray-600">{t('optimize.qualityHint', { min: CRF_MIN, max: CRF_MAX })}</p>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
          <span>{t('videoDefaults.scaleTo')}</span>
          <select value={settings.scaleTo} onChange={(e) => { change({ scaleTo: e.target.value as ScaleTarget }) }} className={inputClass}>
            <option value="none">{t('videoDefaults.scaleNone')}</option>
            {(Object.keys(SCALE_TARGETS) as Exclude<ScaleTarget, 'none'>[]).map((key) => (
              <option key={key} value={key}>{`${SCALE_TARGETS[key].label} (${t('optimize.dimensions', { width: SCALE_TARGETS[key].width, height: SCALE_TARGETS[key].height })})`}</option>
            ))}
          </select>
          {settings.scaleTo !== 'none' && (
            <span className="flex gap-3 text-xs">
              {(['fit', 'fill'] as ScaleMode[]).map((mode) => (
                <label key={mode} className="flex items-center gap-1.5">
                  <input type="radio" checked={settings.scaleMode === mode} onChange={() => { change({ scaleMode: mode }) }} />
                  {t(mode === 'fit' ? 'optimize.fit' : 'optimize.fill')}
                </label>
              ))}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-600">{t('videoDefaults.scaleHint')}</p>
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span>{t('videoDefaults.fps')}</span>
          <select
            value={fpsCustom ? 'custom' : settings.maxFps}
            onChange={(e) => {
              const custom = e.target.value === 'custom'
              setFpsCustom(custom)
              if (custom) {
                setFpsText(String(settings.maxFps || 30))
                change({ maxFps: settings.maxFps || 30 })
              } else {
                change({ maxFps: Number(e.target.value) })
              }
            }}
            className={inputClass}
          >
            <option value={0}>{t('videoDefaults.fpsNone')}</option>
            {FPS_TARGETS.map((n) => <option key={n} value={n}>{t('optimize.fpsValue', { fps: n })}</option>)}
            <option value="custom">{t('optimize.custom')}</option>
          </select>
          {fpsCustom && (
            <span className="flex items-center gap-1">
              <input
                value={fpsText}
                onChange={(e) => {
                  const text = e.target.value.replace(/\D/g, '').slice(0, 3)
                  setFpsText(text)
                  const n = normalizeFps(Number(text))
                  if (n) change({ maxFps: n })
                }}
                className={`${inputClass} w-16`}
              />
              {t('optimize.fpsUnit')}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-600">{t('videoDefaults.fpsHint')}</p>
        {fpsCustom && !normalizeFps(Number(fpsText)) && <p className="mt-1 text-xs text-red-400">{t('videoDefaults.fpsInvalid', { max: FPS_MAX })}</p>}
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span>{t('videoDefaults.trim')}</span>
          <select value={settings.trimMode} onChange={(e) => { change({ trimMode: e.target.value as TrimMode }) }} className={inputClass}>
            {TRIM_MODES.map((mode) => <option key={mode} value={mode}>{t(`videoDefaults.trim.${mode}`)}</option>)}
          </select>
        </div>
        <p className="mt-1 text-xs text-gray-600">{t('videoDefaults.trimHint')}</p>
      </div>
    </SettingsCard>
  )
}
