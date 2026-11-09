import { randomUUID } from 'crypto'
import path from 'path'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppRule, ScreenAction } from '@shared/types'
import {
  popLayers,
  pushLayer,
  stepAppRules,
  type Observation,
  type RuleStates,
  type ScreenLayers
} from '@shared/appRules'
import { openStore } from '../utils/safeStore'
import { listProcessNames } from '../utils/processes'
import { isAudioPlaying } from '../utils/audio-activity'
import { hostPidOf, isFlatpak } from '../utils/flatpak'
import { getRunningInstances, isLweRunning } from './lwe.service'
import { captureScreens } from './profile.service'
import { getWallpaper } from './library.service'
import { actionScreens, runAction, runScreenAction } from './rule-actions.service'

interface AppRuleStore {
  rules: AppRule[]
  /** what each screen showed before the rules that are on it, so a restart does not forget where to go back to */
  layers: ScreenLayers<ScreenAction>
  active: string[]
}

const store = openStore<AppRuleStore>({
  name: 'app-rules',
  defaults: { rules: [], layers: {}, active: [] }
})

// every check inside a Flatpak is a round trip through flatpak-spawn to the host
const TICK_MS = isFlatpak() ? 5000 : 2000
const MAX_RESTORE_ATTEMPTS = 3

let win: BrowserWindow | null = null
let timer: ReturnType<typeof setInterval> | null = null
let states: RuleStates = Object.fromEntries(store.get('active').map((id) => [id, { active: true, unmetSince: null }]))
let ticking = false
let rulesCache: AppRule[] = store.get('rules')
let savedActive = store.get('active').join()
let layersCache = store.get('layers')

function setLayers(layers: ScreenLayers<ScreenAction>): void {
  layersCache = layers
  store.set('layers', layers)
}

let resumePending = new Set(store.get('active'))
const restoreAttempts = new Map<string, number>()
const reapply = new Set<string>()

export function getAppRules(): AppRule[] {
  return rulesCache
}

function setRules(rules: AppRule[]): void {
  rulesCache = rules
  store.set('rules', rules)
  syncTimer()
}

export function saveAppRule(rule: Omit<AppRule, 'id'> & { id?: string }): AppRule {
  const saved: AppRule = { ...rule, id: rule.id ?? randomUUID() }
  const rules = [...rulesCache]
  const index = rules.findIndex((r) => r.id === saved.id)
  if (index === -1) {
    rules.push(saved)
  } else {
    const old = rules[index]
    if (states[saved.id]?.active && (!sameAction(old, saved) || old.revert !== saved.revert)) reapply.add(saved.id)
    rules[index] = saved
  }
  setRules(rules)
  return saved
}

function sameAction(a: AppRule, b: AppRule): boolean {
  return a.screen === b.screen && JSON.stringify(a.action) === JSON.stringify(b.action)
}

export function deleteAppRule(id: string): void {
  setRules(rulesCache.filter((r) => r.id !== id))
}

export function getActiveRuleIds(): string[] {
  return Object.entries(states)
    .filter(([, state]) => state.active)
    .map(([id]) => id)
}

const HOST_PID_RETRY_MS = 60_000
const HOST_PID_RETRY_MAX_MS = 15 * 60_000

let ownHostPid: number | undefined
let ownHostPidLookup: Promise<void> | null = null
let ownHostPidFailures = 0
let ownHostPidRetryAt = 0

/**
 * The first answer is waited for, until it is there the app's own sound would count as another app's.
 * Only a found pid is kept. A failed lookup is tried again in the background, less often each time: it scans
 * the processes of the host, takes up to 10 s, and the checks must not wait for it
 */
async function findOwnHostPid(): Promise<void> {
  if (!isFlatpak() || ownHostPid !== undefined || ownHostPidLookup || Date.now() < ownHostPidRetryAt) return

  const first = ownHostPidFailures === 0
  ownHostPidLookup = hostPidOf(process.pid).then((pid) => {
    ownHostPid = pid
    ownHostPidLookup = null
    if (pid === undefined) {
      ownHostPidRetryAt = Date.now() + Math.min(HOST_PID_RETRY_MS * 2 ** ownHostPidFailures, HOST_PID_RETRY_MAX_MS)
      ownHostPidFailures++
    }
  })
  if (first) await ownHostPidLookup
}

async function observe(rules: AppRule[]): Promise<Observation> {
  const enabled = rules.filter((r) => r.enabled)
  const processes = enabled.some((r) => r.condition.type === 'process') ? await listProcessNames() : new Set<string>()
  let audioPlaying = false
  if (enabled.some((r) => r.condition.type === 'audio')) {
    await findOwnHostPid()
    const owners = new Set([process.pid, ...getRunningInstances().flatMap((i) => (i.hostPid === null ? [i.pid] : [i.pid, i.hostPid]))])
    if (ownHostPid !== undefined) owners.add(ownHostPid)
    audioPlaying = await isAudioPlaying(owners)
  }
  return { processes, audioPlaying }
}

function notify(name: string, state: 'started' | 'ended' | 'restoreFailed' | 'failed'): void {
  if (win && !win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_APP_RULE, { name, state })
}

async function fire(rule: AppRule): Promise<void> {
  console.log(`[AppRules] "${rule.name}" started`)
  if (rule.revert) {
    try {
      const screens = actionScreens(rule.action, rule.screen)
      const before = captureScreens(screens)
      let layers = layersCache
      for (const screen of screens) {
        if (layers[screen]?.some((entry) => entry.ruleId === rule.id)) continue
        layers = pushLayer(layers, screen, rule.id, before[screen])
      }
      setLayers(layers)
    } catch (err) {
      console.error(`[AppRules] could not remember what "${rule.name}" replaces:`, err)
    }
  }

  try {
    await runAction(rule.action, rule.screen)
  } catch (err) {
    console.error(`[AppRules] "${rule.name}" failed:`, err)
    if (rule.revert) setLayers(popLayers(layersCache, rule.id).layers)
    notify(rule.name, 'failed')
    return
  }
  notify(rule.name, 'started')
}

function showsRuleWallpaper(action: AppRule['action'], screen: string): boolean {
  if (action.type !== 'wallpaper') return true
  const dir = getWallpaper(action.wallpaperId)?.localPath
  if (!dir) return true
  const shown = getRunningInstances().find((i) => i.screen === screen)
  if (!shown) return false
  const root = path.resolve(dir)
  const current = path.resolve(shown.wallpaperPath)
  return current === root || current.startsWith(root + path.sep)
}

async function resumeAfterRestart(rule: AppRule): Promise<void> {
  const screens = actionScreens(rule.action, rule.screen)
  if (screens.every((screen) => isLweRunning(screen) && showsRuleWallpaper(rule.action, screen))) return
  console.log(`[AppRules] "${rule.name}" was active at the last close and still holds`)
  await runAction(rule.action, rule.screen)
}

async function release(id: string): Promise<void> {
  console.log(`[AppRules] rule ${id} ended`)
  const before = layersCache
  const { layers, restore } = popLayers(before, id)

  const failed: string[] = []
  for (const [screen, action] of Object.entries(restore)) {
    try {
      await runScreenAction(action, screen)
    } catch (err) {
      console.error(`[AppRules] going back on ${screen} failed:`, err)
      failed.push(screen)
    }
  }

  const attempts = (restoreAttempts.get(id) ?? 0) + 1
  let kept = layers
  if (failed.length > 0 && attempts < MAX_RESTORE_ATTEMPTS) {
    for (const screen of failed) kept = { ...kept, [screen]: before[screen] }
    restoreAttempts.set(id, attempts)
  } else {
    restoreAttempts.delete(id)
    const name = rulesCache.find((r) => r.id === id)?.name
    if (name && Object.keys(restore).length > 0) notify(name, failed.length > 0 ? 'restoreFailed' : 'ended')
  }
  setLayers(kept)
}

function endedRulesWithLayers(): string[] {
  const ids = new Set<string>()
  for (const entries of Object.values(layersCache)) {
    for (const entry of entries) {
      if (!states[entry.ruleId]?.active) ids.add(entry.ruleId)
    }
  }
  return [...ids]
}

async function guarded(label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (err) {
    console.error(`[AppRules] ${label} failed:`, err)
  }
}

async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    for (const id of reapply) {
      reapply.delete(id)
      delete states[id]
      await guarded(`ending ${id}`, () => release(id))
    }
    const result = stepAppRules(states, rulesCache, await observe(rulesCache), Date.now())
    states = result.next

    for (const id of result.deactivate) await guarded(`ending ${id}`, () => release(id))
    for (const id of endedRulesWithLayers()) {
      if (!result.deactivate.includes(id)) await guarded(`going back for ${id}`, () => release(id))
    }
    for (const rule of result.activate) await guarded(`starting "${rule.name}"`, () => fire(rule))

    if (resumePending.size > 0) {
      const pending = rulesCache.filter((rule) => resumePending.has(rule.id) && states[rule.id]?.active && states[rule.id].unmetSince === null)
      resumePending = new Set()
      for (const rule of pending) await guarded(`resuming "${rule.name}"`, () => resumeAfterRestart(rule))
    }

    const active = getActiveRuleIds().join()
    if (active !== savedActive) {
      savedActive = active
      store.set('active', getActiveRuleIds())
    }
  } catch (err) {
    console.error('[AppRules] check failed:', err)
  } finally {
    ticking = false
    syncTimer()
  }
}

function needsTimer(): boolean {
  return rulesCache.some((rule) => rule.enabled) || Object.keys(states).length > 0 || Object.keys(layersCache).length > 0
}

function syncTimer(): void {
  if (needsTimer()) {
    timer ??= setInterval(() => void tick(), TICK_MS)
  } else if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Call after the playlist player and the schedule are up, so a rule that holds at start wins over both */
export function initAppRules(window: BrowserWindow): void {
  win = window
  void tick()
  syncTimer()
}
