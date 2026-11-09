import { app, ipcMain, BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { OptimizeOptions } from '@shared/video-tools'
import * as tools from '../services/video-tools.service'
import { getVideoToolSettings, setVideoToolSettings } from '../services/config.service'

export function registerVideoToolsHandlers(win: BrowserWindow): void {
  app.on('will-quit', tools.discardStagedOnExit)
  setTimeout(() => { void tools.sweepOptimizeLeftovers() }, 20_000)
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) tools.abandonOptimize()
  })

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_STATUS, () => tools.getVideoToolsStatus())

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_DOWNLOAD, async () => {
    await tools.downloadFfmpeg(win)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_REMOVE, async () => {
    await tools.removeDownloadedFfmpeg()
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_PROBE, (_e, itemId: string) => tools.probeWallpaper(itemId))

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_START, (_e, itemId: string, options: OptimizeOptions) =>
    tools.startOptimize(itemId, options, win)
  )

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_CANCEL, () => {
    tools.cancelOptimize()
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_FINISH, async (_e, itemId: string, keep: boolean) => {
    await tools.finishOptimize(itemId, keep)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_GET_SETTINGS, () => getVideoToolSettings())

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_SET_SETTINGS, (_e, settings: unknown) => setVideoToolSettings(settings))

  ipcMain.handle(IpcChannels.VIDEO_TOOLS_QUICK, (_e, ids: string[], trim?: boolean) => tools.quickOptimize(ids, win, trim === true))
  ipcMain.handle(IpcChannels.VIDEO_TOOLS_QUICK_TRIMS, (_e, ids: string[]) => tools.quickTrims(ids))
}
