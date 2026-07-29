import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { IpcChannels } from '@shared/ipc-channels'
import * as steam from '../services/steam.service'
import * as library from '../services/library.service'
import * as backup from '../services/backup.service'

function startDownloadPoll(win: BrowserWindow, itemId: string): void {
  const idBig = BigInt(itemId)
  const pollInterval = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(pollInterval)
      return
    }
    const info = steam.getDownloadInfo(idBig)
    if (info) {
      win.webContents.send(IpcChannels.EVENT_DOWNLOAD_PROGRESS, info)
      return
    }
    if (steam.isItemDownloading(idBig)) return // queued/pending, no progress numbers yet

    clearInterval(pollInterval)
    library.importWallpaperById(itemId).then((meta) => {
      if (win.isDestroyed()) return
      const success = !!meta && !meta.downloading && !meta.downloadFailed
      win.webContents.send(IpcChannels.EVENT_DOWNLOAD_PROGRESS, {
        itemId,
        bytesDownloaded: 0,
        bytesTotal: 0,
        percentage: success ? 100 : 0,
        status: success ? 'completed' : 'error'
      })
    })
  }, 1000)
}

export function registerSteamHandlers(win: BrowserWindow): void {
  ipcMain.handle(IpcChannels.STEAM_IS_RUNNING, () => {
    return steam.isSteamRunning()
  })

  ipcMain.handle(IpcChannels.STEAM_SUBSCRIBE, async (_e, itemId: string) => {
    await steam.subscribeToItem(BigInt(itemId))
    startDownloadPoll(win, itemId)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_UNSUBSCRIBE, async (_e, itemId: string) => {
    const wallpaper = library.getWallpaper(itemId)
    await steam.unsubscribeFromItem(BigInt(itemId))
    if (wallpaper?.localPath) {
      try { fs.rmSync(wallpaper.localPath, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    if (wallpaper?.backedUp && backup.isBackedUp(itemId)) {
      library.updateWallpaper(itemId, {
        source: 'backup',
        localPath: backup.getBackupDir(itemId),
        subscribed: false
      })
    } else {
      library.deleteWallpaper(itemId)
    }
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_REDOWNLOAD, async (_e, itemId: string) => {
    const wallpaper = library.getWallpaper(itemId)
    await steam.unsubscribeFromItem(BigInt(itemId))
    if (wallpaper?.localPath) {
      try { fs.rmSync(wallpaper.localPath, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    if (wallpaper) {
      library.updateWallpaper(itemId, { downloading: true, downloadFailed: false })
    }
    await steam.subscribeToItem(BigInt(itemId))
    startDownloadPoll(win, itemId)
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
