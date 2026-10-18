import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { IpcChannels } from '@shared/ipc-channels'
import type { WallpaperMeta } from '@shared/types'
import * as steam from '../services/steam.service'
import * as library from '../services/library.service'
import * as backup from '../services/backup.service'
import * as verify from '../services/workshop-verify.service'
import { isWallpaperEngineItem } from '../services/workshop.service'
import { getWorkshopPath } from '../utils/paths'
import { setDependencyInstaller } from '../services/dependency.service'

// by item state, GetItemDownloadInfo can still answer for a finished item
function startDownloadPoll(win: BrowserWindow, itemId: string): Promise<boolean> {
  const idBig = BigInt(itemId)
  let polling = false
  let lastState = -1
  return new Promise((resolve) => {
    const pollInterval = setInterval(async () => {
      if (win.isDestroyed()) {
        clearInterval(pollInterval)
        resolve(false)
        return
      }
      if (polling || !steam.isSteamAllowed()) return
      polling = true
      try {
        let state: number
        try {
          state = await steam.fetchItemState(idBig)
        } catch {
          return
        }
        const info = await steam.getDownloadInfo(idBig)
        if (state !== lastState) {
          console.log(
            `[Steam] ${itemId}: item state ${state}` +
              (info ? `, ${info.bytesDownloaded}/${info.bytesTotal} bytes` : ', no download info')
          )
          lastState = state
        }
        const busy = (state & (steam.ITEM_STATE_DOWNLOADING | steam.ITEM_STATE_DOWNLOAD_PENDING)) !== 0
        const installed =
          (state & steam.ITEM_STATE_INSTALLED) !== 0 && (state & steam.ITEM_STATE_NEEDS_UPDATE) === 0 && !busy
        if (!installed && (busy || info)) {
          // the watcher may have imported the half-written folder
          const entry = library.getWallpaper(itemId)
          if (entry?.source === 'workshop' && !entry.downloading) library.updateWallpaper(itemId, { downloading: true })
          if (info && !win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_DOWNLOAD_PROGRESS, info)
          return
        }
      } finally {
        polling = false
      }

      clearInterval(pollInterval)
      library.importWallpaperById(itemId).catch((err) => {
        console.error(`[Steam] Import of ${itemId} failed:`, err)
        return null
      }).then((meta) => {
        const success = !!meta && !meta.downloading && !meta.downloadFailed && !!meta.localPath && !!library.readProjectJson(meta.localPath)
        resolve(success)
        if (win.isDestroyed()) return
        win.webContents.send(IpcChannels.EVENT_DOWNLOAD_PROGRESS, {
          itemId,
          bytesDownloaded: 0,
          bytesTotal: 0,
          percentage: success ? 100 : 0,
          status: success ? 'completed' : 'error'
        })
      })
    }, 1000)
  })
}

async function subscribeAndDownload(win: BrowserWindow, itemId: string): Promise<void> {
  await steam.subscribeToItem(BigInt(itemId))
  // subscribing doesn't always start the download
  await steam.downloadItem(BigInt(itemId))
  void startDownloadPoll(win, itemId)
}

// DownloadItem may do nothing for an item Steam counts as installed; dir is null when the old folder is still there
async function downloadStarts(itemId: bigint, dir: string | null, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if ((await steam.isItemDownloading(itemId)) || (dir && (await backup.exists(dir)))) return true
    await sleep(1000)
  }
  return false
}

const repairing = new Set<string>()

// moves the copy aside and redownloads (resubscribing if needed); the old copy returns if nothing arrives
async function repairItem(win: BrowserWindow, itemId: string): Promise<boolean> {
  if (repairing.has(itemId)) return false
  repairing.add(itemId)
  let started: { done: Promise<void> } | null = null
  try {
    started = await startRepair(win, itemId)
    return !!started
  } finally {
    if (started) void started.done.finally(() => repairing.delete(itemId))
    else repairing.delete(itemId)
  }
}

// null when Steam did not start downloading
async function startRepair(win: BrowserWindow, itemId: string): Promise<{ done: Promise<void> } | null> {
  const notifyLibrary = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_LIBRARY_CHANGED)
  }
  const entry = library.getWallpaper(itemId)
  if (entry?.verifyProblem === 'missingDependency' && entry.localPath) {
    const dependency = verify.presetDependency(library.readProjectJson(entry.localPath) ?? {})
    if (dependency) {
      if (!(await isWallpaperEngineItem(dependency))) {
        throw new Error(`Dependency ${dependency} is not a Wallpaper Engine workshop item, not subscribing to it`)
      }
      await subscribeAndDownload(win, dependency)
      library.updateWallpaper(itemId, { verifyProblem: undefined })
      notifyLibrary()
      return { done: Promise.resolve() }
    }
  }
  // no workshop entry yet: only download
  const wallpaper = entry?.source === 'workshop' ? entry : null
  if (!wallpaper && !(await steam.getSubscribedItems()).includes(itemId)) {
    throw new Error(`Wallpaper ${itemId} is not a workshop wallpaper`)
  }
  const id = BigInt(itemId)
  const dir = wallpaper?.localPath ?? path.join(getWorkshopPath(), itemId)
  const markEntry = (patch: Partial<WallpaperMeta>): void => {
    if (library.getWallpaper(itemId)?.source === 'workshop') library.updateWallpaper(itemId, patch)
  }
  const stash = verify.repairStashOf(dir, itemId)
  let stashed = false

  const giveUp = async (): Promise<void> => {
    const restored = stashed && (await verify.settleRepairStash(dir, stash))
    if (restored || library.readProjectJson(dir)) {
      await library.importWallpaperById(itemId)
      markEntry({ downloading: false, verifyProblem: restored ? wallpaper?.verifyProblem : undefined })
    } else {
      markEntry({ downloading: false, downloadFailed: true })
    }
    notifyLibrary()
  }

  let started = false
  try {
    // an interrupted repair may hold the only good copy
    await verify.settleRepairStash(dir, stash)
    stashed = await fs.promises.rename(dir, stash).then(
      () => true,
      () => false
    )
    const watchDir = stashed || !(await backup.exists(dir)) ? dir : null
    markEntry({ downloading: true, downloadFailed: false })

    started = (await steam.downloadItem(id)) && (await downloadStarts(id, watchDir, 10_000))
    if (!started) {
      console.log(`[Steam] ${itemId}: DownloadItem did not fetch the item again, renewing the subscription`)
      await steam.unsubscribeFromItem(id)
      await steam.subscribeToItem(id)
      await steam.downloadItem(id)
      started = await downloadStarts(id, watchDir, 30_000)
    }
    if (!started) {
      console.warn(`[Steam] ${itemId}: Steam did not start downloading it`)
      await giveUp()
      return null
    }
  } catch (err) {
    await giveUp()
    throw err
  }

  const done = startDownloadPoll(win, itemId)
    .then(async (ok) => {
      if (!ok) return giveUp()
      await removeLocalFiles(stash)
      const imported = library.getWallpaper(itemId)
      if (!imported) return
      const check = await verify.checkItem(imported)
      if (check.problem) console.warn(`[Steam] ${itemId}: still ${check.problem} after downloading again${check.detail ? ` - ${check.detail}` : ''}`)
      library.updateWallpaper(itemId, { verifyProblem: check.problem ?? undefined })
      notifyLibrary()
    })
    .catch((err) => console.error(`[Steam] Repair of ${itemId} failed:`, err))
  return { done }
}

// async so a hung mount doesn't block the main process
async function removeLocalFiles(dir: string): Promise<void> {
  try { await fs.promises.rm(dir, { recursive: true, force: true }) } catch { }
}

export function registerSteamHandlers(win: BrowserWindow): void {
  setDependencyInstaller((itemId) => subscribeAndDownload(win, itemId))
  void verify.restoreRepairStashes()

  ipcMain.handle(IpcChannels.STEAM_IS_RUNNING, () => {
    return steam.isSteamRunning()
  })

  ipcMain.handle(IpcChannels.STEAM_SUBSCRIBE, async (_e, itemId: string) => {
    await subscribeAndDownload(win, itemId)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_UNSUBSCRIBE, async (_e, itemId: string) => {
    const wallpaper = library.getWallpaper(itemId)
    await steam.unsubscribeFromItem(BigInt(itemId))
    // a backup entry's localPath is the backup itself
    if (wallpaper && wallpaper.source !== 'workshop') {
      library.updateWallpaper(itemId, { subscribed: false, downloading: false, downloadFailed: false })
      return { ok: true }
    }
    if (wallpaper?.localPath) await removeLocalFiles(wallpaper.localPath)
    const backupDir = wallpaper?.backedUp ? backup.resolveBackupDir(wallpaper) : null
    if (wallpaper && backupDir && (await backup.hasBackupFiles(backupDir))) {
      library.updateWallpaper(itemId, {
        source: 'backup',
        localPath: backupDir,
        previewLocal: await backup.previewInBackup(wallpaper, backupDir),
        backupDir,
        subscribed: false,
        downloading: false,
        downloadFailed: false
      })
    } else {
      if (wallpaper?.backedUp) console.warn(`[Steam] Backup of ${itemId} not found at ${backupDir}, removing the entry`)
      library.deleteWallpaper(itemId)
    }
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_REDOWNLOAD, async (_e, itemId: string) => {
    if (!(await repairItem(win, itemId))) throw new Error(`Steam did not start downloading ${itemId} again`)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_VERIFY, (_e, itemIds?: string[]) => {
    return verify.verifyItems(itemIds, (done, total) => {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_VERIFY_PROGRESS, { done, total })
    })
  })

  ipcMain.handle(IpcChannels.STEAM_REPAIR, async (_e, itemIds: string[]) => {
    let started = 0
    let failed = 0
    await backup.forEachLimit(itemIds, 3, async (id) => {
      try {
        if (await repairItem(win, id)) started++
        else failed++
      } catch (err) {
        console.error(`[Steam] Repair of ${id} failed:`, err)
        failed++
      }
    })
    return { started, failed }
  })

  ipcMain.handle(IpcChannels.STEAM_VOTE, async (_e, itemId: string, voteUp: boolean) => {
    const confirmed = await steam.voteOnItemAndConfirm(BigInt(itemId), voteUp)
    return { ok: true, confirmed }
  })

  ipcMain.handle(IpcChannels.STEAM_OPEN_WORKSHOP, async (_e, itemId: string) => {
    await steam.openWorkshopItemOverlay(BigInt(itemId))
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.STEAM_GET_VOTED_IDS, async () => {
    return steam.getVotedUpItemIds()
  })

  ipcMain.handle(IpcChannels.STEAM_GET_DISLIKED_IDS, () => {
    return steam.getVotedDownItemIds()
  })

  ipcMain.handle(IpcChannels.STEAM_FAVORITE, async (_e, itemId: string, add: boolean) => {
    const confirmed = await steam.setFavorite(BigInt(itemId), add)
    return { ok: true, confirmed }
  })

  ipcMain.handle(IpcChannels.STEAM_GET_FAVORITE_IDS, () => {
    return steam.getFavoriteItemIds()
  })

  ipcMain.handle(IpcChannels.STEAM_GET_FAVORITE_STATUS, () => {
    return steam.getFavoriteStatus()
  })

  ipcMain.handle(IpcChannels.STEAM_GET_FAILED_VOTES, () => {
    return steam.getFailedVotes()
  })

  ipcMain.handle(IpcChannels.STEAM_CHECK_VOTE, (_e, itemId: string) => {
    return steam.refreshItemVote(BigInt(itemId))
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
