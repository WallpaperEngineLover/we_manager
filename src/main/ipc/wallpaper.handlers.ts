import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { applyWallpaper, detectEnvironment } from '../services/wallpaper.service'
import { getWallpaper, updateWallpaper } from '../services/library.service'
import type { ApplyWallpaperOptions } from '@shared/types'
import Store from 'electron-store'

interface StoreSchema {
  activeWallpaperId?: string
}

const store = new Store<StoreSchema>()

export function registerWallpaperHandlers(): void {
  ipcMain.handle(IpcChannels.WALLPAPER_DETECT_ENV, () => {
    return detectEnvironment()
  })

  ipcMain.handle(IpcChannels.WALLPAPER_GET_ACTIVE, () => {
    const id = store.get('activeWallpaperId')
    if (!id) return null
    return getWallpaper(id as string)
  })

  ipcMain.handle(IpcChannels.WALLPAPER_APPLY, async (_e, options: ApplyWallpaperOptions) => {
    const wallpaper = getWallpaper(options.wallpaperId)
    if (!wallpaper) throw new Error(`Wallpaper ${options.wallpaperId} not found in library`)
    if (!wallpaper.localPath) throw new Error(`Wallpaper ${options.wallpaperId} has no local path`)

    // Find an image file in the wallpaper directory
    const imagePath = await findWallpaperImage(wallpaper.localPath)
    await applyWallpaper(imagePath, options.backend)

    // Update metadata
    store.set('activeWallpaperId', options.wallpaperId)
    updateWallpaper(options.wallpaperId, {
      appliedCount: (wallpaper.appliedCount ?? 0) + 1,
      lastAppliedAt: Date.now()
    })

    return { ok: true, appliedPath: imagePath }
  })
}

async function findWallpaperImage(dirPath: string): Promise<string> {
  const fs = await import('fs')
  const path = await import('path')

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`)
  }

  const stat = fs.statSync(dirPath)
  if (!stat.isDirectory()) {
    // It IS the file
    return dirPath
  }

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
  const files = fs.readdirSync(dirPath)

  // Prefer preview.png, then any image
  const preview = files.find((f) => f.toLowerCase().startsWith('preview'))
  if (preview) {
    const ext = path.extname(preview).toLowerCase()
    if (imageExtensions.includes(ext)) {
      return path.join(dirPath, preview)
    }
  }

  const image = files.find((f) => imageExtensions.includes(path.extname(f).toLowerCase()))
  if (image) return path.join(dirPath, image)

  throw new Error(`No image found in ${dirPath}`)
}
