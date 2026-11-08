import { randomUUID } from 'crypto'
import type { Profile, ScreenAction, ScreenTarget } from '@shared/types'
import { openStore } from '../utils/safeStore'
import { getWallpaper } from './library.service'
import { getPlaybackStates } from './playlist-player.service'
import { getDisplayTargets } from './display.service'
import { getAssignments } from './wallpaper-state.service'

interface ProfileStore {
  profiles: Profile[]
}

const store = openStore<ProfileStore>({
  name: 'profiles',
  defaults: { profiles: [] }
})

export function getProfiles(): Profile[] {
  return store.get('profiles')
}

export function getProfile(id: string): Profile | undefined {
  return getProfiles().find((p) => p.id === id)
}

export function saveProfile(profile: Omit<Profile, 'id'> & { id?: string }): Profile {
  const saved: Profile = { ...profile, id: profile.id ?? randomUUID() }
  const profiles = getProfiles()
  const index = profiles.findIndex((p) => p.id === saved.id)
  if (index === -1) profiles.push(saved)
  else profiles[index] = saved
  store.set('profiles', profiles)
  return saved
}

export function deleteProfile(id: string): void {
  store.set('profiles', getProfiles().filter((p) => p.id !== id))
}

/** What a screen shows now: its playlist while one plays, else its wallpaper, else nothing */
export function currentScreenAction(screen: ScreenTarget): ScreenAction {
  const playing = getPlaybackStates().find((s) => s.screen === screen && s.playlistId && s.isPlaying)
  if (playing?.playlistId) return { type: 'playlist', playlistId: playing.playlistId }

  const assignments = getAssignments()
  const wallpaperId = assignments[screen] ?? assignments['*']
  if (wallpaperId && getWallpaper(wallpaperId)) return { type: 'wallpaper', wallpaperId }
  return { type: 'stop' }
}

export function captureScreens(screens: ScreenTarget[]): Record<ScreenTarget, ScreenAction> {
  return Object.fromEntries(screens.map((screen) => [screen, currentScreenAction(screen)]))
}

export function captureProfile(name: string): Profile {
  return saveProfile({ name, screens: captureScreens(getDisplayTargets()) })
}
