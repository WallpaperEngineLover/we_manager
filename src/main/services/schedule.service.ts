import { openStore } from '../utils/safeStore'
import { nativeTheme, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { IpcChannels } from '@shared/ipc-channels'
import type { ScheduleRule } from '@shared/types'
import { dueTimeRules } from '@shared/schedule'
import { setBusyWallpaperSource } from './display.service'
import { runAction, runningWallpaperIds } from './rule-actions.service'

interface ScheduleStore {
  rules: ScheduleRule[]
  /** When the schedule was last checked, so rules that came due while the app was closed still fire */
  lastTick: number | null
}

const store = openStore<ScheduleStore>({
  name: 'schedule',
  defaults: { rules: [], lastTick: null }
})

const TICK_MS = 30_000
// rules older than this are not caught up on after a long time closed
const MAX_CATCH_UP_MS = 7 * 24 * 60 * 60 * 1000

let win: BrowserWindow | null = null
let timer: ReturnType<typeof setInterval> | null = null
let lastDark: boolean | null = null

export function getScheduleRules(): ScheduleRule[] {
  return store.get('rules')
}

export function saveScheduleRule(rule: Omit<ScheduleRule, 'id'> & { id?: string }): ScheduleRule {
  const saved: ScheduleRule = { ...rule, id: rule.id ?? randomUUID() }
  const rules = store.get('rules')
  const index = rules.findIndex((r) => r.id === saved.id)
  if (index === -1) rules.push(saved)
  else rules[index] = saved
  store.set('rules', rules)
  return saved
}

export function deleteScheduleRule(id: string): void {
  store.set('rules', store.get('rules').filter((r) => r.id !== id))
}

export async function runRule(rule: ScheduleRule): Promise<void> {
  console.log(`[Schedule] Running "${rule.name}" on ${rule.screen}`)
  await runAction(rule.action, rule.screen)
  if (win && !win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_SCHEDULE_FIRED, rule.name)
}

// one after another, a later rule for a single screen has to land after an earlier one for all of them
async function runAll(rules: readonly ScheduleRule[]): Promise<void> {
  for (const rule of rules) {
    await runRule(rule).catch((err: unknown) => { console.error(`[Schedule] "${rule.name}" failed:`, err) })
  }
}

function dueRules(now: number): ScheduleRule[] {
  const last = store.get('lastTick')
  if (last === null || last >= now) return []
  const from = new Date(Math.max(last, now - MAX_CATCH_UP_MS))
  return dueTimeRules(store.get('rules'), from, new Date(now))
}

function tick(): void {
  const now = Date.now()
  const due = dueRules(now)
  store.set('lastTick', now)
  void runAll(due)
}

function onThemeChanged(): void {
  const dark = nativeTheme.shouldUseDarkColors
  if (dark === lastDark) return
  lastDark = dark
  const theme = dark ? 'dark' : 'light'
  void runAll(store.get('rules').filter((r) => r.enabled && r.trigger.type === 'theme' && r.trigger.theme === theme))
}

export function takeCatchUp(now = Date.now()): ScheduleRule[] {
  const due = dueRules(now)
  store.set('lastTick', now)
  return due
}

/** Call after the playlist player resumed, so a rule that came due while closed (takeCatchUp) wins over it */
export function initSchedule(window: BrowserWindow, catchUp: readonly ScheduleRule[]): void {
  win = window
  setBusyWallpaperSource('schedule', runningWallpaperIds)
  lastDark = nativeTheme.shouldUseDarkColors
  nativeTheme.on('updated', onThemeChanged)
  void runAll(catchUp)
  timer ??= setInterval(tick, TICK_MS)
}
