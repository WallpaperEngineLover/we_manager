import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { Playlist, PlaylistItem, PlaylistSettings } from '@shared/types'
import { findAndMutate } from '../utils/collections'

interface PlaylistStore {
  playlists: Playlist[]
}

const DEFAULT_SETTINGS: PlaylistSettings = {
  randomize: false,
  sortBy: 'manual',
  defaultDurationSec: 600,
  defaultVolume: 100
}

const store = new Store<PlaylistStore>({
  name: 'playlists',
  defaults: { playlists: [] }
})

function updatePlaylist(id: string, mutate: (playlist: Playlist) => void | false): Playlist | null {
  const playlists = store.get('playlists')
  const playlist = findAndMutate(playlists, id, (p) => {
    if (mutate(p) === false) return false
    p.updatedAt = Date.now()
  })
  if (playlist) store.set('playlists', playlists)
  return playlist
}

export function getAllPlaylists(): Playlist[] {
  return store.get('playlists')
}

export function getPlaylist(id: string): Playlist | null {
  return store.get('playlists').find((p) => p.id === id) ?? null
}

export function createPlaylist(title: string): Playlist {
  const now = Date.now()
  const playlist: Playlist = {
    id: randomUUID(),
    title,
    items: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now
  }
  const playlists = store.get('playlists')
  playlists.push(playlist)
  store.set('playlists', playlists)
  return playlist
}

export function renamePlaylist(id: string, title: string): Playlist | null {
  return updatePlaylist(id, (playlist) => {
    playlist.title = title
  })
}

export function deletePlaylist(id: string): void {
  const playlists = store.get('playlists').filter((p) => p.id !== id)
  store.set('playlists', playlists)
}

export function updatePlaylistSettings(
  id: string,
  patch: Partial<PlaylistSettings>
): Playlist | null {
  return updatePlaylist(id, (playlist) => {
    playlist.settings = { ...playlist.settings, ...patch }
  })
}

export function addItemsToPlaylist(id: string, wallpaperIds: string[]): Playlist | null {
  return updatePlaylist(id, (playlist) => {
    const existing = new Set(playlist.items.map((i) => i.wallpaperId))
    for (const wallpaperId of wallpaperIds) {
      if (!existing.has(wallpaperId)) {
        playlist.items.push({ wallpaperId })
        existing.add(wallpaperId)
      }
    }
  })
}

export function removeItemsFromPlaylist(id: string, wallpaperIds: string[]): Playlist | null {
  return updatePlaylist(id, (playlist) => {
    const remove = new Set(wallpaperIds)
    playlist.items = playlist.items.filter((i) => !remove.has(i.wallpaperId))
  })
}

/** Reorders items to match the given wallpaperId sequence (used for manual drag-reorder). */
export function reorderPlaylistItems(id: string, orderedWallpaperIds: string[]): Playlist | null {
  return updatePlaylist(id, (playlist) => {
    const byId = new Map(playlist.items.map((i) => [i.wallpaperId, i]))
    const reordered: PlaylistItem[] = []
    for (const wallpaperId of orderedWallpaperIds) {
      const item = byId.get(wallpaperId)
      if (item) {
        reordered.push(item)
        byId.delete(wallpaperId)
      }
    }
    // Append anything not mentioned in orderedWallpaperIds (defensive, shouldn't normally happen)
    reordered.push(...byId.values())
    playlist.items = reordered
  })
}

export function updatePlaylistItem(
  id: string,
  wallpaperId: string,
  patch: { volume?: number; durationSec?: number }
): Playlist | null {
  return updatePlaylist(id, (playlist) => {
    const item = playlist.items.find((i) => i.wallpaperId === wallpaperId)
    if (!item) return false
    if ('volume' in patch) item.volume = patch.volume
    if ('durationSec' in patch) item.durationSec = patch.durationSec
  })
}

/**
 * Remove playlist item references that don't exist in the library anymore.
 * Returns the number of stale references removed.
 */
export function cleanupPlaylists(validWallpaperIds: Set<string>): number {
  const playlists = store.get('playlists')
  let removed = 0

  for (const playlist of playlists) {
    const before = playlist.items.length
    playlist.items = playlist.items.filter((i) => validWallpaperIds.has(i.wallpaperId))
    removed += before - playlist.items.length
  }

  if (removed > 0) {
    store.set('playlists', playlists)
    console.log(`[Playlist] Cleanup: removed ${removed} stale item(s)`)
  }

  return removed
}
