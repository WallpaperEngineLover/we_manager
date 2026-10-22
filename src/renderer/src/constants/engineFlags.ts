import type { EngineFlagPreset, EngineFlags, FullscreenPauseMode } from '@shared/types'
import type { MessageKey } from '@shared/i18n'
import { t } from '../i18n'

type ChoiceFlag =
  | 'postProcessing'
  | 'volumetrics'
  | 'shadows'
  | 'msaa'
  | 'ssaa'
  | 'hwdec'
  | 'webFrames'
  | 'hrtf'
  | 'batteryFps'
  | 'idlePause'
// kdeBackgroundLayer, windowed and windowBackground are global only
type BooleanFlag = Exclude<
  keyof EngineFlags,
  'fullscreenPause' | 'kdeBackgroundLayer' | 'windowed' | 'windowBackground' | ChoiceFlag
>

export const BOOLEAN_FLAGS: { key: BooleanFlag; label: MessageKey; hint?: MessageKey }[] = [
  { key: 'disableParticles', label: 'flags.disableParticles.label', hint: 'flags.disableParticles.hint' },
  { key: 'disableAnimations', label: 'flags.disableAnimations.label', hint: 'flags.disableAnimations.hint' },
  { key: 'disableMouse', label: 'flags.disableMouse.label', hint: 'flags.disableMouse.hint' },
  {
    key: 'pauseOnFocus',
    label: 'flags.pauseOnFocus.label',
    hint: 'flags.pauseOnFocus.hint'
  },
  {
    key: 'pauseOnMaximized',
    label: 'flags.pauseOnMaximized.label',
    hint: 'flags.pauseOnMaximized.hint'
  },
  { key: 'noAudioProcessing', label: 'flags.noAudioProcessing.label', hint: 'flags.noAudioProcessing.hint' },
  { key: 'automute', label: 'flags.automute.label' },
  { key: 'silent', label: 'flags.silent.label' },
  {
    key: 'hdr',
    label: 'flags.hdr.label',
    hint: 'flags.hdr.hint'
  }
]

export const FULLSCREEN_PAUSE_OPTIONS: { value: FullscreenPauseMode; label: MessageKey }[] = [
  { value: 'default', label: 'flags.fullscreen.default' },
  { value: 'active-only', label: 'flags.fullscreen.activeOnly' },
  { value: 'off', label: 'flags.fullscreen.off' }
]

const LIGHTING_QUALITY = [
  { value: 'disabled', label: 'flags.opt.disabled' },
  { value: 'low', label: 'flags.opt.low' },
  { value: 'medium', label: 'flags.opt.medium' },
  { value: 'high', label: 'flags.opt.high' },
  { value: 'ultra', label: 'flags.opt.ultra' }
]

/** `fallback` is the engine's default */
export const CHOICE_FLAGS: {
  key: ChoiceFlag
  label: MessageKey
  hint: MessageKey
  note?: MessageKey
  warning?: MessageKey
  /** Shown per wallpaper for values other than `fallback` */
  wallpaperNote?: MessageKey
  fallback: string
  options: { value: string; label: string }[]
}[] = [
  {
    key: 'postProcessing',
    label: 'flags.postProcessing.label',
    hint: 'flags.postProcessing.hint',
    fallback: 'enabled',
    options: [
      { value: 'enabled', label: 'flags.opt.enabled' },
      { value: 'ultra', label: 'flags.opt.ultra' }
    ]
  },
  {
    key: 'volumetrics',
    label: 'flags.volumetrics.label',
    hint: 'flags.volumetrics.hint',
    fallback: 'medium',
    options: LIGHTING_QUALITY
  },
  {
    key: 'shadows',
    label: 'flags.shadows.label',
    hint: 'flags.shadows.hint',
    fallback: 'medium',
    options: LIGHTING_QUALITY
  },
  {
    key: 'msaa',
    label: 'flags.msaa.label',
    hint: 'flags.msaa.hint',
    fallback: 'none',
    options: [
      { value: 'none', label: 'flags.opt.none' },
      { value: 'x2', label: '2x' },
      { value: 'x4', label: '4x' },
      { value: 'x8', label: '8x' }
    ]
  },
  {
    key: 'ssaa',
    label: 'flags.ssaa.label',
    hint: 'flags.ssaa.hint',
    warning: 'flags.ssaa.warning',
    wallpaperNote: 'flags.ssaa.wallpaperNote',
    fallback: 'none',
    options: [
      { value: 'none', label: 'flags.opt.none' },
      { value: 'x2', label: '2x' },
      { value: 'x3', label: '3x' },
      { value: 'x4', label: '4x' }
    ]
  },
  {
    key: 'hwdec',
    label: 'flags.hwdec.label',
    hint: 'flags.hwdec.hint',
    note: 'flags.hwdec.note',
    fallback: 'auto',
    options: [
      { value: 'auto', label: 'flags.opt.auto' },
      { value: 'no', label: 'flags.opt.no' },
      { value: 'vaapi', label: 'VA-API' },
      { value: 'vaapi-copy', label: 'flags.opt.vaapiCopy' },
      { value: 'nvdec', label: 'NVDEC' },
      { value: 'nvdec-copy', label: 'flags.opt.nvdecCopy' },
      { value: 'vulkan', label: 'Vulkan' }
    ]
  },
  {
    key: 'webFrames',
    label: 'flags.webFrames.label',
    hint: 'flags.webFrames.hint',
    note: 'flags.webFrames.note',
    fallback: 'auto',
    options: [
      { value: 'auto', label: 'flags.opt.auto' },
      { value: 'dmabuf', label: 'flags.opt.webFramesDmabuf' },
      { value: 'shm', label: 'flags.opt.webFramesShm' }
    ]
  },
  {
    key: 'hrtf',
    label: 'flags.hrtf.label',
    hint: 'flags.hrtf.hint',
    note: 'flags.hrtf.note',
    fallback: 'auto',
    options: [
      { value: 'auto', label: 'flags.opt.auto' },
      { value: 'on', label: 'flags.opt.alwaysOn' },
      { value: 'off', label: 'flags.opt.disabled' }
    ]
  },
  {
    key: 'batteryFps',
    label: 'flags.batteryFps.label',
    hint: 'flags.batteryFps.hint',
    fallback: 'off',
    options: [
      { value: 'off', label: 'flags.batteryFps.same' },
      { value: '30', label: '30 FPS' },
      { value: '20', label: '20 FPS' },
      { value: '15', label: '15 FPS' },
      { value: '10', label: '10 FPS' },
      { value: 'pause', label: 'flags.opt.pause' }
    ]
  },
  {
    key: 'idlePause',
    label: 'flags.idlePause.label',
    hint: 'flags.idlePause.hint',
    fallback: 'off',
    options: [
      { value: 'off', label: 'flags.opt.disabled' },
      { value: '1', label: 'flags.opt.minutes1' },
      { value: '5', label: 'flags.opt.minutes5' },
      { value: '10', label: 'flags.opt.minutes10' },
      { value: '15', label: 'flags.opt.minutes15' },
      { value: '30', label: 'flags.opt.minutes30' }
    ]
  }
]

/** Message keys, except names like 2x or VA-API */

export function optionLabel(label: string): string {
  return label.startsWith('flags.') ? t(label as MessageKey) : label
}

const BUILT_IN_PRESET_NAMES: Record<string, MessageKey> = {
  'builtin-battery': 'presets.battery',
  'builtin-quality': 'presets.quality',
  'builtin-steam-deck': 'presets.steamDeck'
}

export function presetName(preset: EngineFlagPreset): string {
  const key = preset.builtIn ? BUILT_IN_PRESET_NAMES[preset.id] : undefined
  return key ? t(key) : preset.name
}
