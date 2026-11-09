export interface RestoreInput {
  skipped: boolean
  connected: boolean
  animated: boolean
  onDisk: boolean
  localPath: string
  running?: { split: boolean; wallpaperPath: string }
  /** First on-disk slot a split would show, or null when this screen has no showable split */
  splitSlotId: string | null
  wallpaperId: string
}

export type RestorePlan = 'skip' | 'split' | 'wallpaper'

/** What startup should do with one saved screen. A static image and a missing folder are skipped. */
export function planRestore(input: RestoreInput): RestorePlan {
  if (input.skipped || !input.connected) return 'skip'
  if (input.running?.split) return 'skip'
  if (input.splitSlotId !== null && input.splitSlotId === input.wallpaperId) return 'split'
  if (!input.animated || !input.onDisk) return 'skip'
  if (input.running && input.running.wallpaperPath === input.localPath) return 'skip'
  return 'wallpaper'
}

/** Don't-resume skips the saved playlist screens. Otherwise only screens that actually resumed. */
export function playlistSkipScreens(skipResume: boolean, saved: readonly string[], active: readonly string[]): string[] {
  return skipResume ? [...saved] : [...active]
}

export function mergeSkipScreens(...groups: readonly (readonly string[])[]): Set<string> {
  return new Set(groups.flat())
}

/** True when something else took the screen after restore read it. The newer launch stays. */
export function restoreSuperseded(
  assignedAtStart: string,
  assignedNow: string | undefined,
  useAtStart: number,
  useNow: number
): boolean {
  return assignedNow !== assignedAtStart || useNow !== useAtStart
}
