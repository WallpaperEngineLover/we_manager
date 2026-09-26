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
      automute: true,
      volumetrics: 'disabled',
      shadows: 'disabled'
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
      silent: false,
      postProcessing: 'ultra',
      volumetrics: 'ultra',
      shadows: 'ultra'
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
  if (flags.hdr) args.push('--hdr')
  // the engine's defaults are left out so they don't count as a different launch
  if (flags.postProcessing && flags.postProcessing !== 'enabled') args.push('--post-processing', flags.postProcessing)
  if (flags.volumetrics && flags.volumetrics !== 'medium') args.push('--volumetrics', flags.volumetrics)
  if (flags.shadows && flags.shadows !== 'medium') args.push('--shadows', flags.shadows)
  return args
}

/** Drops options the engine doesn't know, together with their values */
export function filterSupportedArgs(args: string[], supports: (flag: string) => boolean): string[] {
  const kept: string[] = []
  let keep = false
  for (const arg of args) {
    if (arg.startsWith('--')) keep = supports(arg)
    if (keep) kept.push(arg)
  }
  return kept
}

export function hasEngineFlags(flags: EngineFlags | undefined): boolean {
  return !!flags && Object.values(flags).some((v) => v !== undefined)
}
