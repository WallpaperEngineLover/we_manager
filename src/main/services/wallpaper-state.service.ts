import { openStore } from '../utils/safeStore'
import type { ScreenTarget } from '@shared/types'

interface StoreSchema {
  /** Written by older versions, read once as the '*' assignment */
  activeWallpaperId?: string
  assignments?: Record<ScreenTarget, string>
  splitActive?: Record<ScreenTarget, boolean>
}

const store = openStore<StoreSchema>()

export function getAssignments(): Record<ScreenTarget, string> {
  const assignments = store.get('assignments')
  if (assignments) return assignments
  const legacy = store.get('activeWallpaperId')
  return legacy ? { '*': legacy } : {}
}

function dropSplit(screen?: ScreenTarget): void {
  const current = store.get('splitActive') ?? {}

  if (screen === undefined) {
    if (Object.keys(current).length > 0) store.set('splitActive', {})
    return
  }

  if (!(screen in current)) return

  const next = { ...current }
  delete next[screen]
  store.set('splitActive', next)
}

export function setAssignment(screen: ScreenTarget, wallpaperId: string): void {
  const next = screen === '*' ? {} : { ...getAssignments() }
  if (screen !== '*') delete next['*']
  next[screen] = wallpaperId
  store.set('assignments', next)
  dropSplit(screen === '*' ? undefined : screen)
}

export function clearAssignment(screen?: ScreenTarget): void {
  if (screen === undefined) {
    store.set('assignments', {})
  } else {
    const next = { ...getAssignments() }
    delete next[screen]
    store.set('assignments', next)
  }
  dropSplit(screen)
}

export function markSplitActive(screen: ScreenTarget): void {
  store.set('splitActive', { ...store.get('splitActive'), [screen]: true })
}

export function splitActiveScreens(): ScreenTarget[] {
  return Object.keys(store.get('splitActive') ?? {})
}

export function isSplitActive(screen: ScreenTarget): boolean {
  return store.get('splitActive')?.[screen] === true
}

/** The wallpaper on the first screen, for callers that only care about one */
export function getActiveWallpaperId(): string | undefined {
  return Object.values(getAssignments())[0]
}
