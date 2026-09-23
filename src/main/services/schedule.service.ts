import Store from 'electron-store'
import { nativeTheme, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { IpcChannels } from '@shared/ipc-channels'
import type { ScheduleRule } from '@shared/types'
import { dueTimeRules } from '@shared/schedule'
import { getWallpaper, updateWallpaper } from './library.service'
import { getPlaylist } from './playlist.service'
import { expandScreen, showWallpaper, stopDisplay } from './display.service'
import { startPlaylist, stopPlaylist } from './playlist-player.service'

interface ScheduleStore {
  rules: ScheduleRule[]
  /** When the schedule was last checked, so rules that came due while the app was closed still fire */
  lastTick: number | null
}

const store = new Store<ScheduleStore>({
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
  const { action, screen } = rule
  console.log(`[Schedule] Running "${rule.name}" on ${screen}`)

  if (action.type === 'wallpaper') {
    const wallpaper = getWallpaper(action.wallpaperId)
    if (!wallpaper) throw new Error('The scheduled wallpaper is no longer in the library')
    for (const s of expandScreen(screen)) stopPlaylist(s)
    await showWallpaper(wallpaper, screen, { dependencyPrompt: 'once' })
    updateWallpaper(wallpaper.id, { appliedCount: (wallpaper.appliedCount ?? 0) + 1, lastAppliedAt: Date.now() })
  } else if (action.type === 'playlist') {
    if (!getPlaylist(action.playlistId)) throw new Error('The scheduled playlist no longer exists')
    startPlaylist(action.playlistId, screen)
  } else {
    stopPlaylist(screen)
    await stopDisplay(screen)
  }

  if (win && !win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_SCHEDULE_FIRED, rule.name)
}

// one after another, a later rule for a single screen has to land after an earlier one for all of them
async function runAll(rules: ScheduleRule[]): Promise<void> {
  for (const rule of rules) {
    await runRule(rule).catch((err) => console.error(`[Schedule] "${rule.name}" failed:`, err.message))
  }
}

function tick(): void {
  const now = Date.now()
  const last = store.get('lastTick')
  store.set('lastTick', now)
  if (last === null || last >= now) return

  const from = new Date(Math.max(last, now - MAX_CATCH_UP_MS))
  void runAll(dueTimeRules(store.get('rules'), from, new Date(now)))
}

function onThemeChanged(): void {
  const dark = nativeTheme.shouldUseDarkColors
  if (dark === lastDark) return
  lastDark = dark
  const theme = dark ? 'dark' : 'light'
  void runAll(store.get('rules').filter((r) => r.enabled && r.trigger.type === 'theme' && r.trigger.theme === theme))
}

/** Call after the playlist player resumed, so a rule that came due while closed wins over it */
export function initSchedule(window: BrowserWindow): void {
  win = window
  lastDark = nativeTheme.shouldUseDarkColors
  nativeTheme.on('updated', onThemeChanged)
  tick()
  timer ??= setInterval(tick, TICK_MS)
}
