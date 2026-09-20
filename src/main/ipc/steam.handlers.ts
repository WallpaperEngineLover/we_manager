import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { IpcChannels } from '@shared/ipc-channels'
import * as steam from '../services/steam.service'
import * as library from '../services/library.service'
import * as backup from '../services/backup.service'
import { setDependencyInstaller } from '../services/dependency.service'

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
  setDependencyInstaller(async (itemId) => {
    await steam.subscribeToItem(BigInt(itemId))
    steam.downloadItem(BigInt(itemId))
    startDownloadPoll(win, itemId)
  })

  ipcMain.handle(IpcChannels.STEAM_IS_RUNNING, () => {
    return steam.isSteamRunning()
  })

  ipcMain.handle(IpcChannels.STEAM_SUBSCRIBE, async (_e, itemId: string) => {
    await steam.subscribeToItem(BigInt(itemId))
    // Steam doesn't always actually start fetching content just because we subscribed - see
    // downloadItem()'s comment. This is the reliable kick.
    steam.downloadItem(BigInt(itemId))
    startDownloadPoll(win, itemId)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_UNSUBSCRIBE, async (_e, itemId: string) => {
    const wallpaper = library.getWallpaper(itemId)
    await steam.unsubscribeFromItem(BigInt(itemId))
    if (wallpaper?.localPath) {
      // async: an unresponsive mount here must not block the main process (and every other
      // pending IPC call) while it deletes
      try { await fs.promises.rm(wallpaper.localPath, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    // Trust the stored flag alone: it's set once, when a backup actually succeeds. Re-checking
    // the filesystem here (backup.isBackedUp) can disagree with it - e.g. if the configured
    // backup folder changed since - and must never be allowed to turn "this is backed up" into
    // "delete the library entry".
    if (wallpaper?.backedUp) {
      // getBackupDir() throws if the backup path setting was since cleared entirely - still
      // must not fall through to deleting a wallpaper we know is backed up.
      try {
        library.updateWallpaper(itemId, {
          source: 'backup',
          localPath: backup.getBackupDir(itemId),
          subscribed: false,
          downloading: false,
          downloadFailed: false
        })
      } catch (err) {
        library.updateWallpaper(itemId, { subscribed: false, downloading: false, downloadFailed: false })
        console.error('[Steam] Failed to resolve backup dir on unsubscribe:', err)
      }
    } else {
      library.deleteWallpaper(itemId)
    }
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_REDOWNLOAD, async (_e, itemId: string) => {
    const wallpaper = library.getWallpaper(itemId)
    await steam.unsubscribeFromItem(BigInt(itemId))
    if (wallpaper?.localPath) {
      try { await fs.promises.rm(wallpaper.localPath, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    if (wallpaper) {
      library.updateWallpaper(itemId, { downloading: true, downloadFailed: false })
    }
    await steam.subscribeToItem(BigInt(itemId))
    startDownloadPoll(win, itemId)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_VOTE, async (_e, itemId: string, voteUp: boolean) => {
    const confirmed = await steam.voteOnItemAndConfirm(BigInt(itemId), voteUp)
    return { ok: true, confirmed }
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

  ipcMain.handle(IpcChannels.STEAM_GET_AUTHOR_INFO, (_e, steamId: string) => {
    return steam.getAuthorInfo(steamId)
  })
}
