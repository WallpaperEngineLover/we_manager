import * as fs from 'fs'
import * as path from 'path'
import type { WallpaperMeta } from '@shared/types'
import { getWallpaper, updateWallpaper } from './library.service'
import { captureLweScreenshot } from './lwe.service'
import { isAnimatedWallpaper, lweOptionsFor } from './wallpaper.service'
import { getThumbnailsPath } from '../utils/paths'

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']

function thumbnailsDir(): string {
  const dir = getThumbnailsPath()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// a new name for every version, the renderer would otherwise keep showing the cached old image
function newThumbnailPath(wallpaperId: string, extension: string): string {
  return path.join(thumbnailsDir(), `${wallpaperId}-${Date.now()}${extension}`)
}

function removeOwnThumbnail(wallpaper: WallpaperMeta): void {
  const current = wallpaper.customPreview
  if (current && path.dirname(current) === thumbnailsDir()) fs.rmSync(current, { force: true })
}

function requireWallpaper(id: string): WallpaperMeta {
  const wallpaper = getWallpaper(id)
  if (!wallpaper) throw new Error(`Wallpaper ${id} not found in library`)
  return wallpaper
}

function setThumbnail(wallpaper: WallpaperMeta, file: string): WallpaperMeta {
  removeOwnThumbnail(wallpaper)
  updateWallpaper(wallpaper.id, { customPreview: file, useOriginalPreview: false })
  return getWallpaper(wallpaper.id)!
}

export async function generateThumbnail(id: string): Promise<WallpaperMeta> {
  const wallpaper = requireWallpaper(id)
  if (!wallpaper.localPath) throw new Error('The wallpaper is not downloaded')
  if (!isAnimatedWallpaper(wallpaper)) throw new Error('Only scene, video and web wallpapers can be captured')

  const out = newThumbnailPath(id, '.png')
  await captureLweScreenshot(wallpaper.localPath, await lweOptionsFor(wallpaper), out)
  return setThumbnail(wallpaper, out)
}

export function useThumbnailFile(id: string, source: string): WallpaperMeta {
  const wallpaper = requireWallpaper(id)
  const extension = path.extname(source).toLowerCase()
  if (!IMAGE_EXTENSIONS.includes(extension)) throw new Error('Pick a png, jpg, webp, gif or bmp image')

  const out = newThumbnailPath(id, extension)
  fs.copyFileSync(source, out)
  return setThumbnail(wallpaper, out)
}

export function deleteThumbnail(id: string): WallpaperMeta {
  const wallpaper = requireWallpaper(id)
  removeOwnThumbnail(wallpaper)
  updateWallpaper(id, { customPreview: undefined, useOriginalPreview: false })
  return getWallpaper(id)!
}
