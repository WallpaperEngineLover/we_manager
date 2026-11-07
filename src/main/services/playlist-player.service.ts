import { openStore } from '../utils/safeStore'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { Playlist, PlaylistItem, PlaylistPlaybackState, ScreenTarget } from '@shared/types'
import { compatStatus } from '@shared/compat'
import { trimmedVideoLength, videoSegmentsOf } from '@shared/videoTrim'
import { getAllPlaylists, getPlaylist } from './playlist.service'
import { getWallpaper, updateWallpaper } from './library.service'
import { getLweStatus, ALL_SCREENS } from './lwe.service'
import { getAutostartPlaylistId, getSkipPlaylistResume } from './config.service'
import { mergePlayers, playlistSkipScreens, savedScreensFor } from './restore-plan'
import { getAssignments } from './wallpaper-state.service'
import { getFavoriteItemIds } from './steam.service'
import { expandScreen, getDisplayTargets, setBusyWallpaperSource, setPlaylistRecovery, setVolumeSource, showWallpaper } from './display.service'
import { findWallpaperVideoFile, getVideoDurationSec } from '../utils/video'

interface SavedPlayer {
  playlistId: string
  isPlaying: boolean
  shownId?: string | null
}

interface PlaybackStore {
  /** Written by older versions, which only had the one player */
  activePlaylistId: string | null
  isPlaying: boolean
  players: Record<ScreenTarget, SavedPlayer> | null
}

const store = openStore<PlaybackStore>({
  name: 'playlist-playback',
  defaults: { activePlaylistId: null, isPlaying: false, players: null }
})

interface Player {
  state: PlaylistPlaybackState
  timer: NodeJS.Timeout | null
  scheduleToken: number
  applying: boolean
  applyId: number
  /** The item the playlist itself put on the screen last, the playlist goes on from there after a restart */
  lastShown: string | null
  suspended: boolean
}

let win: BrowserWindow | null = null
const players = new Map<ScreenTarget, Player>()
const listeners = new Set<() => void>()

export function onPlaybackStateChanged(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function idleState(screen: ScreenTarget): PlaylistPlaybackState {
  return { screen, playlistId: null, currentItemId: null, currentIndex: -1, isPlaying: false, order: [] }
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function buildOrder(playlist: Playlist): string[] {
  if (playlist.settings.randomize) {
    return shuffle(playlist.items.map((i) => i.wallpaperId))
  }
  const items = [...playlist.items]
  switch (playlist.settings.sortBy) {
    case 'title':
      items.sort((a, b) => {
        const wa = getWallpaper(a.wallpaperId)
        const wb = getWallpaper(b.wallpaperId)
        return (wa?.title ?? '').localeCompare(wb?.title ?? '')
      })
      break
    case 'createdAt':
      items.sort((a, b) => {
        const wa = getWallpaper(a.wallpaperId)
        const wb = getWallpaper(b.wallpaperId)
        return (wa?.createdAt ?? 0) - (wb?.createdAt ?? 0)
      })
      break
    default:
      break
  }
  return items.map((i) => i.wallpaperId)
}

function persist(stopped: readonly ScreenTarget[] = [], prune = true): void {
  const live: Record<ScreenTarget, SavedPlayer> = {}
  for (const [screen, p] of players) {
    if (p.state.playlistId) {
      live[screen] = { playlistId: p.state.playlistId, isPlaying: p.state.isPlaying || p.suspended, shownId: p.lastShown }
    }
  }
  const existing = prune ? new Set(getAllPlaylists().map((playlist) => playlist.id)) : null
  const saved = Object.fromEntries(Object.entries(savedPlayers()).filter(([, player]) => !existing || existing.has(player.playlistId)))
  store.set('players', mergePlayers(saved, live, [...stopped, ...players.keys()]))
}

function clearTimer(player: Player): void {
  player.scheduleToken++
  if (player.timer) {
    clearTimeout(player.timer)
    player.timer = null
  }
}

function emitState(): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.EVENT_PLAYLIST_STATE_CHANGED, getPlaybackStates())
  }
  for (const cb of listeners) cb()
}

function itemVolume(playlist: Playlist, item?: PlaylistItem): number {
  return item?.volume ?? playlist.settings.defaultVolume
}

function findItem(playlist: Playlist, wallpaperId: string): PlaylistItem | undefined {
  return playlist.items.find((i) => i.wallpaperId === wallpaperId)
}

/** Checked at every step so favorite changes apply on the next switch */
function rotationFilter(playlist: Playlist, order: string[]): (id: string) => boolean {
  if (!playlist.settings.favoritesOnly) return () => true
  const favorites = new Set(getFavoriteItemIds())
  return order.some((id) => favorites.has(id)) ? (id) => favorites.has(id) : () => true
}

function known(id: string): boolean {
  return compatStatus(getWallpaper(id)?.compat) !== 'crashes'
}

/** Skips crashing items and non-favorites while something else is left. `picked` always plays */
async function applyCurrent(player: Player, playlist: Playlist, picked?: string): Promise<void> {
  const { state } = player
  const count = state.order.length
  const inRotation = rotationFilter(playlist, state.order)
  const anyPlayable = state.order.some((id) => inRotation(id) && known(id))

  const mine = ++player.applyId
  const stale = (): boolean => player.state !== state || players.get(state.screen) !== player || player.applyId !== mine

  player.applying = true
  try {
    for (let tries = 0; tries < count; tries++, state.currentIndex = (state.currentIndex + 1) % count) {
      if (stale()) return
      const wallpaper = getWallpaper(state.order[state.currentIndex])
      if (!wallpaper) continue
      if (wallpaper.id !== picked && (!inRotation(wallpaper.id) || (anyPlayable && !known(wallpaper.id)))) continue

      const item = findItem(playlist, wallpaper.id)
      try {
        await showWallpaper(wallpaper, state.screen, {
          volume: itemVolume(playlist, item),
          dependencyPrompt: 'once'
        })
      } catch (err) {
        console.error('[PlaylistPlayer] Failed to apply wallpaper:', err)
        continue
      }
      if (stale()) return
      // a launch that something newer overtook is not what the screen shows
      if (assignedId(state.screen) === wallpaper.id) {
        updateWallpaper(wallpaper.id, {
          appliedCount: (wallpaper.appliedCount ?? 0) + 1,
          lastAppliedAt: Date.now()
        })
        state.currentItemId = wallpaper.id
        player.lastShown = wallpaper.id
      }
      return
    }
  } finally {
    if (player.applyId === mine) player.applying = false
  }
}

async function showCurrent(player: Player, playlist: Playlist, picked?: string): Promise<void> {
  const state = player.state
  await applyCurrent(player, playlist, picked)
  if (player.state !== state) return
  scheduleNext(player, playlist)
  try {
    persist([], false)
  } catch (err) {
    console.error('[PlaylistPlayer] Could not save the playlist state:', err)
  }
  emitState()
}

// covers engine startup/hotswap time
const VIDEO_END_GRACE_SEC = 2

async function getVideoLengthSec(wallpaperId: string): Promise<number | undefined> {
  const wallpaper = getWallpaper(wallpaperId)
  if (wallpaper?.type !== 'video' || !wallpaper.localPath) return undefined
  const videoFile = findWallpaperVideoFile(wallpaper.localPath, wallpaper.file)
  const duration = videoFile ? await getVideoDurationSec(videoFile) : undefined
  return duration === undefined ? undefined : trimmedVideoLength(duration, videoSegmentsOf(wallpaper))
}

function scheduleNext(player: Player, playlist: Playlist): void {
  clearTimer(player)
  if (!player.state.isPlaying) return

  const wallpaperId = player.state.order[player.state.currentIndex]
  const item = wallpaperId ? findItem(playlist, wallpaperId) : undefined
  const durationSec = item?.durationSec ?? playlist.settings.defaultDurationSec
  const token = player.scheduleToken

  const arm = (sec: number): void => {
    player.timer = setTimeout(() => {
      void advance(player)
    }, sec * 1000)
  }

  if (!playlist.settings.finishVideos || !wallpaperId) {
    arm(durationSec)
    return
  }

  void getVideoLengthSec(wallpaperId).then((videoSec) => {
    if (token !== player.scheduleToken) return
    if (videoSec !== undefined && videoSec > durationSec) {
      arm(videoSec + VIDEO_END_GRACE_SEC)
    } else {
      arm(durationSec)
    }
  })
}

async function advance(player: Player): Promise<void> {
  if (!player.state.playlistId || player.applying) return
  const playlist = getPlaylist(player.state.playlistId)
  if (!playlist || playlist.items.length === 0) {
    stopPlaylist(player.state.screen)
    return
  }

  player.state.currentIndex++
  if (player.state.currentIndex >= player.state.order.length) {
    player.state.order = buildOrder(playlist)
    player.state.currentIndex = 0
  }

  await showCurrent(player, playlist)
}

function playerFor(screen: ScreenTarget): Player {
  let player = players.get(screen)
  if (!player) {
    player = {
      state: idleState(screen),
      timer: null,
      scheduleToken: 0,
      applying: false,
      applyId: 0,
      lastShown: null,
      suspended: false
    }
    players.set(screen, player)
  }
  return player
}

/** Nothing given = every screen */
function selectPlayers(screen?: ScreenTarget): Player[] {
  if (screen === undefined || screen === ALL_SCREENS) return [...players.values()]
  const player = players.get(screen)
  return player ? [player] : []
}

function assignedId(screen: ScreenTarget): string | undefined {
  const assigned = getAssignments()

  return assigned[screen] ?? assigned[ALL_SCREENS]
}

function owns(player: Player): boolean {
  return player.lastShown !== null && assignedId(player.state.screen) === player.lastShown
}

function startOn(screen: ScreenTarget, playlist: Playlist, paused = false, shownId?: string | null): PlaylistPlaybackState {
  const player = playerFor(screen)
  clearTimer(player)
  const order = buildOrder(playlist)
  const at = paused && shownId ? order.indexOf(shownId) : -1
  player.lastShown = at >= 0 ? order[at] : null
  player.suspended = false
  player.applying = false
  player.applyId++
  player.state = {
    screen,
    playlistId: playlist.id,
    currentItemId: owns(player) ? player.lastShown : null,
    currentIndex: Math.max(at, 0),
    isPlaying: !paused,
    order
  }
  if (paused) return player.state

  void showCurrent(player, playlist)
  return player.state
}

export function startPlaylist(id: string, screen?: ScreenTarget): PlaylistPlaybackState[] {
  const playlist = getPlaylist(id)
  if (!playlist) throw new Error(`Playlist ${id} not found`)
  if (playlist.items.length === 0) throw new Error('Playlist has no wallpapers')

  const targets = expandScreen(screen)
  if (targets.length === 0) throw new Error(`Screen ${screen} is not connected`)
  for (const s of players.keys()) {
    if (!getDisplayTargets().includes(s)) stopPlaylist(s)
  }

  const states = targets.map((s) => startOn(s, playlist))
  persist()
  emitState()
  return states
}

export async function playItem(playlistId: string, wallpaperId: string, screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> {
  const playlist = getPlaylist(playlistId)
  if (!playlist) throw new Error(`Playlist ${playlistId} not found`)
  if (!findItem(playlist, wallpaperId)) throw new Error(`Wallpaper ${wallpaperId} is not in this playlist`)

  // without a screen, play it wherever this playlist is already playing, or on every screen
  let targets = screen === undefined
    ? [...players.values()].filter((p) => p.state.playlistId === playlistId).map((p) => p.state.screen)
    : expandScreen(screen)
  if (targets.length === 0) targets = expandScreen()

  for (const target of targets) {
    const player = playerFor(target)
    clearTimer(player)
    if (player.state.playlistId !== playlistId) {
      player.state = { ...idleState(target), playlistId: playlist.id, isPlaying: true, order: buildOrder(playlist) }
      player.lastShown = null
      player.suspended = false
      player.applying = false
      player.applyId++
    }

    let index = player.state.order.indexOf(wallpaperId)
    if (index === -1) {
      player.state.order = buildOrder(playlist)
      index = player.state.order.indexOf(wallpaperId)
    }
    player.state.currentIndex = index
    player.state.isPlaying = true
    player.suspended = false

    await showCurrent(player, playlist, wallpaperId)
  }
  return getPlaybackStates()
}

export function stopPlaylist(screen?: ScreenTarget): PlaylistPlaybackState[] {
  const stopped: ScreenTarget[] = []

  for (const player of selectPlayers(screen)) {
    clearTimer(player)
    // an apply still running must not arm the timer of a player that is gone
    player.state.isPlaying = false
    players.delete(player.state.screen)
    stopped.push(player.state.screen)
  }
  persist([...stopped, ...savedScreens(screen)])
  emitState()
  return getPlaybackStates()
}

function pause(screen: ScreenTarget | undefined, forget: readonly ScreenTarget[]): void {
  for (const player of selectPlayers(screen)) {
    if (!player.state.playlistId) continue
    clearTimer(player)
    player.state.isPlaying = false
    player.suspended = false
  }
  persist(forget)
  emitState()
}

export function pausePlaylist(screen?: ScreenTarget): PlaylistPlaybackState[] {
  pause(screen, [])
  return getPlaybackStates()
}

export function releasePlaylistScreen(screen: ScreenTarget): void {
  pause(screen, savedScreens(screen))
}

export function suspendPlaylist(screen: ScreenTarget): () => void {
  const player = players.get(screen)
  if (!player?.state.isPlaying) return () => {}

  clearTimer(player)
  player.state.isPlaying = false
  player.suspended = true
  emitState()

  return () => {
    const playlist = player.state.playlistId ? getPlaylist(player.state.playlistId) : null
    if (!player.suspended || players.get(screen) !== player || !playlist) return
    resumePlayer(player, playlist)
    emitState()
  }
}

function resumePlayer(player: Player, playlist: Playlist): void {
  player.suspended = false
  player.state.isPlaying = true

  if (!owns(player) && !player.applying) {
    clearTimer(player)
    void showCurrent(player, playlist)
  } else {
    scheduleNext(player, playlist)
  }
}

export function resumePlaylist(screen?: ScreenTarget): PlaylistPlaybackState[] {
  for (const player of selectPlayers(screen)) {
    const playlist = player.state.playlistId ? getPlaylist(player.state.playlistId) : null
    if (playlist) resumePlayer(player, playlist)
  }
  persist()
  emitState()
  return getPlaybackStates()
}

export async function nextItem(screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> {
  for (const player of selectPlayers(screen)) {
    if (!player.state.playlistId || player.applying) continue

    const playlist = getPlaylist(player.state.playlistId)
    if (playlist && player.lastShown === null) await showCurrent(player, playlist)
    else await advance(player)
  }
  return getPlaybackStates()
}

export async function previousItem(screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> {
  for (const player of selectPlayers(screen)) {
    if (!player.state.playlistId || player.applying) continue
    const playlist = getPlaylist(player.state.playlistId)
    if (!playlist || playlist.items.length === 0) continue

    const { order } = player.state
    const inRotation = rotationFilter(playlist, order)
    for (let step = 0; player.lastShown !== null && step < order.length; step++) {
      player.state.currentIndex = (player.state.currentIndex - 1 + order.length) % order.length
      if (inRotation(order[player.state.currentIndex])) break
    }

    await showCurrent(player, playlist)
  }
  return getPlaybackStates()
}

export function getPlaybackStates(): PlaylistPlaybackState[] {
  return [...players.values()].map((p) => p.state)
}

/** The most relevant state, for the tray */
export function getPlaybackState(): PlaylistPlaybackState {
  const states = getPlaybackStates()
  return states.find((s) => s.isPlaying) ?? states[0] ?? idleState(ALL_SCREENS)
}

function savedPlayers(): Record<ScreenTarget, SavedPlayer> {
  const saved = store.get('players')
  if (saved) return saved
  const legacyId = store.get('activePlaylistId')
  return legacyId ? { [ALL_SCREENS]: { playlistId: legacyId, isPlaying: store.get('isPlaying') } } : {}
}

function activePlaylistScreens(): ScreenTarget[] {
  return [...players.values()].filter((player) => player.state.playlistId && player.state.isPlaying).map((player) => player.state.screen)
}

export function restoreVolume(screen: ScreenTarget, wallpaperId: string): number | undefined {
  const player = players.get(screen) ?? players.get(ALL_SCREENS)
  const playlist = player?.state.playlistId ? getPlaylist(player.state.playlistId) : null
  const item = playlist && player && owns(player) && player.lastShown === wallpaperId ? findItem(playlist, wallpaperId) : undefined

  return playlist && item ? itemVolume(playlist, item) : undefined
}

function savedScreens(screen?: ScreenTarget): ScreenTarget[] {
  return savedScreensFor(Object.keys(savedPlayers()), screen)
}

// with "Don't resume playlists" restore would put the last item back without its volume
export function playlistRestoreSkipScreens(): ScreenTarget[] {
  const targets = getDisplayTargets()
  const playlists = new Map(getAllPlaylists().map((playlist) => [playlist.id, playlist]))
  const saved = Object.entries(savedPlayers())
    .filter(([screen, player]) => (playlists.get(player.playlistId)?.items.length ?? 0) > 0 && targets.includes(screen))
    // a wallpaper put on the screen by hand since is not the playlist's to hold back
    .filter(([screen, player]) => player.shownId === undefined || assignedId(screen) === player.shownId)
    .map(([screen]) => screen)

  return playlistSkipScreens(getSkipPlaylistResume(), saved, activePlaylistScreens())
}

/** Resumes the playlists active at the last close, true if any (the autostart playlist is then skipped) */

export function initPlaylistPlayer(window: BrowserWindow): boolean {
  win = window
  setBusyWallpaperSource('playlist', () =>
    [...players.values()].flatMap((p) => [p.state.currentItemId, p.applying ? p.state.order[p.state.currentIndex] : null]).filter((id): id is string => !!id)
  )
  setVolumeSource(restoreVolume)
  setPlaylistRecovery((screen) => {
    const player = players.get(screen)
    if (!player?.state.isPlaying || player.applying) return false
    void advance(player)
    return true
  })

  if (!getLweStatus().installed) return false

  let resumed = false
  const targets = getDisplayTargets()
  for (const [screen, saved] of Object.entries(getSkipPlaylistResume() ? {} : savedPlayers())) {
    const playlist = getPlaylist(saved.playlistId)
    if (!playlist || playlist.items.length === 0 || !targets.includes(screen)) continue

    const isConfiguredAutostart = saved.playlistId === getAutostartPlaylistId()
    startOn(screen, playlist, !saved.isPlaying && !isConfiguredAutostart, saved.shownId)
    resumed = true
  }
  persist()
  store.set('activePlaylistId', null)
  emitState()
  return resumed
}
