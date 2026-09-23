import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  CrashEvent,
  CrashPhase,
  ScreenAssignment,
  ScreenTarget,
  WallpaperBackend,
  WallpaperCompat,
  WallpaperMeta
} from '@shared/types'
import { getAllWallpapers, getWallpaper, updateWallpaper } from './library.service'
import { applyWallpaperMeta } from './wallpaper.service'
import { ALL_SCREENS, getRunningInstances, onLweExit, stopLwe, type LweExitInfo } from './lwe.service'
import { clearAssignment, getAssignments, setAssignment } from './wallpaper-state.service'
import { getDisplayMode } from './config.service'
import { getConnectedScreens } from '../utils/platform'

// how long a fresh launch has to survive before it counts as working
const LAUNCH_CHECK_MS = 20_000
// automatic relaunches after a runtime crash, at most one per screen in this window
const RELAUNCH_COOLDOWN_MS = 60_000

let win: BrowserWindow | null = null
const lastAutoRelaunch = new Map<ScreenTarget, number>()
const launchChecks = new Map<ScreenTarget, ReturnType<typeof setTimeout>>()
let playlistRecovery: ((screen: ScreenTarget, wallpaperId: string) => boolean) | null = null

function send(channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function getDisplayTargets(): ScreenTarget[] {
  if (getDisplayMode() === 'shared') return [ALL_SCREENS]
  const screens = getConnectedScreens()
  return screens.length > 0 ? screens : [ALL_SCREENS]
}

/** '*' (or nothing) means every screen: one engine in shared mode, one per screen otherwise */
export function expandScreen(screen?: ScreenTarget): ScreenTarget[] {
  const targets = getDisplayTargets()
  if (screen === undefined || screen === ALL_SCREENS) return targets
  return targets.includes(screen) ? [screen] : []
}

export function getScreenAssignments(): ScreenAssignment[] {
  return Object.entries(getAssignments()).map(([screen, wallpaperId]) => ({ screen, wallpaperId }))
}

/** The playlist player takes over after a crash on a screen it plays on, instead of a relaunch */
export function setPlaylistRecovery(handler: (screen: ScreenTarget, wallpaperId: string) => boolean): void {
  playlistRecovery = handler
}

function patchCompat(wallpaper: WallpaperMeta, patch: Partial<WallpaperCompat>): void {
  updateWallpaper(wallpaper.id, { compat: { ...wallpaper.compat, ...patch } })
  send(IpcChannels.EVENT_LIBRARY_CHANGED)
}

function watchLaunch(wallpaperId: string, screen: ScreenTarget, onSurvived?: () => void): void {
  clearTimeout(launchChecks.get(screen))
  launchChecks.set(
    screen,
    setTimeout(() => {
      launchChecks.delete(screen)
      const wallpaper = getWallpaper(wallpaperId)
      const inst = getRunningInstances().find((i) => i.screen === screen)
      if (!wallpaper || !inst || inst.wallpaperPath !== wallpaper.localPath || inst.swappedAt !== null) return
      if (wallpaper.compat?.freshLaunch !== 'ok') patchCompat(wallpaper, { freshLaunch: 'ok' })
      onSurvived?.()
    }, LAUNCH_CHECK_MS)
  )
}

export async function showWallpaper(
  wallpaper: WallpaperMeta,
  screen: ScreenTarget | undefined,
  options: {
    volume?: number
    backend?: WallpaperBackend
    dependencyPrompt?: 'always' | 'once'
    forceFresh?: boolean
  } = {}
): Promise<string> {
  const targets = expandScreen(screen)
  if (targets.length === 0) throw new Error(`Screen ${screen} is not connected`)

  let appliedPath = ''
  for (const target of targets) {
    appliedPath = await applyWallpaperMeta(wallpaper, { ...options, screen: target })
    setAssignment(target, wallpaper.id)
    // only a wallpaper that crashed on launch before needs its fresh launches watched
    if (wallpaper.compat?.freshLaunch === 'crash') watchLaunch(wallpaper.id, target)
  }
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
  return appliedPath
}

export async function stopDisplay(screen?: ScreenTarget): Promise<void> {
  if (screen === undefined || screen === ALL_SCREENS) {
    await stopLwe()
    clearAssignment()
  } else {
    await stopLwe(screen)
    clearAssignment(screen)
  }
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
}

function wallpaperForPath(wallpaperPath: string): WallpaperMeta | undefined {
  if (!wallpaperPath) return undefined
  return getAllWallpapers().find((w) => w.localPath === wallpaperPath)
}

function notifyCrash(wallpaper: WallpaperMeta, screen: ScreenTarget, phase: CrashPhase, outcome: string): void {
  const event: CrashEvent = { wallpaperId: wallpaper.id, title: wallpaper.title, screen, phase, outcome }
  send(IpcChannels.EVENT_WALLPAPER_CRASHED, event)
}

async function relaunchFresh(wallpaper: WallpaperMeta, screen: ScreenTarget): Promise<boolean> {
  try {
    await applyWallpaperMeta(getWallpaper(wallpaper.id) ?? wallpaper, { screen, forceFresh: true, dependencyPrompt: 'once' })
    return true
  } catch (err) {
    console.error('[Display] Fresh relaunch failed:', (err as Error).message)
    return false
  }
}

async function handleExit(info: LweExitInfo): Promise<void> {
  const wallpaper = wallpaperForPath(info.wallpaperPath)
  if (!info.crashed || !wallpaper) {
    if (!info.crashed) clearAssignment(info.screen === ALL_SCREENS ? undefined : info.screen)
    send(IpcChannels.EVENT_DISPLAY_CHANGED)
    return
  }

  console.warn(`[Display] ${wallpaper.title} crashed on ${info.screen} (${info.phase}, ${info.description})`)
  const crash = { at: Date.now(), phase: info.phase, screen: info.screen, log: info.log.slice(-30) }
  clearTimeout(launchChecks.get(info.screen))
  launchChecks.delete(info.screen)

  if (info.phase === 'hotswap') {
    patchCompat(wallpaper, { hotswapCrash: true, lastCrash: crash })
    // the user still wants this wallpaper, and a fresh launch tells whether only the hotswap is the problem
    if (!(await relaunchFresh(wallpaper, info.screen))) return
    notifyCrash(wallpaper, info.screen, 'hotswap', 'Crashed when switched to - testing a fresh launch')
    watchLaunch(wallpaper.id, info.screen, () =>
      notifyCrash(wallpaper, info.screen, 'hotswap', 'Works on a fresh launch, it will always be launched fresh from now on')
    )
    return
  }

  if (info.phase === 'launch') {
    patchCompat(wallpaper, { freshLaunch: 'crash', lastCrash: crash })
    clearAssignment(info.screen === ALL_SCREENS ? undefined : info.screen)
    const skipped = playlistRecovery?.(info.screen, wallpaper.id) ?? false
    notifyCrash(wallpaper, info.screen, 'launch', skipped ? 'Crashes on launch - skipped to the next wallpaper' : 'Crashes on launch')
    send(IpcChannels.EVENT_DISPLAY_CHANGED)
    return
  }

  patchCompat(wallpaper, { runtimeCrashes: (wallpaper.compat?.runtimeCrashes ?? 0) + 1, lastCrash: crash })
  if (playlistRecovery?.(info.screen, wallpaper.id)) {
    notifyCrash(wallpaper, info.screen, 'runtime', 'Crashed while running - skipped to the next wallpaper')
    return
  }
  const last = lastAutoRelaunch.get(info.screen) ?? 0
  if (Date.now() - last > RELAUNCH_COOLDOWN_MS) {
    lastAutoRelaunch.set(info.screen, Date.now())
    if (await relaunchFresh(wallpaper, info.screen)) {
      notifyCrash(wallpaper, info.screen, 'runtime', 'Crashed while running - restarted it')
      return
    }
  }
  clearAssignment(info.screen === ALL_SCREENS ? undefined : info.screen)
  notifyCrash(wallpaper, info.screen, 'runtime', 'Crashed while running')
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
}

export async function testFreshLaunch(wallpaperId: string, screen?: ScreenTarget): Promise<void> {
  const wallpaper = getWallpaper(wallpaperId)
  if (!wallpaper) throw new Error(`Wallpaper ${wallpaperId} not found in library`)
  const target = expandScreen(screen)[0]
  if (!target) throw new Error('No screen to test on')
  await applyWallpaperMeta(wallpaper, { screen: target, forceFresh: true })
  setAssignment(target, wallpaper.id)
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
  watchLaunch(wallpaper.id, target, () =>
    notifyCrash(getWallpaper(wallpaper.id) ?? wallpaper, target, 'launch', 'Fresh launch test passed')
  )
}

/** Stops everything and forgets assignments, the screens mean something else after a mode switch */
export async function resetDisplays(): Promise<void> {
  for (const timer of launchChecks.values()) clearTimeout(timer)
  launchChecks.clear()
  await stopDisplay()
}

export function initDisplay(window: BrowserWindow): void {
  win = window
  onLweExit((info) => {
    void handleExit(info).catch((err) => console.error('[Display] Crash handling failed:', err))
  })
}
