import type { Profile, ScheduleAction, ScreenAction, ScreenTarget } from '@shared/types'
import { getWallpaper, updateWallpaper } from './library.service'
import { getPlaylist } from './playlist.service'
import { expandScreen, getDisplayTargets, isShownOn, showWallpaper, stopDisplay } from './display.service'
import { startPlaylist, stopPlaylist } from './playlist-player.service'
import { getProfile } from './profile.service'
import { t } from '../i18n'

const runningWallpapers = new Map<string, number>()

/** Wallpapers a rule is in the middle of starting, so they are not optimized or deleted under it */
export function runningWallpaperIds(): string[] {
  return [...runningWallpapers.keys()]
}

export async function runScreenAction(action: ScreenAction, screen: ScreenTarget): Promise<void> {
  if (action.type === 'wallpaper') {
    const wallpaper = getWallpaper(action.wallpaperId)
    if (!wallpaper) throw new Error(t('rules.wallpaperGone'))
    for (const s of expandScreen(screen)) stopPlaylist(s)
    runningWallpapers.set(wallpaper.id, (runningWallpapers.get(wallpaper.id) ?? 0) + 1)
    try {
      await showWallpaper(wallpaper, screen, { dependencyPrompt: 'once' })
    } finally {
      const left = (runningWallpapers.get(wallpaper.id) ?? 1) - 1
      if (left > 0) runningWallpapers.set(wallpaper.id, left)
      else runningWallpapers.delete(wallpaper.id)
    }
    if (isShownOn(wallpaper.id, screen)) {
      updateWallpaper(wallpaper.id, { appliedCount: (wallpaper.appliedCount ?? 0) + 1, lastAppliedAt: Date.now() })
    }
  } else if (action.type === 'playlist') {
    if (!getPlaylist(action.playlistId)) throw new Error(t('rules.playlistGone'))
    startPlaylist(action.playlistId, screen)
  } else {
    stopPlaylist(screen)
    await stopDisplay(screen)
  }
}

/**
 * What a profile does on the screens there are now: a '*' entry goes first so an entry for one screen can follow it.
 * A profile from the other display mode or with a monitor that is gone is not lost: entries for screens that are
 * not there are skipped, and in shared mode (one '*' target) the first of them stands in for all screens
 */
function profileEntries(profile: Profile): [ScreenTarget, ScreenAction][] {
  const targets = getDisplayTargets()
  const entries = Object.entries(profile.screens)
  const known = entries.filter(([screen]) => screen === '*' || targets.includes(screen))
  if (known.length === 0 && targets.includes('*') && entries.length > 0) known.push(['*', entries[0][1]])
  return known.sort(([a], [b]) => Number(b === '*') - Number(a === '*'))
}

/** The screens an action touches: a profile names its own, anything else the screen of the rule */
export function actionScreens(action: ScheduleAction, screen: ScreenTarget): ScreenTarget[] {
  if (action.type !== 'profile') return expandScreen(screen)
  const profile = getProfile(action.profileId)
  return profile ? profileEntries(profile).flatMap(([s]) => expandScreen(s)) : []
}

export async function applyProfile(profileId: string): Promise<void> {
  const profile = getProfile(profileId)
  if (!profile) throw new Error(t('profiles.gone'))

  const failed: string[] = []
  for (const [screen, action] of profileEntries(profile)) {
    await runScreenAction(action, screen).catch((err: unknown) => {
      console.error(`[Profile] "${profile.name}" failed on ${screen}:`, err)
      failed.push(screen)
    })
  }
  if (failed.length > 0) throw new Error(t('profiles.failedOn', { name: profile.name, screens: failed.join(', ') }))
}

export async function runAction(action: ScheduleAction, screen: ScreenTarget): Promise<void> {
  if (action.type === 'profile') await applyProfile(action.profileId)
  else await runScreenAction(action, screen)
}
