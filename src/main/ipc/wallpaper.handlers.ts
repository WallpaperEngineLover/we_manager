import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { applyWallpaper, detectEnvironment } from '../services/wallpaper.service'
import { getWallpaper, updateWallpaper } from '../services/library.service'
import { getLweStatus, launchLweAsync } from '../services/lwe.service'
import { getDefaultFps } from '../services/config.service'
import type { ApplyWallpaperOptions } from '@shared/types'
import Store from 'electron-store'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

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
    return id ? getWallpaper(id) : null
  })

  ipcMain.handle(IpcChannels.WALLPAPER_APPLY, async (_e, options: ApplyWallpaperOptions) => {
    const wallpaper = getWallpaper(options.wallpaperId)
    if (!wallpaper) throw new Error(`Wallpaper ${options.wallpaperId} not found in library`)
    if (!wallpaper.localPath) throw new Error(`Wallpaper ${options.wallpaperId} has no local path`)

    const isAnimated = wallpaper.type === 'scene' || wallpaper.type === 'web' || wallpaper.type === 'video'
    const lwe = getLweStatus()

    let appliedPath: string
    if (isAnimated && os.platform() === 'linux' && lwe.installed) {
      const fps = wallpaper.fpsOverride ?? getDefaultFps() ?? undefined
      await launchLweAsync(wallpaper.localPath, { fps })
      appliedPath = wallpaper.localPath
    } else {
      // Static fallback: set the preview image as a plain wallpaper
      appliedPath = findWallpaperImage(wallpaper.localPath)
      await applyWallpaper(appliedPath, options.backend)
    }

    store.set('activeWallpaperId', options.wallpaperId)
    updateWallpaper(options.wallpaperId, {
      appliedCount: (wallpaper.appliedCount ?? 0) + 1,
      lastAppliedAt: Date.now()
    })

    return { ok: true, appliedPath }
  })
}

function findWallpaperImage(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`)
  }
  if (!fs.statSync(dirPath).isDirectory()) {
    return dirPath
  }

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
  const files = fs.readdirSync(dirPath)

  const preview = files.find((f) => f.toLowerCase().startsWith('preview'))
  if (preview && imageExtensions.includes(path.extname(preview).toLowerCase())) {
    return path.join(dirPath, preview)
  }

  const image = files.find((f) => imageExtensions.includes(path.extname(f).toLowerCase()))
  if (image) return path.join(dirPath, image)

  throw new Error(`No image found in ${dirPath}`)
}
