import * as fs from 'fs'
import * as path from 'path'
import { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { importWallpaperById } from './library.service'
import { getWorkshopPath } from '../utils/paths'

let activeWatcher: fs.FSWatcher | null = null
let watcherWin: BrowserWindow | null = null

export function startWatcher(win: BrowserWindow): void {
  watcherWin = win
  restartWatcher()
}

export function restartWatcher(): void {
  if (activeWatcher) {
    activeWatcher.close()
    activeWatcher = null
  }
  if (!watcherWin) return

  const watchPath = getWorkshopPath()

  if (!fs.existsSync(watchPath)) {
    console.warn(`[Watcher] Workshop path does not exist: ${watchPath}`)
    try {
      fs.mkdirSync(watchPath, { recursive: true })
    } catch {
      return
    }
  }

  console.log('[Watcher] Watching', watchPath)

  activeWatcher = fs.watch(watchPath, { persistent: false }, (event, filename) => {
    if (event !== 'rename' || !filename) return

    // Give Steam a moment to finish creating the directory before importing
    const fullPath = path.join(watchPath, filename)
    setTimeout(() => {
      let isDirectory = false
      try {
        isDirectory = fs.statSync(fullPath).isDirectory()
      } catch {
        return // deleted again in the meantime
      }
      if (!isDirectory) return

      console.log('[Watcher] New wallpaper detected:', filename)
      importWallpaperById(filename).then((meta) => {
        if (meta && watcherWin && !watcherWin.isDestroyed()) {
          watcherWin.webContents.send(IpcChannels.EVENT_WALLPAPER_IMPORTED, meta)
        }
      })
    }, 1000)
  })
}
