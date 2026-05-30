import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { IpcChannels } from '@shared/ipc-channels'
import * as steam from '../services/steam.service'
import * as library from '../services/library.service'

export function registerSteamHandlers(win: BrowserWindow): void {
  ipcMain.handle(IpcChannels.STEAM_IS_RUNNING, () => {
    return steam.isSteamRunning()
  })

  ipcMain.handle(IpcChannels.STEAM_SUBSCRIBE, async (_e, itemId: string) => {
    await steam.subscribeToItem(BigInt(itemId))

    // Poll download progress (1s is plenty for UI updates)
    const pollInterval = setInterval(() => {
      const info = steam.getDownloadInfo(BigInt(itemId))
      if (!info) {
        clearInterval(pollInterval)
        win.webContents.send(IpcChannels.EVENT_DOWNLOAD_PROGRESS, {
          itemId,
          bytesDownloaded: 0,
          bytesTotal: 0,
          percentage: 100,
          status: 'completed'
        })
        return
      }
      win.webContents.send(IpcChannels.EVENT_DOWNLOAD_PROGRESS, info)
    }, 1000)

    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_UNSUBSCRIBE, async (_e, itemId: string) => {
    const wallpaper = library.getWallpaper(itemId)
    await steam.unsubscribeFromItem(BigInt(itemId))
    if (wallpaper?.localPath) {
      try { fs.rmSync(wallpaper.localPath, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    library.deleteWallpaper(itemId)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_VOTE, (_e, itemId: string, voteUp: boolean) => {
    steam.voteOnItem(BigInt(itemId), voteUp)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_OPEN_WORKSHOP, (_e, itemId: string) => {
    steam.openWorkshopItemOverlay(BigInt(itemId))
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_GET_VOTED_IDS, async () => {
    return steam.getVotedUpItemIds()
  })

  ipcMain.handle(IpcChannels.STEAM_GET_SUBSCRIBED, () => {
    return steam.getSubscribedItems()
  })

  ipcMain.handle(IpcChannels.STEAM_DOWNLOAD_INFO, (_e, itemId: string) => {
    return steam.getDownloadInfo(BigInt(itemId))
  })

  ipcMain.handle(IpcChannels.STEAM_ITEM_STATE, (_e, itemId: string) => {
    return steam.getItemState(BigInt(itemId))
  })

  ipcMain.handle(IpcChannels.STEAM_INSTALL_INFO, (_e, itemId: string) => {
    return steam.getInstallInfo(BigInt(itemId))
  })
}
