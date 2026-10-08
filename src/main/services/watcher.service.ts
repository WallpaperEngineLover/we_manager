import * as fs from 'fs'
import * as path from 'path'
import { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { WallpaperMeta } from '@shared/types'
import { importLocalWallpaper, importWallpaperById } from './library.service'
import { getExtraLibraryRoots, getWorkshopPath } from '../utils/paths'

let activeWatchers: fs.FSWatcher[] = []
let watcherWin: BrowserWindow | null = null

export function startWatcher(win: BrowserWindow): void {
  watcherWin = win
  restartWatcher()
}

function watchNewFolders(
  watchPath: string,
  importFolder: (name: string, fullPath: string) => Promise<WallpaperMeta | null>
): void {
  console.log('[Watcher] Watching', watchPath)

  const watcher = fs.watch(watchPath, { persistent: false }, (event, filename) => {
    if (event !== 'rename' || !filename || filename.startsWith('.')) return

    // give Steam a moment to finish creating the directory
    const fullPath = path.join(watchPath, filename)
    setTimeout(() => {
      let isDirectory = false
      try {
        isDirectory = fs.statSync(fullPath).isDirectory()
      } catch {
        return // deleted again in the meantime
      }
      if (!isDirectory) return

      console.log('[Watcher] New wallpaper detected:', fullPath)
      importFolder(filename, fullPath).then((meta) => {
        if (meta && watcherWin && !watcherWin.isDestroyed()) {
          watcherWin.webContents.send(IpcChannels.EVENT_WALLPAPER_IMPORTED, meta)
        }
      })
    }, 1000)
  })
  watcher.on('error', (err) => console.warn(`[Watcher] ${watchPath}: ${err.message}`))
  activeWatchers.push(watcher)
}

export function restartWatcher(): void {
  for (const watcher of activeWatchers) watcher.close()
  activeWatchers = []
  if (!watcherWin) return

  const workshopPath = getWorkshopPath()
  let workshopReady = fs.existsSync(workshopPath)
  if (!workshopReady) {
    console.warn(`[Watcher] Workshop path does not exist: ${workshopPath}`)
    try {
      fs.mkdirSync(workshopPath, { recursive: true })
      workshopReady = true
    } catch {
    }
  }
  if (workshopReady) watchNewFolders(workshopPath, (name) => importWallpaperById(name))

  // never created here, a missing one is usually an unmounted drive
  for (const root of getExtraLibraryRoots()) {
    if (!fs.existsSync(root)) {
      console.warn(`[Watcher] Library folder is not available: ${root}`)
      continue
    }
    watchNewFolders(root, (_name, fullPath) => importLocalWallpaper(fullPath))
  }
}
