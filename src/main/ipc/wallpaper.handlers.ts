import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { detectEnvironment } from '../services/wallpaper.service'
import { getWallpaper, updateWallpaper } from '../services/library.service'
import { getActiveWallpaperId } from '../services/wallpaper-state.service'
import { pausePlaylist } from '../services/playlist-player.service'
import {
  expandScreen,
  getDisplayTargets,
  getScreenAssignments,
  showWallpaper,
  stopDisplay,
  testFreshLaunch
} from '../services/display.service'
import type { ApplyWallpaperOptions, ScreenTarget } from '@shared/types'
import { deleteThumbnail, generateThumbnail, IMAGE_EXTENSIONS, useThumbnailFile } from '../services/thumbnail.service'

export function registerWallpaperHandlers(): void {
  ipcMain.handle(IpcChannels.WALLPAPER_DETECT_ENV, () => {
    return detectEnvironment()
  })

  ipcMain.handle(IpcChannels.WALLPAPER_GET_ACTIVE, () => {
    const id = getActiveWallpaperId()
    return id ? getWallpaper(id) : null
  })

  ipcMain.handle(IpcChannels.WALLPAPER_GET_ASSIGNMENTS, () => getScreenAssignments())

  ipcMain.handle(IpcChannels.WALLPAPER_GET_TARGETS, () => getDisplayTargets())

  ipcMain.handle(IpcChannels.WALLPAPER_APPLY, async (_e, options: ApplyWallpaperOptions) => {
    const wallpaper = getWallpaper(options.wallpaperId)
    if (!wallpaper) throw new Error(`Wallpaper ${options.wallpaperId} not found in library`)

    // a playlist would replace it again on its next switch
    for (const screen of expandScreen(options.screen)) pausePlaylist(screen)

    const appliedPath = await showWallpaper(wallpaper, options.screen, { backend: options.backend })

    updateWallpaper(options.wallpaperId, {
      appliedCount: (wallpaper.appliedCount ?? 0) + 1,
      lastAppliedAt: Date.now()
    })

    return { ok: true, appliedPath }
  })

  ipcMain.handle(IpcChannels.WALLPAPER_STOP, async (_e, screen?: ScreenTarget) => {
    for (const s of expandScreen(screen)) pausePlaylist(s)
    await stopDisplay(screen)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.WALLPAPER_TEST_LAUNCH, async (_e, wallpaperId: string, screen?: ScreenTarget) => {
    for (const s of expandScreen(screen).slice(0, 1)) pausePlaylist(s)
    await testFreshLaunch(wallpaperId, screen)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.WALLPAPER_GENERATE_THUMBNAIL, (_e, wallpaperId: string) => generateThumbnail(wallpaperId))

  ipcMain.handle(IpcChannels.WALLPAPER_PICK_THUMBNAIL, async (_e, wallpaperId: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const options = {
      properties: ['openFile' as const],
      title: 'Choose a thumbnail',
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS.map((e) => e.slice(1)) }]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return useThumbnailFile(wallpaperId, result.filePaths[0])
  })

  ipcMain.handle(IpcChannels.WALLPAPER_DELETE_THUMBNAIL, (_e, wallpaperId: string) => deleteThumbnail(wallpaperId))
}
