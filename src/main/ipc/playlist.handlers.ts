import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { PlaylistSettings, ScreenTarget } from '@shared/types'
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
    for (const state of player.getPlaybackStates()) {
      if (state.playlistId === id) player.stopPlaylist(state.screen)
    }
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

  ipcMain.handle(IpcChannels.PLAYLIST_START, (_e, id: string, screen?: ScreenTarget) =>
    player.startPlaylist(id, screen)
  )
  ipcMain.handle(IpcChannels.PLAYLIST_PLAY_ITEM, (_e, id: string, wallpaperId: string, screen?: ScreenTarget) =>
    player.playItem(id, wallpaperId, screen)
  )
  ipcMain.handle(IpcChannels.PLAYLIST_STOP, (_e, screen?: ScreenTarget) => player.stopPlaylist(screen))
  ipcMain.handle(IpcChannels.PLAYLIST_PAUSE, (_e, screen?: ScreenTarget) => player.pausePlaylist(screen))
  ipcMain.handle(IpcChannels.PLAYLIST_RESUME, (_e, screen?: ScreenTarget) => player.resumePlaylist(screen))
  ipcMain.handle(IpcChannels.PLAYLIST_NEXT, (_e, screen?: ScreenTarget) => player.nextItem(screen))
  ipcMain.handle(IpcChannels.PLAYLIST_PREVIOUS, (_e, screen?: ScreenTarget) => player.previousItem(screen))
  ipcMain.handle(IpcChannels.PLAYLIST_GET_STATE, () => player.getPlaybackStates())
}
