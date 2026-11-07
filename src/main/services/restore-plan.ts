export interface RestoreInput {
  skipped: boolean
  connected: boolean
  animated: boolean
  onDisk: boolean
  localPath: string
  running?: { split: boolean; wallpaperPath: string }
  /** The saved assignment is the first slot of a split that was showing */
  splitActive: boolean
  splitShowable: boolean
}

export type RestorePlan = 'skip' | 'split' | 'wait' | 'wallpaper'

export function planRestore(input: RestoreInput): RestorePlan {
  if (input.skipped || !input.connected) return 'skip'
  if (input.running?.split) return 'skip'
  if (input.splitActive && input.splitShowable) return 'split'
  if (!input.animated) return 'skip'
  if (input.running && input.running.wallpaperPath === input.localPath) return 'skip'
  if (!input.onDisk) return 'wait'
  return 'wallpaper'
}

export function playlistSkipScreens(skipResume: boolean, saved: readonly string[], active: readonly string[]): string[] {
  return skipResume ? [...saved] : [...active]
}

/** players nothing touched this session stay as saved */
export function mergePlayers<T>(
  saved: Readonly<Record<string, T>>,
  live: Readonly<Record<string, T>>,
  touched: readonly string[]
): Record<string, T> {
  const kept: Record<string, T> = {}

  for (const [screen, player] of Object.entries(saved)) {
    if (!touched.includes(screen)) kept[screen] = player
  }

  return { ...kept, ...live }
}

export function savedScreensFor(saved: readonly string[], screen?: string): string[] {
  return screen === undefined || screen === '*' ? [...saved] : saved.filter((name) => name === screen || name === '*')
}

export function mergeSkipScreens(...groups: readonly (readonly string[])[]): Set<string> {
  return new Set(groups.flat())
}

export function restoreSuperseded(
  assignedAtStart: string,
  assignedNow: string | undefined,
  useAtStart: number,
  useNow: number
): boolean {
  return assignedNow !== assignedAtStart || useNow !== useAtStart
}

export interface SplitTry {
  show: () => Promise<void>
  uses: () => number
  onError: (error: unknown) => void
}

// the try marks the screen once itself, a second mark means somebody else took it
export async function trySplit(attempt: SplitTry): Promise<'done' | 'left' | 'failed'> {
  const before = attempt.uses()

  try {
    await attempt.show()
    return 'done'
  } catch (error) {
    attempt.onError(error)
  }

  return attempt.uses() - before <= 1 ? 'failed' : 'left'
}
