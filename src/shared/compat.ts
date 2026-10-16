import type { CompatStatus, WallpaperCompat } from './types'
import type { MessageKey } from './i18n'

export function compatStatus(compat: WallpaperCompat | undefined): CompatStatus {
  if (!compat) return 'ok'
  if (compat.freshLaunch === 'crash') return 'crashes'
  if (compat.hotswapCrash) return compat.freshLaunch === 'ok' ? 'hotswap-only' : 'hotswap-untested'
  if (compat.runtimeCrashes) return 'unstable'
  return 'ok'
}

/** Hotswap crashed but a fresh launch worked */

export function needsFreshLaunch(compat: WallpaperCompat | undefined): boolean {
  return !!compat?.hotswapCrash
}

export const COMPAT_LABELS: Record<CompatStatus, MessageKey> = {
  ok: 'compat.ok',
  crashes: 'compat.crashes',
  'hotswap-only': 'compat.hotswapOnly',
  'hotswap-untested': 'compat.hotswapUntested',
  unstable: 'compat.unstable'
}
