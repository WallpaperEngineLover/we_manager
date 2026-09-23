import type { CompatStatus, WallpaperCompat } from './types'

export function compatStatus(compat: WallpaperCompat | undefined): CompatStatus {
  if (!compat) return 'ok'
  if (compat.freshLaunch === 'crash') return 'crashes'
  if (compat.hotswapCrash) return compat.freshLaunch === 'ok' ? 'hotswap-only' : 'hotswap-untested'
  if (compat.runtimeCrashes) return 'unstable'
  return 'ok'
}

/** Hot-swapping into it crashed the engine but a fresh launch was fine, so always launch it fresh */
export function needsFreshLaunch(compat: WallpaperCompat | undefined): boolean {
  return !!compat?.hotswapCrash
}

export const COMPAT_LABELS: Record<CompatStatus, string> = {
  ok: 'No known problems',
  crashes: 'Crashes on launch',
  'hotswap-only': 'Crashes when switched to, works on a fresh launch',
  'hotswap-untested': 'Crashed when switched to',
  unstable: 'Crashed while running'
}
