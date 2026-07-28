import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { PlaylistSettings } from '@shared/types'
import * as playlists from '../services/playlist.service'
import * as player from '../services/playlist-player.service'

export function registerPlaylistHandlers(): void {
  ipcMain.handle(IpcChannels.PLAYLIST_GET_ALL, () => playlists.getAllPlaylists())

  ipcMain.handle(IpcChannels.PLAYLIST_GET_ONE, (_e, id: string) => playlists.getPlaylist(id))

  ipcMain.handle(IpcChannels.PLAYLIST_CREATE, (_e, title: string) =>
    playlists.createPlaylist(title)
  )

  ipcMain.handle(IpcChannels.PLAYLIST_RENAME, (_e, id: string, title: string) =>
    playlists.renamePlaylist(id, title)
  )

  ipcMain.handle(IpcChannels.PLAYLIST_DELETE, (_e, id: string) => {
    if (player.getPlaybackState().playlistId === id) player.stopPlaylist()
    playlists.deletePlaylist(id)
    return { ok: true }
  })

  ipcMain.handle(
    IpcChannels.PLAYLIST_UPDATE_SETTINGS,
    (_e, id: string, patch: Partial<PlaylistSettings>) =>
      playlists.updatePlaylistSettings(id, patch)
  )

  ipcMain.handle(IpcChannels.PLAYLIST_ADD_ITEMS, (_e, id: string, wallpaperIds: string[]) =>
    playlists.addItemsToPlaylist(id, wallpaperIds)
  )

  ipcMain.handle(IpcChannels.PLAYLIST_REMOVE_ITEMS, (_e, id: string, wallpaperIds: string[]) =>
    playlists.removeItemsFromPlaylist(id, wallpaperIds)
  )

  ipcMain.handle(
    IpcChannels.PLAYLIST_REORDER_ITEMS,
    (_e, id: string, orderedWallpaperIds: string[]) =>
      playlists.reorderPlaylistItems(id, orderedWallpaperIds)
  )

  ipcMain.handle(
    IpcChannels.PLAYLIST_UPDATE_ITEM,
    (_e, id: string, wallpaperId: string, patch: { volume?: number; durationSec?: number }) =>
      playlists.updatePlaylistItem(id, wallpaperId, patch)
  )

  ipcMain.handle(IpcChannels.PLAYLIST_START, (_e, id: string) => player.startPlaylist(id))
  ipcMain.handle(IpcChannels.PLAYLIST_PLAY_ITEM, (_e, id: string, wallpaperId: string) =>
    player.playItem(id, wallpaperId)
  )
  ipcMain.handle(IpcChannels.PLAYLIST_STOP, () => player.stopPlaylist())
  ipcMain.handle(IpcChannels.PLAYLIST_PAUSE, () => player.pausePlaylist())
  ipcMain.handle(IpcChannels.PLAYLIST_RESUME, () => player.resumePlaylist())
  ipcMain.handle(IpcChannels.PLAYLIST_NEXT, () => player.nextItem())
  ipcMain.handle(IpcChannels.PLAYLIST_PREVIOUS, () => player.previousItem())
  ipcMain.handle(IpcChannels.PLAYLIST_GET_STATE, () => player.getPlaybackState())
}
