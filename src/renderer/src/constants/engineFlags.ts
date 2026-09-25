import type { EngineFlags, FullscreenPauseMode } from '@shared/types'

type BooleanFlag = Exclude<keyof EngineFlags, 'fullscreenPause'>

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
