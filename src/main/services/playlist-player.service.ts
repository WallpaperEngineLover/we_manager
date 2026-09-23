import Store from 'electron-store'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { Playlist, PlaylistItem, PlaylistPlaybackState } from '@shared/types'
import { getPlaylist } from './playlist.service'
import { getWallpaper, updateWallpaper } from './library.service'
import { applyWallpaperMeta } from './wallpaper.service'
import { setActiveWallpaperId } from './wallpaper-state.service'
import { getLweStatus } from './lwe.service'
import { getAutostartPlaylistId } from './config.service'
import { findWallpaperVideoFile, getVideoDurationSec } from '../utils/video'

interface PlaybackStore {
  activePlaylistId: string | null
  isPlaying: boolean
}

const store = new Store<PlaybackStore>({
  name: 'playlist-playback',
  defaults: { activePlaylistId: null, isPlaying: false }
})

let win: BrowserWindow | null = null
let timer: NodeJS.Timeout | null = null
let applying = false
let scheduleToken = 0
const listeners = new Set<() => void>()

/** Subscribe to playback state changes (used by the tray to keep its menu labels accurate). */
export function onPlaybackStateChanged(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

let state: PlaylistPlaybackState = {
  playlistId: null,
  currentItemId: null,
  currentIndex: -1,
  isPlaying: false,
  order: []
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

function clearTimer(): void {
  scheduleToken++
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function emitState(): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.EVENT_PLAYLIST_STATE_CHANGED, state)
  }
  for (const cb of listeners) cb()
}

function findItem(playlist: Playlist, wallpaperId: string): PlaylistItem | undefined {
  return playlist.items.find((i) => i.wallpaperId === wallpaperId)
}

async function applyCurrent(playlist: Playlist): Promise<void> {
  const wallpaperId = state.order[state.currentIndex]
  if (!wallpaperId) return

  const wallpaper = getWallpaper(wallpaperId)
  if (!wallpaper) return

  const item = findItem(playlist, wallpaperId)
  const volume = item?.volume ?? playlist.settings.defaultVolume

  applying = true
  try {
    await applyWallpaperMeta(wallpaper, { volume, dependencyPrompt: 'once' })
    setActiveWallpaperId(wallpaperId)
    updateWallpaper(wallpaperId, {
      appliedCount: (wallpaper.appliedCount ?? 0) + 1,
      lastAppliedAt: Date.now()
    })
    state.currentItemId = wallpaperId
  } catch (err) {
    console.error('[PlaylistPlayer] Failed to apply wallpaper:', err)
  } finally {
    applying = false
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

function scheduleNext(playlist: Playlist): void {
  clearTimer()
  if (!state.isPlaying) return

  const wallpaperId = state.order[state.currentIndex]
  const item = wallpaperId ? findItem(playlist, wallpaperId) : undefined
  const durationSec = item?.durationSec ?? playlist.settings.defaultDurationSec
  const token = scheduleToken

  const arm = (sec: number): void => {
    timer = setTimeout(() => {
      void advance()
    }, sec * 1000)
  }

  if (!playlist.settings.finishVideos || !wallpaperId) {
    arm(durationSec)
    return
  }

  void getVideoLengthSec(wallpaperId).then((videoSec) => {
    if (token !== scheduleToken) return
    if (videoSec !== undefined && videoSec > durationSec) {
      arm(videoSec + VIDEO_END_GRACE_SEC)
    } else {
      arm(durationSec)
    }
  })
}

async function advance(): Promise<void> {
  if (!state.playlistId) return
  const playlist = getPlaylist(state.playlistId)
  if (!playlist || playlist.items.length === 0) {
    stopPlaylist()
    return
  }

  state.currentIndex++
  if (state.currentIndex >= state.order.length) {
    // Loop: rebuild order (reshuffles if randomize is on)
    state.order = buildOrder(playlist)
    state.currentIndex = 0
  }

  await applyCurrent(playlist)
  emitState()
  scheduleNext(playlist)
}

export function startPlaylist(id: string): PlaylistPlaybackState {
  const playlist = getPlaylist(id)
  if (!playlist) throw new Error(`Playlist ${id} not found`)
  if (playlist.items.length === 0) throw new Error('Playlist has no wallpapers')

  clearTimer()
  state = {
    playlistId: playlist.id,
    currentItemId: null,
    currentIndex: 0,
    isPlaying: true,
    order: buildOrder(playlist)
  }
  store.set('activePlaylistId', playlist.id)
  store.set('isPlaying', true)

  void applyCurrent(playlist).then(() => {
    emitState()
    scheduleNext(playlist)
  })
  emitState()

  return state
}

export async function playItem(playlistId: string, wallpaperId: string): Promise<PlaylistPlaybackState> {
  const playlist = getPlaylist(playlistId)
  if (!playlist) throw new Error(`Playlist ${playlistId} not found`)
  if (!findItem(playlist, wallpaperId)) throw new Error(`Wallpaper ${wallpaperId} is not in this playlist`)

  clearTimer()
  if (state.playlistId !== playlistId) {
    state = {
      playlistId: playlist.id,
      currentItemId: null,
      currentIndex: -1,
      isPlaying: true,
      order: buildOrder(playlist)
    }
  }

  let index = state.order.indexOf(wallpaperId)
  if (index === -1) {
    state.order = buildOrder(playlist)
    index = state.order.indexOf(wallpaperId)
  }
  state.currentIndex = index
  state.isPlaying = true
  store.set('activePlaylistId', playlist.id)
  store.set('isPlaying', true)

  await applyCurrent(playlist)
  emitState()
  scheduleNext(playlist)
  return state
}

export function stopPlaylist(): PlaylistPlaybackState {
  clearTimer()
  state = { playlistId: null, currentItemId: null, currentIndex: -1, isPlaying: false, order: [] }
  store.set('activePlaylistId', null)
  store.set('isPlaying', false)
  emitState()
  return state
}

export function pausePlaylist(): PlaylistPlaybackState {
  if (!state.playlistId) return state
  clearTimer()
  state.isPlaying = false
  store.set('isPlaying', false)
  emitState()
  return state
}

export function resumePlaylist(): PlaylistPlaybackState {
  if (!state.playlistId) return state
  const playlist = getPlaylist(state.playlistId)
  if (!playlist) return state
  state.isPlaying = true
  store.set('isPlaying', true)
  scheduleNext(playlist)
  emitState()
  return state
}

export async function nextItem(): Promise<PlaylistPlaybackState> {
  if (!state.playlistId || applying) return state
  const playlist = getPlaylist(state.playlistId)
  if (!playlist) return state
  await advance()
  return state
}

export async function previousItem(): Promise<PlaylistPlaybackState> {
  if (!state.playlistId || applying) return state
  const playlist = getPlaylist(state.playlistId)
  if (!playlist || playlist.items.length === 0) return state

  state.currentIndex--
  if (state.currentIndex < 0) state.currentIndex = state.order.length - 1

  await applyCurrent(playlist)
  emitState()
  scheduleNext(playlist)
  return state
}

export function getPlaybackState(): PlaylistPlaybackState {
  return state
}

/**
 * Call once on app startup. Resumes whichever playlist was active when the app last
 * closed. Returns true if a playlist was resumed, so the caller can skip the
 * "autostart playlist" config setting to avoid starting two playlists at once.
 * Does nothing if linux-wallpaperengine isn't installed.
 */
export function initPlaylistPlayer(window: BrowserWindow): boolean {
  win = window
  const activeId = store.get('activePlaylistId')
  if (!activeId) return false
  const playlist = getPlaylist(activeId)
  if (!playlist || playlist.items.length === 0) return false
  if (!getLweStatus().installed) return false

  const wasPlaying = store.get('isPlaying')
  const isConfiguredAutostart = activeId === getAutostartPlaylistId()
  startPlaylist(activeId)
  if (!wasPlaying && !isConfiguredAutostart) pausePlaylist()
  return true
}
