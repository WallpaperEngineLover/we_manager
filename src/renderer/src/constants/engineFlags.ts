import type { EngineFlags, FullscreenPauseMode } from '@shared/types'

type ChoiceFlag = 'postProcessing' | 'volumetrics' | 'shadows'
type BooleanFlag = Exclude<keyof EngineFlags, 'fullscreenPause' | ChoiceFlag>

export const BOOLEAN_FLAGS: { key: BooleanFlag; label: string; hint: string }[] = [
  { key: 'disableParticles', label: 'Disable particles', hint: 'Skips particle systems (fog, sparks, rain), usually the biggest GPU cost' },
  { key: 'disableAnimations', label: 'Freeze animations', hint: 'Stops scene time: scripts, particles, effects and puppets' },
  { key: 'disableMouse', label: 'Ignore the mouse', hint: 'No parallax or cursor effects' },
  { key: 'noAudioProcessing', label: 'No audio visualizer', hint: 'Stops capturing system audio for audio-reactive wallpapers' },
  { key: 'automute', label: 'Mute when other apps play sound', hint: '' },
  { key: 'silent', label: 'Always muted', hint: '' },
  {
    key: 'hdr',
    label: 'HDR output',
    hint: 'Sends HDR to monitors running in HDR mode (KDE Plasma with HDR enabled); HDR videos keep their highlights'
  }
]

export const FULLSCREEN_PAUSE_OPTIONS: { value: FullscreenPauseMode; label: string }[] = [
  { value: 'default', label: 'Pause behind fullscreen apps' },
  { value: 'active-only', label: 'Pause only for the focused fullscreen app' },
  { value: 'off', label: 'Never pause' }
]

const LIGHTING_QUALITY = [
  { value: 'disabled', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' }
]

/** Quality settings mirroring Wallpaper Engine's own, `fallback` is what the engine uses when none is given */
export const CHOICE_FLAGS: {
  key: ChoiceFlag
  label: string
  hint: string
  fallback: string
  options: { value: string; label: string }[]
}[] = [
  {
    key: 'postProcessing',
    label: 'Post processing',
    hint: 'Ultra renders scenes that enable HDR bloom in HDR, with a softer, wider glow',
    fallback: 'enabled',
    options: [
      { value: 'enabled', label: 'Enabled' },
      { value: 'ultra', label: 'Ultra' }
    ]
  },
  {
    key: 'volumetrics',
    label: 'Volumetric lighting',
    hint: 'Glow around lights that cast volumetrics; higher levels take more samples at a higher resolution',
    fallback: 'medium',
    options: LIGHTING_QUALITY
  },
  {
    key: 'shadows',
    label: 'Shadows',
    hint: 'Shadow quality; for now it only changes how finely shadow casting lights sample their volumetrics',
    fallback: 'medium',
    options: LIGHTING_QUALITY
  }
]
