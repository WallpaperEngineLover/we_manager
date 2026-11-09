import type { BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  CrashEvent,
  CrashPhase,
  EngineFlags,
  ScreenAssignment,
  ScreenTarget,
  WallpaperBackend,
  WallpaperCompat,
  WallpaperMeta
} from '@shared/types'
import { getAllWallpapers, getWallpaper, updateWallpaper } from './library.service'
import { applyWallpaperMeta, isAnimatedWallpaper } from './wallpaper.service'
import {
  ALL_SCREENS,
  getActiveScreens,
  getLweStatus,
  getRunningInstances,
  hotswapLweSettings,
  launchLweAsync,
  liveEngineFlagOptions,
  onLweExit,
  stopLwe,
  supportsSplitScreens,
  type LweExitInfo,
  type LweSplitSlot
} from './lwe.service'
import { resolveEngineFlags } from '@shared/engineFlags'
import { clearAssignment, getAssignments, setAssignment } from './wallpaper-state.service'
import { getDefaultFps, getDisplayMode, getGlobalEngineFlags, getSplitScreens, setSplitScreen } from './config.service'
import { planRestore, restoreSuperseded } from './restore-plan'
import { ensureDependencyInstalled } from './dependency.service'
import { t } from '../i18n'

const LAUNCH_CHECK_MS = 20_000
// bumped when a screen is launched or stopped, so a later restore does not replace that
const screenUse = new Map<string, number>()

function markScreenUsed(screen: ScreenTarget): void {
  screenUse.set(screen, (screenUse.get(screen) ?? 0) + 1)
}

function screenUseCount(screen: ScreenTarget): number {
  return screenUse.get(screen) ?? 0
}
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
  const screens = getActiveScreens()
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

const busySources = new Map<string, () => string[]>()

export function setBusyWallpaperSource(name: string, source: () => string[]): void {
  busySources.set(name, source)
}

export function getWallpapersInUse(): Set<string> {
  const ids = new Set(getScreenAssignments().map((a) => a.wallpaperId))
  for (const source of busySources.values()) for (const id of source()) ids.add(id)
  return ids
}

/** Live global flags reach running wallpapers without their own */
export async function pushGlobalEngineFlags(before: EngineFlags, after: EngineFlags): Promise<void> {
  const splitScreens = new Set(getRunningInstances().filter((i) => i.split).map((i) => i.screen))
  for (const { screen, wallpaperId } of getScreenAssignments()) {
    // split engines run with the global flags only
    const own = splitScreens.has(screen) ? undefined : getWallpaper(wallpaperId)?.engineFlags
    const previous = liveEngineFlagOptions(resolveEngineFlags(before, own))
    const next = liveEngineFlagOptions(resolveEngineFlags(after, own))
    // a resent hwdec would reopen the video decoder for nothing
    const changed = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => previous[key as keyof typeof previous] !== value)
    )
    if (Object.keys(changed).length > 0) await hotswapLweSettings(changed, { screens: [screen] })
  }
}

/** On a playing screen the playlist player handles crashes */
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
    dependencyPrompt?: 'always' | 'once' | 'never'
    forceFresh?: boolean
  } = {}
): Promise<string> {
  const targets = expandScreen(screen)
  if (targets.length === 0) throw new Error(`Screen ${screen} is not connected`)

  let appliedPath = ''
  for (const target of targets) {
    markScreenUsed(target)
    appliedPath = await applyWallpaperMeta(wallpaper, { ...options, screen: target })
    setAssignment(target, wallpaper.id)
    // a single wallpaper replaces a split, or the next start would bring the split back
    // whenever this wallpaper is also the split's first slot
    setSplitScreen(target, null)
    // only a wallpaper that crashed on launch before needs its fresh launches watched
    if (wallpaper.compat?.freshLaunch === 'crash') watchLaunch(wallpaper.id, target)
  }
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
  return appliedPath
}

/** One fresh engine for all slots of the screen, beforeLaunch runs once the split is known to be showable */
export async function showSplitScreen(
  screen: ScreenTarget,
  beforeLaunch?: () => void,
  dependencyPrompt: 'always' | 'once' | 'never' = 'always'
): Promise<void> {
  if (getDisplayMode() !== 'per-screen' || screen === ALL_SCREENS) throw new Error(t('split.needsPerScreen'))
  if (!getDisplayTargets().includes(screen)) throw new Error(`Screen ${screen} is not connected`)
  if (!supportsSplitScreens()) throw new Error(t('split.engineTooOld'))

  const split = getSplitScreens()[screen]
  const slots: LweSplitSlot[] = []
  const shown: WallpaperMeta[] = []
  for (const slot of split?.slots ?? []) {
    const wallpaper = getWallpaper(slot.wallpaperId)
    if (!wallpaper?.localPath || !isAnimatedWallpaper(wallpaper) || !wallpaperIsOnDisk(wallpaper.localPath)) continue
    await ensureDependencyInstalled(wallpaper, dependencyPrompt)
    slots.push({
      path: wallpaper.localPath,
      scalingMode: slot.scalingMode ?? wallpaper.scalingMode,
      zoom: wallpaper.zoom,
      offsetX: wallpaper.offsetX,
      offsetY: wallpaper.offsetY,
      cornerColor: wallpaper.cornerColor,
      imageAdjustments: wallpaper.imageAdjustments
    })
    shown.push(wallpaper)
  }
  if (slots.length === 0 || !split) throw new Error(t('split.empty'))
  markScreenUsed(screen)
  beforeLaunch?.()

  // overrides would hit every slot by id, so slots play as published
  await launchLweAsync(slots[0].path, {
    screen,
    split: { layout: split.layout, slots },
    engineFlags: resolveEngineFlags(getGlobalEngineFlags()),
    fps: getDefaultFps() ?? undefined,
    forceFresh: true
  })
  setAssignment(screen, shown[0].id)
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
}

export async function stopDisplay(screen?: ScreenTarget): Promise<void> {
  for (const target of expandScreen(screen)) markScreenUsed(target)
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

// any slot can be the one that crashed, so nothing is recorded on a wallpaper
async function handleSplitCrash(info: LweExitInfo): Promise<void> {
  console.warn(`[Display] Split screen crashed on ${info.screen} (${info.phase}, ${info.description})`)
  const notify = (outcome: string): void => {
    const event: CrashEvent = { wallpaperId: '', title: t('split.title'), screen: info.screen, phase: info.phase, outcome }
    send(IpcChannels.EVENT_WALLPAPER_CRASHED, event)
  }
  const last = lastAutoRelaunch.get(info.screen) ?? 0
  if (info.phase !== 'launch' && Date.now() - last > RELAUNCH_COOLDOWN_MS) {
    lastAutoRelaunch.set(info.screen, Date.now())
    try {
      await showSplitScreen(info.screen)
      notify(t('crash.runtimeRestarted'))
      return
    } catch (err) {
      console.error('[Display] Split screen relaunch failed:', (err as Error).message)
    }
  }
  clearAssignment(info.screen)
  notify(info.phase === 'launch' ? t('compat.crashes') : t('compat.unstable'))
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
}

async function handleExit(info: LweExitInfo): Promise<void> {
  if (info.crashed && info.split) return handleSplitCrash(info)
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
    // a fresh launch tells whether only the hotswap is the problem

    if (!(await relaunchFresh(wallpaper, info.screen))) return
    notifyCrash(wallpaper, info.screen, 'hotswap', t('crash.hotswapTesting'))
    watchLaunch(wallpaper.id, info.screen, () => { notifyCrash(wallpaper, info.screen, 'hotswap', t('crash.hotswapFreshWorks')) }
    )
    return
  }

  if (info.phase === 'launch') {
    patchCompat(wallpaper, { freshLaunch: 'crash', lastCrash: crash })
    clearAssignment(info.screen === ALL_SCREENS ? undefined : info.screen)
    const skipped = playlistRecovery?.(info.screen, wallpaper.id) ?? false
    notifyCrash(wallpaper, info.screen, 'launch', skipped ? t('crash.launchSkipped') : t('compat.crashes'))
    send(IpcChannels.EVENT_DISPLAY_CHANGED)
    return
  }

  patchCompat(wallpaper, { runtimeCrashes: (wallpaper.compat?.runtimeCrashes ?? 0) + 1, lastCrash: crash })
  if (playlistRecovery?.(info.screen, wallpaper.id)) {
    notifyCrash(wallpaper, info.screen, 'runtime', t('crash.runtimeSkipped'))
    return
  }
  const last = lastAutoRelaunch.get(info.screen) ?? 0
  if (Date.now() - last > RELAUNCH_COOLDOWN_MS) {
    lastAutoRelaunch.set(info.screen, Date.now())
    if (await relaunchFresh(wallpaper, info.screen)) {
      notifyCrash(wallpaper, info.screen, 'runtime', t('crash.runtimeRestarted'))
      return
    }
  }
  clearAssignment(info.screen === ALL_SCREENS ? undefined : info.screen)
  notifyCrash(wallpaper, info.screen, 'runtime', t('compat.unstable'))
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
  watchLaunch(wallpaper.id, target, () => { notifyCrash(getWallpaper(wallpaper.id) ?? wallpaper, target, 'launch', t('crash.testPassed')) }
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
    void handleExit(info).catch((err: unknown) => { console.error('[Display] Crash handling failed:', err) })
  })
}

/** A missing drive still has a library entry. Launching that path marks a healthy wallpaper as a launch crash. */
function wallpaperIsOnDisk(localPath: string): boolean {
  if (!fs.existsSync(localPath)) return false
  try {
    return fs.statSync(localPath).isFile() || fs.existsSync(path.join(localPath, 'project.json'))
  } catch {
    return false
  }
}

/** The slot showSplitScreen would store as the assignment, when that folder is actually there */
function splitSlotId(screen: ScreenTarget): string | null {
  const split = getSplitScreens()[screen]
  if (!split) return null
  for (const slot of split.slots) {
    const wallpaper = getWallpaper(slot.wallpaperId)
    if (!wallpaper?.localPath || !isAnimatedWallpaper(wallpaper) || !wallpaperIsOnDisk(wallpaper.localPath)) continue
    return wallpaper.id
  }
  return null
}

/**
 * Puts the last animated wallpaper back on each screen after a restart. A live engine already showing
 * it is left alone. A split comes back through showSplitScreen. Screens a playlist or schedule just
 * claimed are skipped so the two launches do not run over each other.
 */
export async function restoreAssignedWallpapers(skipScreens: ReadonlySet<ScreenTarget> = new Set()): Promise<void> {
  if (!getLweStatus().installed) return
  const saved = getAssignments()
  const useAtStart = new Map(Object.keys(saved).map((screen) => [screen, screenUseCount(screen)]))
  const targets = new Set(getDisplayTargets())
  const running = new Map(getRunningInstances().map((inst) => [inst.screen, inst]))
  for (const [screen, wallpaperId] of Object.entries(saved)) {
    const wallpaper = getWallpaper(wallpaperId)
    const localPath = wallpaper?.localPath ?? ''
    const inst = running.get(screen)
    const plan = planRestore({
      skipped: skipScreens.has(screen),
      connected: targets.has(screen),
      animated: !!wallpaper && isAnimatedWallpaper(wallpaper),
      onDisk: !!localPath && wallpaperIsOnDisk(localPath),
      localPath,
      running: inst ? { split: !!inst.split, wallpaperPath: inst.wallpaperPath } : undefined,
      splitSlotId: splitSlotId(screen),
      wallpaperId
    })
    if (plan === 'skip' || !wallpaper) continue
    // an earlier screen takes at least 2s. Play, the tray or a playlist may have taken this one since.
    if (restoreSuperseded(wallpaperId, getAssignments()[screen], useAtStart.get(screen) ?? 0, screenUseCount(screen))) {
      console.log(`[Display] Leaving ${screen}, it changed while restoring`)
      continue
    }
    try {
      if (plan === 'split') {
        console.log(`[Display] Restoring split on ${screen}`)
        await showSplitScreen(screen, undefined, 'never')
      } else {
        console.log(`[Display] Restoring ${wallpaper.title} on ${screen}`)
        await showWallpaper(wallpaper, screen, { dependencyPrompt: 'never' })
      }
    } catch (err) {
      console.error(`[Display] Could not restore ${wallpaper?.title ?? wallpaperId} on ${screen}:`, (err as Error).message)
    }
  }
}
