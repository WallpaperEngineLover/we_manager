import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Monitor, Moon, MousePointer2, Play, RotateCcw, Sun } from 'lucide-react'
import clsx from 'clsx'
import {
  ACCENT_PRESETS,
  MIN_WINDOW_OPACITY,
  type Appearance,
  type PreviewAnimation,
  type ThemeMode
} from '@shared/appearance'
import Toggle from '../common/Toggle'
import { useConfig } from '../../hooks/queries'
import { applyAppearance } from '../../utils/appearance'
import { t, translatedOr } from '../../i18n'
import type { MessageKey } from '@shared/i18n'
import LanguageSelect from './LanguageSelect'

const THEMES: { value: ThemeMode; label: MessageKey; icon: typeof Moon }[] = [
  { value: 'dark', label: 'appearance.dark', icon: Moon },
  { value: 'light', label: 'appearance.light', icon: Sun },
  { value: 'system', label: 'appearance.system', icon: Monitor }
]

const PREVIEW_ANIMATION: { value: PreviewAnimation; label: MessageKey; icon: typeof Moon }[] = [
  { value: 'always', label: 'appearance.always', icon: Play },
  { value: 'hover', label: 'appearance.onHover', icon: MousePointer2 }
]

function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { value: T; label: MessageKey; icon: typeof Moon }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-xl bg-fg/5 p-1 ring-1 ring-fg/5">
      {options.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={clsx(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all',
            value === option ? 'bg-card text-gray-100 shadow-sm ring-1 ring-fg/10' : 'text-gray-400 hover:text-gray-200'
          )}
        >
          <Icon size={14} />
          {t(label)}
        </button>
      ))}
    </div>
  )
}

function swatch(hue: number, chroma: number): string {
  return `oklch(58.5% ${0.233 * chroma} ${hue})`
}

export default function AppearanceSettings() {
  const queryClient = useQueryClient()
  const config = useConfig()
  const [edited, setDraft] = useState<Appearance | null>(null)

  if (!config) return null
  const draft = edited ?? config.appearance

  // save on release
  function preview(patch: Partial<Appearance>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    applyAppearance(next, config!.windowTranslucent)
  }

  async function save(patch: Partial<Appearance>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    applyAppearance(next, config!.windowTranslucent)
    await window.electronAPI.config.setAppearance(next)
    queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  const isKde = config.desktopEnv === 'kde'
  const translucent = draft.windowOpacity < 100
  const presetMatch = ACCENT_PRESETS.find((p) => p.hue === draft.accentHue && p.chroma === draft.accentChroma)

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('appearance.title')}</label>

      <div className="mt-3">
        <LanguageSelect />
      </div>

      <div className="mt-3">
        <Segmented options={THEMES} value={draft.theme} onChange={(theme) => save({ theme })} />
      </div>

      <div className="mt-5">
        <span className="block text-xs text-gray-400">{t('appearance.accent')}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((p) => {
            const active = presetMatch === p
            return (
              <button
                key={p.name}
                title={translatedOr(`accent.${p.name}`, p.name)}
                onClick={() => save({ accentHue: p.hue, accentChroma: p.chroma })}
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-app transition-transform hover:scale-110',
                  active && 'ring-2 ring-fg/60'
                )}
                style={{ background: swatch(p.hue, p.chroma) }}
              >
                {active && <Check size={14} />}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-gray-500">{t('thumb.custom')}</span>
          <input
            type="range"
            min={0}
            max={360}
            value={draft.accentHue}
            onChange={(e) => preview({ accentHue: Number(e.target.value), accentChroma: draft.accentChroma || 1 })}
            onPointerUp={() => save({})}
            onKeyUp={() => save({})}
            className="hue-slider h-2 w-full cursor-pointer appearance-none rounded-full"
            aria-label={t('appearance.accentHue')}
          />
        </div>
      </div>

      <div className="mt-5">
        <span className="block text-xs text-gray-400">{t('appearance.animatedPreviews')}</span>
        <div className="mt-2">
          <Segmented
            options={PREVIEW_ANIMATION}
            value={draft.previewAnimation}
            onChange={(previewAnimation) => save({ previewAnimation })}
          />
        </div>
        <p className="mt-1 text-xs text-gray-600">
          {t('appearance.animatedPreviewsHint')}
        </p>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{t('appearance.opacity')}</span>
          <span className="text-xs tabular-nums text-gray-500">{draft.windowOpacity}%</span>
        </div>
        <input
          type="range"
          min={MIN_WINDOW_OPACITY}
          max={100}
          value={draft.windowOpacity}
          onChange={(e) => preview({ windowOpacity: Number(e.target.value) })}
          onPointerUp={() => save({})}
          onKeyUp={() => save({})}
          className="mt-2 w-full accent-accent-500"
          aria-label={t('appearance.opacity')}
        />
        <p className="mt-1 text-xs text-gray-600">
          {t('appearance.opacityHint')}
        </p>
      </div>

      <label className={clsx('mt-4 flex items-center gap-3', isKde && translucent ? 'cursor-pointer' : 'cursor-default')}>
        <Toggle
          on={draft.blur && isKde}
          onClick={() => save({ blur: !draft.blur })}
          disabled={!isKde || !translucent}
        />
        <span className="text-sm text-gray-300">{t('appearance.blur')}</span>
      </label>
      <p className="mt-1 text-xs text-gray-600">
        {isKde
          ? t('appearance.blurKde')
          : t('appearance.blurKdeOnly')}
      </p>

      {config.appearanceRestartNeeded && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-600/15 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
          <RotateCcw size={13} className="shrink-0" />
          {config.trayEnabled ? t('appearance.restartTray') : t('appearance.restart')}
        </p>
      )}
    </div>
  )
}
