import Store from 'electron-store'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { Playlist, PlaylistItem, PlaylistPlaybackState, ScreenTarget } from '@shared/types'
import { compatStatus } from '@shared/compat'
import { getPlaylist } from './playlist.service'
import { getWallpaper, updateWallpaper } from './library.service'
import { getLweStatus, ALL_SCREENS } from './lwe.service'
import { getAutostartPlaylistId } from './config.service'
import { expandScreen, getDisplayTargets, setPlaylistRecovery, showWallpaper } from './display.service'
import { findWallpaperVideoFile, getVideoDurationSec } from '../utils/video'

interface SavedPlayer {
  playlistId: string
  isPlaying: boolean
}

interface PlaybackStore {
  /** Written by older versions, which only had the one player */
  activePlaylistId: string | null
  isPlaying: boolean
  players: Record<ScreenTarget, SavedPlayer> | null
}

const store = new Store<PlaybackStore>({
  name: 'playlist-playback',
  defaults: { activePlaylistId: null, isPlaying: false, players: null }
})

interface Player {
  state: PlaylistPlaybackState
  timer: NodeJS.Timeout | null
  scheduleToken: number
  applying: boolean
}

let win: BrowserWindow | null = null
const players = new Map<ScreenTarget, Player>()
const listeners = new Set<() => void>()

/** Subscribe to playback state changes (used by the tray to keep its menu labels accurate). */
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
      // manual: keep playlist item order as-is
      break
  }
  return items.map((i) => i.wallpaperId)
}

function persist(): void {
  const saved: Record<ScreenTarget, SavedPlayer> = {}
  for (const [screen, p] of players) {
    if (p.state.playlistId) saved[screen] = { playlistId: p.state.playlistId, isPlaying: p.state.isPlaying }
  }
  store.set('players', saved)
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

function findItem(playlist: Playlist, wallpaperId: string): PlaylistItem | undefined {
  return playlist.items.find((i) => i.wallpaperId === wallpaperId)
}

/**
 * Shows the current item, moving on to the next one when it can't be shown. Wallpapers known to
 * crash on launch are passed over without trying, as long as something else is left to play.
 */
async function applyCurrent(player: Player, playlist: Playlist): Promise<void> {
  const { state } = player
  const count = state.order.length
  const known = (id: string) => compatStatus(getWallpaper(id)?.compat) !== 'crashes'
  const anyPlayable = state.order.some(known)

  player.applying = true
  try {
    for (let tries = 0; tries < count; tries++, state.currentIndex = (state.currentIndex + 1) % count) {
      const wallpaper = getWallpaper(state.order[state.currentIndex])
      if (!wallpaper || (anyPlayable && !known(wallpaper.id))) continue

      const item = findItem(playlist, wallpaper.id)
      try {
        await showWallpaper(wallpaper, state.screen, {
          volume: item?.volume ?? playlist.settings.defaultVolume,
          dependencyPrompt: 'once'
        })
      } catch (err) {
        console.error('[PlaylistPlayer] Failed to apply wallpaper:', err)
        continue
      }
      updateWallpaper(wallpaper.id, {
        appliedCount: (wallpaper.appliedCount ?? 0) + 1,
        lastAppliedAt: Date.now()
      })
      state.currentItemId = wallpaper.id
      return
    }
  } finally {
    player.applying = false
  }
}

// Small margin so the last frames aren't cut off by engine startup/hotswap time
const VIDEO_END_GRACE_SEC = 2

async function getVideoLengthSec(wallpaperId: string): Promise<number | undefined> {
  const wallpaper = getWallpaper(wallpaperId)
  if (wallpaper?.type !== 'video' || !wallpaper.localPath) return undefined
  const videoFile = findWallpaperVideoFile(wallpaper.localPath, wallpaper.file)
  return videoFile ? getVideoDurationSec(videoFile) : undefined
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
  if (!player.state.playlistId) return
  const playlist = getPlaylist(player.state.playlistId)
  if (!playlist || playlist.items.length === 0) {
    stopPlaylist(player.state.screen)
    return
  }

  player.state.currentIndex++
  if (player.state.currentIndex >= player.state.order.length) {
    // Loop: rebuild order (reshuffles if randomize is on)
    player.state.order = buildOrder(playlist)
    player.state.currentIndex = 0
  }

  await applyCurrent(player, playlist)
  emitState()
  scheduleNext(player, playlist)
}

function playerFor(screen: ScreenTarget): Player {
  let player = players.get(screen)
  if (!player) {
    player = { state: idleState(screen), timer: null, scheduleToken: 0, applying: false }
    players.set(screen, player)
  }
  return player
}

/** Players the given screen selection refers to; nothing given means every screen */
function selectPlayers(screen?: ScreenTarget): Player[] {
  if (screen === undefined || screen === ALL_SCREENS) return [...players.values()]
  const player = players.get(screen)
  return player ? [player] : []
}

function startOn(screen: ScreenTarget, playlist: Playlist): PlaylistPlaybackState {
  const player = playerFor(screen)
  clearTimer(player)
  player.state = {
    screen,
    playlistId: playlist.id,
    currentItemId: null,
    currentIndex: 0,
    isPlaying: true,
    order: buildOrder(playlist)
  }

  void applyCurrent(player, playlist).then(() => {
    emitState()
    scheduleNext(player, playlist)
  })
  return player.state
}

export function startPlaylist(id: string, screen?: ScreenTarget): PlaylistPlaybackState[] {
  const playlist = getPlaylist(id)
  if (!playlist) throw new Error(`Playlist ${id} not found`)
  if (playlist.items.length === 0) throw new Error('Playlist has no wallpapers')

  const targets = expandScreen(screen)
  if (targets.length === 0) throw new Error(`Screen ${screen} is not connected`)
  // players on screens that no longer exist in this mode would fight over the same engine
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
    }

    let index = player.state.order.indexOf(wallpaperId)
    if (index === -1) {
      player.state.order = buildOrder(playlist)
      index = player.state.order.indexOf(wallpaperId)
    }
    player.state.currentIndex = index
    player.state.isPlaying = true

    await applyCurrent(player, playlist)
    scheduleNext(player, playlist)
  }
  persist()
  emitState()
  return getPlaybackStates()
}

export function stopPlaylist(screen?: ScreenTarget): PlaylistPlaybackState[] {
  for (const player of selectPlayers(screen)) {
    clearTimer(player)
    players.delete(player.state.screen)
  }
  persist()
  emitState()
  return getPlaybackStates()
}

export function pausePlaylist(screen?: ScreenTarget): PlaylistPlaybackState[] {
  for (const player of selectPlayers(screen)) {
    if (!player.state.playlistId) continue
    clearTimer(player)
    player.state.isPlaying = false
  }
  persist()
  emitState()
  return getPlaybackStates()
}

export function resumePlaylist(screen?: ScreenTarget): PlaylistPlaybackState[] {
  for (const player of selectPlayers(screen)) {
    const playlist = player.state.playlistId ? getPlaylist(player.state.playlistId) : null
    if (!playlist) continue
    player.state.isPlaying = true
    scheduleNext(player, playlist)
  }
  persist()
  emitState()
  return getPlaybackStates()
}

export async function nextItem(screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> {
  for (const player of selectPlayers(screen)) {
    if (!player.state.playlistId || player.applying) continue
    await advance(player)
  }
  return getPlaybackStates()
}

export async function previousItem(screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> {
  for (const player of selectPlayers(screen)) {
    if (!player.state.playlistId || player.applying) continue
    const playlist = getPlaylist(player.state.playlistId)
    if (!playlist || playlist.items.length === 0) continue

    player.state.currentIndex--
    if (player.state.currentIndex < 0) player.state.currentIndex = player.state.order.length - 1

    await applyCurrent(player, playlist)
    scheduleNext(player, playlist)
  }
  emitState()
  return getPlaybackStates()
}

export function getPlaybackStates(): PlaylistPlaybackState[] {
  return [...players.values()].map((p) => p.state)
}

/** The one state that matters most, for places with room for only one (the tray) */
export function getPlaybackState(): PlaylistPlaybackState {
  const states = getPlaybackStates()
  return states.find((s) => s.isPlaying) ?? states[0] ?? idleState(ALL_SCREENS)
}

export function isPlayingOn(screen: ScreenTarget): boolean {
  return selectPlayers(screen).some((p) => p.state.isPlaying)
}

function savedPlayers(): Record<ScreenTarget, SavedPlayer> {
  const saved = store.get('players')
  if (saved) return saved
  const legacyId = store.get('activePlaylistId')
  return legacyId ? { [ALL_SCREENS]: { playlistId: legacyId, isPlaying: store.get('isPlaying') } } : {}
}

/**
 * Call once on app startup. Resumes the playlists that were active when the app last closed.
 * Returns true if any was resumed, so the caller can skip the "autostart playlist" config setting
 * to avoid starting two playlists at once. Does nothing if linux-wallpaperengine isn't installed.
 */
export function initPlaylistPlayer(window: BrowserWindow): boolean {
  win = window
  setPlaylistRecovery((screen) => {
    const player = players.get(screen)
    if (!player?.state.isPlaying || player.applying) return false
    void advance(player)
    return true
  })

  if (!getLweStatus().installed) return false

  let resumed = false
  const targets = getDisplayTargets()
  for (const [screen, saved] of Object.entries(savedPlayers())) {
    const playlist = getPlaylist(saved.playlistId)
    if (!playlist || playlist.items.length === 0 || !targets.includes(screen)) continue

    startOn(screen, playlist)
    resumed = true
    const isConfiguredAutostart = saved.playlistId === getAutostartPlaylistId()
    if (!saved.isPlaying && !isConfiguredAutostart) pausePlaylist(screen)
  }
  store.set('activePlaylistId', null)
  persist()
  emitState()
  return resumed
}
