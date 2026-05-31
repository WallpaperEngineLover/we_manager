import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import * as library from '../services/library.service'
import type { LibraryFilters, WallpaperMeta } from '@shared/types'


export function registerLibraryHandlers(): void {
  ipcMain.handle(IpcChannels.LIBRARY_GET_ALL, (_e, filters?: LibraryFilters) => {
    return library.getAllWallpapers(filters)
  })

  ipcMain.handle(IpcChannels.LIBRARY_GET_ONE, (_e, id: string) => {
    return library.getWallpaper(id)
  })

  ipcMain.handle(IpcChannels.LIBRARY_UPDATE, (_e, id: string, patch: Partial<WallpaperMeta>) => {
    library.updateWallpaper(id, patch)
    return library.getWallpaper(id)
  })

  ipcMain.handle(IpcChannels.LIBRARY_DELETE, (_e, id: string) => {
    library.deleteWallpaper(id)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.LIBRARY_ADD_TAG, (_e, id: string, tag: string) => {
    library.addTag(id, tag)
    return library.getWallpaper(id)
  })

  ipcMain.handle(IpcChannels.LIBRARY_REMOVE_TAG, (_e, id: string, tag: string) => {
    library.removeTag(id, tag)
    return library.getWallpaper(id)
  })

  ipcMain.handle(IpcChannels.LIBRARY_GET_TAGS, () => {
    return library.getAllTags()
  })

  ipcMain.handle(IpcChannels.LIBRARY_SEARCH, (_e, query: string) => {
    return library.getAllWallpapers({ searchText: query })
  })

  ipcMain.handle(IpcChannels.LIBRARY_SCAN, () => {
    return library.scanLibrary()
  })

  ipcMain.handle(IpcChannels.LIBRARY_DISTINCT_TAGS, () => {
    return library.getDistinctTags()
  })

  ipcMain.handle(IpcChannels.LIBRARY_RESET_FPS_OVERRIDES, () => {
    return library.resetAllFpsOverrides()
  })
}
