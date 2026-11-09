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
  SplitScreen,
  WallpaperBackend,
  WallpaperCompat,
  WallpaperMeta
} from '@shared/types'
import { getAllWallpapers, getWallpaper, updateWallpaper } from './library.service'
import { applyWallpaperMeta, isAnimatedWallpaper, usesEngine } from './wallpaper.service'
import {
  ALL_SCREENS,
  getActiveScreens,
  getLweStatus,
  getRunningInstances,
  getUnusedScreens,
  hotswapLweSettings,
  isLweRunning,
  launchLweAsync,
  liveEngineFlagOptions,
  onLweExit,
  stopLwe,
  supportsSplitScreens,
  type LweExitInfo,
  type LweSplitSlot
} from './lwe.service'
import { resolveEngineFlags } from '@shared/engineFlags'
import {
  clearAssignment,
  getAssignments,
  isSplitActive,
  markSplitActive,
  setAssignment,
  splitActiveScreens
} from './wallpaper-state.service'
import { getDefaultFps, getDisplayMode, getGlobalEngineFlags, getSplitScreens } from './config.service'
import { planRestore, restoreSuperseded, trySplit, type RestoreInput } from './restore-plan'
import { ensureDependencyInstalled } from './dependency.service'
import { t } from '../i18n'

const LAUNCH_CHECK_MS = 20_000
// bumped by every launch and stop of a screen, so a restore can tell it was overtaken
const screenUse = new Map<string, number>()

function markScreenUsed(screen: ScreenTarget): number {
  const count = (screenUse.get(screen) ?? 0) + 1
  screenUse.set(screen, count)

  return count
}

function screenUseCount(screen: ScreenTarget): number {
  return screenUse.get(screen) ?? 0
}

const screenCommitted = new Map<string, number>()

function newerLaunchLanded(screen: ScreenTarget, stamp: number): boolean {
  return (screenCommitted.get(screen) ?? 0) > stamp
}

// a stop never claims a screen
const screenClaims = new Map<string, number>()

function claimStamp(screen: ScreenTarget, stamp: number): void {
  if ((screenClaims.get(screen) ?? 0) < stamp) screenClaims.set(screen, stamp)
}

function claimScreen(screen: ScreenTarget): number {
  const stamp = markScreenUsed(screen)
  claimStamp(screen, stamp)

  return stamp
}

function releaseScreen(screen: ScreenTarget, stamp: number): void {
  if (screenClaims.get(screen) === stamp) screenClaims.delete(screen)
}

function newerLaunchTakes(screen: ScreenTarget, stamp: number): boolean {
  return newerLaunchLanded(screen, stamp) || (screenClaims.get(screen) ?? 0) > stamp
}

// a killed engine still resolves its launch
function launchStood(engine: boolean, screen: ScreenTarget): boolean {
  return !engine || isLweRunning(screen)
}

function commitLaunch(screen: ScreenTarget, stamp: number): boolean {
  if (newerLaunchLanded(screen, stamp)) return false
  screenCommitted.set(screen, stamp)

  return true
}
// automatic relaunches after a runtime crash, at most one per screen in this window
const RELAUNCH_COOLDOWN_MS = 60_000

let win: BrowserWindow | null = null
const lastAutoRelaunch = new Map<ScreenTarget, number>()
const launchChecks = new Map<ScreenTarget, ReturnType<typeof setTimeout>>()
let playlistRecovery: ((screen: ScreenTarget, wallpaperId: string) => boolean) | null = null
let volumeSource: VolumeSource | null = null

function send(channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function getDisplayTargets(): ScreenTarget[] {
  if (getDisplayMode() === 'shared') return [ALL_SCREENS]
  const screens = getActiveScreens()
  return screens.length > 0 ? screens : [ALL_SCREENS]
}

/** '*' (or nothing) means every screen: one engine in shared mode, one per screen otherwise */
export function expandScreen(screen?: ScreenTarget, targets: ScreenTarget[] = getDisplayTargets()): ScreenTarget[] {
  if (screen === undefined || screen === ALL_SCREENS) return targets
  return targets.includes(screen) ? [screen] : []
}

export function isShownOn(wallpaperId: string, screen?: ScreenTarget): boolean {
  const assigned = getAssignments()

  return expandScreen(screen).some((target) => (assigned[target] ?? assigned[ALL_SCREENS]) === wallpaperId)
}

export function getScreenAssignments(): ScreenAssignment[] {
  const splits = new Set(splitActiveScreens())

  return Object.entries(getAssignments()).map(([screen, wallpaperId]) => ({
    screen,
    wallpaperId,
    split: splits.has(screen)
  }))
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

export function setVolumeSource(source: VolumeSource): void {
  volumeSource = source
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
  const engine = usesEngine(wallpaper)
  const stamps = new Map(targets.map((target) => [target, markScreenUsed(target)]))
  try {
    for (const target of targets) {
      const stamp = stamps.get(target) ?? 0
      if (newerLaunchTakes(target, stamp)) continue
      claimStamp(target, stamp)
      appliedPath = await applyWallpaperMeta(wallpaper, { ...options, screen: target })
      if (!launchStood(engine, target) || !commitLaunch(target, stamp)) continue
      setAssignment(target, wallpaper.id)
      // only a wallpaper that crashed on launch before needs its fresh launches watched
      if (wallpaper.compat?.freshLaunch === 'crash') watchLaunch(wallpaper.id, target)
    }
  } finally {
    for (const [target, stamp] of stamps) releaseScreen(target, stamp)
  }
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
  return appliedPath
}

export class SplitUnavailableError extends Error {}

/** One fresh engine for all slots of the screen, beforeLaunch runs once the split is known to be showable */
export async function showSplitScreen(
  screen: ScreenTarget,
  beforeLaunch?: () => void,
  dependencyPrompt: 'always' | 'once' | 'never' = 'always',
  skipMissing = false
): Promise<void> {
  if (getDisplayMode() !== 'per-screen' || screen === ALL_SCREENS) throw new SplitUnavailableError(t('split.needsPerScreen'))
  if (!getDisplayTargets().includes(screen)) throw new SplitUnavailableError(`Screen ${screen} is not connected`)
  if (!supportsSplitScreens()) throw new SplitUnavailableError(t('split.engineTooOld'))
  const claim = { stamp: claimScreen(screen) }
  try {
    await launchSplit(screen, claim, beforeLaunch, dependencyPrompt, skipMissing)
  } finally {
    releaseScreen(screen, claim.stamp)
  }
}

async function launchSplit(
  screen: ScreenTarget,
  claim: { stamp: number },
  beforeLaunch: (() => void) | undefined,
  dependencyPrompt: 'always' | 'once' | 'never',
  skipMissing: boolean
): Promise<void> {

  const split = getSplitScreens()[screen]
  const slots: LweSplitSlot[] = []
  const shown: WallpaperMeta[] = []
  for (const { slot, wallpaper, path: slotPath } of showableSplitSlots(screen, skipMissing)) {
    try {
      await ensureDependencyInstalled(wallpaper, dependencyPrompt)
    } catch (err) {
      if (dependencyPrompt === 'never') continue
      throw err
    }
    slots.push({
      path: slotPath,
      scalingMode: slot.scalingMode ?? wallpaper.scalingMode,
      zoom: wallpaper.zoom,
      offsetX: wallpaper.offsetX,
      offsetY: wallpaper.offsetY,
      cornerColor: wallpaper.cornerColor,
      imageAdjustments: wallpaper.imageAdjustments
    })
    shown.push(wallpaper)
  }
  if (slots.length === 0 || !split) throw new SplitUnavailableError(t('split.empty'))
  if (newerLaunchTakes(screen, claim.stamp)) {
    // restore leaves the screen to whoever took it, a split somebody asked for goes on
    if (!beforeLaunch) return
    releaseScreen(screen, claim.stamp)
    claim.stamp = claimScreen(screen)
  }
  beforeLaunch?.()

  // overrides would hit every slot by id, so slots play as published
  await launchLweAsync(slots[0].path, {
    screen,
    split: { layout: split.layout, slots },
    engineFlags: resolveEngineFlags(getGlobalEngineFlags()),
    fps: getDefaultFps() ?? undefined,
    forceFresh: true
  })
  if (!isLweRunning(screen) || !commitLaunch(screen, claim.stamp)) return
  setAssignment(screen, shown[0].id)
  markSplitActive(screen)
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
}

export async function stopDisplay(screen?: ScreenTarget): Promise<void> {
  // no expandScreen here, it shells out
  const marked = screen === undefined || screen === ALL_SCREENS ? [...screenUse.keys()] : [screen]
  for (const target of marked) markScreenUsed(target)
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
    await applyWallpaperMeta(getWallpaper(wallpaper.id) ?? wallpaper, {
      screen,
      forceFresh: true,
      dependencyPrompt: 'once',
      volume: volumeSource?.(screen, wallpaper.id)
    })
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
  const stamp = claimScreen(target)
  try {
    await applyWallpaperMeta(wallpaper, { screen: target, forceFresh: true })
  } finally {
    releaseScreen(target, stamp)
  }
  if (launchStood(usesEngine(wallpaper), target) && commitLaunch(target, stamp)) setAssignment(target, wallpaper.id)
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
  watchLaunch(wallpaper.id, target, () => { notifyCrash(getWallpaper(wallpaper.id) ?? wallpaper, target, 'launch', t('crash.testPassed')) }
  )
}

export function forgetAssignments(): void {
  for (const target of screenUse.keys()) markScreenUsed(target)
  clearAssignment()
  send(IpcChannels.EVENT_DISPLAY_CHANGED)
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

// a missing drive keeps its library entry, and launching it would mark a healthy wallpaper as crashed
function wallpaperIsOnDisk(localPath: string): boolean {
  if (!fs.existsSync(localPath)) return false
  try {
    return fs.statSync(localPath).isFile() || fs.existsSync(path.join(localPath, 'project.json'))
  } catch {
    return false
  }
}

// a manual show lets the engine report a missing folder
function showableSplitSlots(screen: ScreenTarget, onDiskOnly = true): { slot: SplitScreen['slots'][number]; wallpaper: WallpaperMeta; path: string }[] {
  return (getSplitScreens()[screen]?.slots ?? []).flatMap((slot) => {
    const wallpaper = getWallpaper(slot.wallpaperId)
    const localPath = wallpaper?.localPath
    return wallpaper && localPath && isAnimatedWallpaper(wallpaper) && (!onDiskOnly || wallpaperIsOnDisk(localPath)) ? [{ slot, wallpaper, path: localPath }] : []
  })
}

const SPLIT_RETRY_MS = 3000

export type VolumeSource = (screen: ScreenTarget, wallpaperId: string) => number | undefined

type Running = ReturnType<typeof getRunningInstances>[number]

function engineOf(inst?: Running): RestoreInput['running'] {
  return inst ? { split: !!inst.split, wallpaperPath: inst.wallpaperPath } : undefined
}

// a restore waiting for a retry must not start an engine after the shutdown kill
let restoreRun = 0
let restoreCancelled = false

export function cancelRestore(): void {
  restoreCancelled = true
  restoreRun++
}

function splitTry(screen: ScreenTarget) {
  return trySplit({
    show: () => showSplitScreen(screen, undefined, 'never', true),
    uses: () => screenUseCount(screen),
    onError: (err) => { console.error(`[Display] Could not restore the split on ${screen}:`, (err as Error).message) }
  })
}

async function retrySplit(
  run: number,
  screen: ScreenTarget,
  wallpaper: WallpaperMeta | null | undefined,
  input: RestoreInput,
  volumeFor?: VolumeSource
): Promise<void> {
  const settled = screenUseCount(screen)
  await new Promise((resolve) => setTimeout(resolve, SPLIT_RETRY_MS))
  if (run !== restoreRun || screenUseCount(screen) !== settled) return
  if ((await splitTry(screen)) !== 'failed' || !wallpaper || run !== restoreRun) return

  // the failed tries changed what is running
  const live = getRunningInstances().find((inst) => inst.screen === screen)
  if (planRestore({ ...input, splitActive: false, running: engineOf(live) }) !== 'wallpaper') return

  console.log(`[Display] Restoring ${wallpaper.title} on ${screen} instead of its split`)
  await showWallpaper(wallpaper, screen, { dependencyPrompt: 'never', volume: volumeFor?.(screen, wallpaper.id) })
}

export async function restoreAssignedWallpapers(
  skipScreens: ReadonlySet<ScreenTarget> = new Set(),
  volumeFor?: VolumeSource
): Promise<void> {
  if (restoreCancelled || !getLweStatus().installed) return
  await restoreScreens(++restoreRun, skipScreens, volumeFor, undefined, 0)
}

const RESTORE_RETRIES = 5

async function restoreScreens(
  run: number,
  skipScreens: ReadonlySet<ScreenTarget>,
  volumeFor: VolumeSource | undefined,
  only: readonly ScreenTarget[] | undefined,
  attempt: number,
  carried?: { useAtStart: Map<string, number>; targets?: Set<string> }
): Promise<void> {
  const saved = Object.fromEntries(Object.entries(getAssignments()).filter(([screen]) => !only || only.includes(screen)))
  // judged against the first pass, a launch started since has taken the screen
  const useAtStart = new Map(Object.keys(saved).map((screen) => [screen, carried?.useAtStart.get(screen) ?? screenUseCount(screen)]))
  const targets = carried?.targets ?? new Set(getDisplayTargets())
  const running = new Map(getRunningInstances().map((inst) => [inst.screen, inst]))
  // '*' is an old single-wallpaper assignment, restorable in shared mode only
  const missing = Object.keys(saved).filter((screen) => screen !== ALL_SCREENS && !targets.has(screen) && !skipScreens.has(screen))
  const unused = missing.length > 0 ? new Set(getUnusedScreens()) : new Set<string>()
  const waiting = new Set(missing.filter((screen) => !unused.has(screen)))
  for (const [screen, wallpaperId] of Object.entries(saved)) {
    if (run !== restoreRun) return
    const wallpaper = getWallpaper(wallpaperId)
    const localPath = wallpaper?.localPath ?? ''
    const inst = running.get(screen)
    const splitActive = isSplitActive(screen)
    const input: RestoreInput = {
      skipped: skipScreens.has(screen),
      connected: targets.has(screen),
      animated: !!wallpaper && isAnimatedWallpaper(wallpaper),
      onDisk: !!localPath && wallpaperIsOnDisk(localPath),
      localPath,
      running: engineOf(inst),
      splitActive,
      splitShowable: splitActive && showableSplitSlots(screen).length > 0
    }
    const plan = planRestore(input)
    if (plan === 'wait') waiting.add(screen)
    if (plan === 'skip' || plan === 'wait') continue
    // an earlier screen takes 2s or more, Play, the tray or a playlist may have taken this one since
    if (restoreSuperseded(wallpaperId, getAssignments()[screen], useAtStart.get(screen) ?? 0, screenUseCount(screen))) {
      console.log(`[Display] Leaving ${screen}, it changed while restoring`)
      continue
    }
    try {
      if (plan === 'split') {
        console.log(`[Display] Restoring split on ${screen}`)

        if ((await splitTry(screen)) === 'failed') {
          void retrySplit(run, screen, wallpaper, input, volumeFor).catch((err: unknown) => {
            console.error(`[Display] Could not restore ${screen}:`, (err as Error).message)
          })
        }
        continue
      }

      if (!wallpaper) continue

      console.log(`[Display] Restoring ${wallpaper.title} on ${screen}`)
      await showWallpaper(wallpaper, screen, { dependencyPrompt: 'never', volume: volumeFor?.(screen, wallpaperId) })
    } catch (err) {
      console.error(`[Display] Could not restore ${wallpaper?.title ?? wallpaperId} on ${screen}:`, (err as Error).message)
    }
  }

  if (waiting.size === 0) return
  if (attempt >= RESTORE_RETRIES) {
    console.log(`[Display] Gave up restoring ${[...waiting].join(', ')}, still waiting after ${RESTORE_RETRIES} tries`)
    return
  }
  await new Promise((resolve) => setTimeout(resolve, SPLIT_RETRY_MS))
  if (run !== restoreRun) return
  const onlyFolders = [...waiting].every((screen) => targets.has(screen))
  await restoreScreens(run, skipScreens, volumeFor, [...waiting], attempt + 1, {
    useAtStart,
    targets: onlyFolders ? targets : undefined
  })
}
