import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IpcChannels } from '@shared/ipc-channels'
import * as backup from '../services/backup.service'
import * as library from '../services/library.service'
import * as steam from '../services/steam.service'
import { getAutoUnsubscribeAfterBackup } from '../services/config.service'

export interface BackupItemResult {
  ok: boolean
  alreadyBackedUp: boolean
  unsubscribed: boolean
}

const inFlight = new Set<string>()

async function backupOne(id: string, win: BrowserWindow): Promise<BackupItemResult> {
  if (inFlight.has(id)) throw new Error(`Wallpaper ${id} is already being backed up`)
  inFlight.add(id)
  try {
    const wallpaper = library.getWallpaper(id)
    if (!wallpaper) throw new Error(`Wallpaper ${id} is not in the library`)
    if (wallpaper.source !== 'workshop') throw new Error(`Wallpaper ${id} is not a workshop wallpaper`)
    if (wallpaper.downloading) throw new Error(`Wallpaper ${id} is still downloading`)
    if (!wallpaper.localPath || !(await backup.hasBackupFiles(wallpaper.localPath))) {
      throw new Error(`Wallpaper ${id} has no complete local files to back up`)
    }
    const sourcePath = wallpaper.localPath

    let backupDir = backup.resolveBackupDir(wallpaper)
    const alreadyBackedUp =
      !!backupDir && (await backup.hasBackupFiles(backupDir)) && (await backup.backupMatchesSource(sourcePath, backupDir))
    if (!alreadyBackedUp) {
      backupDir = await backup.backupWallpaper(id, sourcePath, win)
    }
    library.updateWallpaper(id, { backedUp: true, backupDir: backupDir! })

    let unsubscribed = false
    if (getAutoUnsubscribeAfterBackup()) {
      if (!(await backup.hasBackupFiles(backupDir))) {
        throw new Error(`Backup of ${id} is missing after copying, not unsubscribing`)
      }
      await steam.unsubscribeFromItem(BigInt(id))
      library.updateWallpaper(id, {
        source: 'backup',
        localPath: backupDir!,
        subscribed: false,
        downloading: false,
        downloadFailed: false
      })
      if (path.resolve(sourcePath) !== path.resolve(backupDir!)) {
        try {
          await fs.promises.rm(sourcePath, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
      unsubscribed = true
    }

    return { ok: true, alreadyBackedUp, unsubscribed }
  } finally {
    inFlight.delete(id)
  }
}

export function registerBackupHandlers(win: BrowserWindow): void {
  ipcMain.handle(IpcChannels.BACKUP_ITEM, async (_e, itemId: string) => {
    return backupOne(itemId, win)
  })

  ipcMain.handle(IpcChannels.BACKUP_SELECTION, async (_e, itemIds: string[]) => {
    let backedUp = 0
    let alreadyBackedUp = 0
    let failed = 0
    let unsubscribed = 0

    for (const id of itemIds) {
      try {
        const result = await backupOne(id, win)
        if (result.alreadyBackedUp) alreadyBackedUp++
        else backedUp++
        if (result.unsubscribed) unsubscribed++
      } catch (err) {
        console.error(`[Backup] ${id}:`, err)
        failed++
      }
    }

    return { backedUp, alreadyBackedUp, failed, unsubscribed }
  })

  ipcMain.handle(IpcChannels.BACKUP_SCAN, () => {
    return backup.scanBackupFolder()
  })

  ipcMain.handle(IpcChannels.BACKUP_REMOVE, async (_e, itemIds: string[]) => {
    let removed = 0
    let failed = 0
    const keptDirs: string[] = []
    for (const id of itemIds) {
      try {
        const { keptDir } = await backup.removeBackup(id)
        if (keptDir) keptDirs.push(keptDir)
        removed++
      } catch (err) {
        console.error(`[Backup] Failed to remove backup of ${id}:`, err)
        failed++
      }
    }
    return { removed, failed, keptDirs }
  })
}
