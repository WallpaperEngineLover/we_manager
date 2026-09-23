import Store from 'electron-store'
import type { ScreenTarget } from '@shared/types'

interface StoreSchema {
  /** Written by older versions, read once as the '*' assignment */
  activeWallpaperId?: string
  assignments?: Record<ScreenTarget, string>
}

const store = new Store<StoreSchema>()

export function getAssignments(): Record<ScreenTarget, string> {
  const assignments = store.get('assignments')
  if (assignments) return assignments
  const legacy = store.get('activeWallpaperId')
  return legacy ? { '*': legacy } : {}
}

export function setAssignment(screen: ScreenTarget, wallpaperId: string): void {
  const next = screen === '*' ? {} : { ...getAssignments() }
  if (screen !== '*') delete next['*']
  next[screen] = wallpaperId
  store.set('assignments', next)
}

export function clearAssignment(screen?: ScreenTarget): void {
  if (screen === undefined) {
    store.set('assignments', {})
    return
  }
  const next = { ...getAssignments() }
  delete next[screen]
  store.set('assignments', next)
}

/** The wallpaper on the first screen, for callers that only care about one */
export function getActiveWallpaperId(): string | undefined {
  return Object.values(getAssignments())[0]
}
