import type { EngineFlagPreset, EngineFlags } from './types'

export const BUILT_IN_PRESETS: EngineFlagPreset[] = [
  {
    id: 'builtin-battery',
    name: 'Battery saver',
    builtIn: true,
    fps: 30,
    flags: {
      disableParticles: true,
      disableMouse: true,
      noAudioProcessing: true,
      fullscreenPause: 'default',
      automute: true
    }
  },
  {
    id: 'builtin-quality',
    name: 'Full quality',
    builtIn: true,
    fps: null,
    flags: {
      disableParticles: false,
      disableMouse: false,
      disableAnimations: false,
      noAudioProcessing: false,
      fullscreenPause: 'default',
      automute: false,
      silent: false
    }
  },
  {
    id: 'builtin-always-on',
    name: 'Never pause',
    builtIn: true,
    flags: { fullscreenPause: 'off' }
  }
]

export function resolveEngineFlags(global: EngineFlags, wallpaper?: EngineFlags): EngineFlags {
  const resolved: EngineFlags = { ...global }
  for (const [key, value] of Object.entries(wallpaper ?? {})) {
    if (value !== undefined) (resolved as Record<string, unknown>)[key] = value
  }
  return resolved
}

export function engineFlagArgs(flags: EngineFlags): string[] {
  const args: string[] = []
  if (flags.disableParticles) args.push('--disable-particles')
  if (flags.disableMouse) args.push('--disable-mouse')
  if (flags.noAudioProcessing) args.push('--no-audio-processing')
  if (flags.fullscreenPause === 'off') args.push('--no-fullscreen-pause')
  if (flags.fullscreenPause === 'active-only') args.push('--fullscreen-pause-only-active')
  if (flags.automute) args.push('--automute')
  if (flags.silent) args.push('--silent')
  return args
}

export function hasEngineFlags(flags: EngineFlags | undefined): boolean {
  return !!flags && Object.values(flags).some((v) => v !== undefined)
}
