import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { applyWallpaperMeta, detectEnvironment } from '../services/wallpaper.service'
import { getWallpaper, updateWallpaper } from '../services/library.service'
import { setActiveWallpaperId, getActiveWallpaperId } from '../services/wallpaper-state.service'
import type { ApplyWallpaperOptions } from '@shared/types'

export function registerWallpaperHandlers(): void {
  ipcMain.handle(IpcChannels.WALLPAPER_DETECT_ENV, () => {
    return detectEnvironment()
  })

  ipcMain.handle(IpcChannels.WALLPAPER_GET_ACTIVE, () => {
    const id = getActiveWallpaperId()
    return id ? getWallpaper(id) : null
  })

  ipcMain.handle(IpcChannels.WALLPAPER_APPLY, async (_e, options: ApplyWallpaperOptions) => {
    const wallpaper = getWallpaper(options.wallpaperId)
    if (!wallpaper) throw new Error(`Wallpaper ${options.wallpaperId} not found in library`)

    const appliedPath = await applyWallpaperMeta(wallpaper, { backend: options.backend })

    setActiveWallpaperId(options.wallpaperId)
    updateWallpaper(options.wallpaperId, {
      appliedCount: (wallpaper.appliedCount ?? 0) + 1,
      lastAppliedAt: Date.now()
    })

    return { ok: true, appliedPath }
  })
}
