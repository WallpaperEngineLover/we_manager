import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { IpcChannels } from '@shared/ipc-channels'
import * as backup from '../services/backup.service'
import * as library from '../services/library.service'
import * as steam from '../services/steam.service'
import { getAutoUnsubscribeAfterBackup } from '../services/config.service'

async function backupOne(id: string, win: BrowserWindow): Promise<{ ok: boolean; unsubscribed: boolean }> {
  const wallpaper = library.getWallpaper(id)
  if (!wallpaper?.localPath) throw new Error(`Wallpaper ${id} has no local files to back up`)

  await backup.backupWallpaper(id, wallpaper.localPath, win)
  library.updateWallpaper(id, { backedUp: true })

  let unsubscribed = false
  if (getAutoUnsubscribeAfterBackup()) {
    await steam.unsubscribeFromItem(BigInt(id))
    try {
      fs.rmSync(wallpaper.localPath, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    library.updateWallpaper(id, {
      source: 'backup',
      localPath: backup.getBackupDir(id),
      subscribed: false
    })
    unsubscribed = true
  }

  return { ok: true, unsubscribed }
}

export function registerBackupHandlers(win: BrowserWindow): void {
  ipcMain.handle(IpcChannels.BACKUP_ITEM, async (_e, itemId: string) => {
    return backupOne(itemId, win)
  })

  ipcMain.handle(IpcChannels.BACKUP_SELECTION, async (_e, itemIds: string[]) => {
    let backedUp = 0
    let failed = 0
    let unsubscribed = 0

    for (const id of itemIds) {
      try {
        const result = await backupOne(id, win)
        backedUp++
        if (result.unsubscribed) unsubscribed++
      } catch {
        failed++
      }
    }

    return { backedUp, failed, unsubscribed }
  })

  ipcMain.handle(IpcChannels.BACKUP_SCAN, () => {
    return backup.scanBackupFolder()
  })
}
