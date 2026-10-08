import { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { WallpaperMeta } from '@shared/types'
import * as library from './library.service'
import { copyWallpaperFolder, hasBackupFiles, sameFileList, syncDir, verifyOnDisk } from './backup.service'
import { getScreenAssignments } from './display.service'
import { unsubscribeFromItem } from './steam.service'
import { getExtraLibraryRoots } from '../utils/paths'

export type TransferMode = 'copy' | 'move'

export interface TransferResult {
  done: number
  alreadyThere: number
  failed: { id: string; title: string; reason: string }[]
}

const inFlight = new Set<string>()

function rebase(file: string | undefined, from: string, to: string): string | undefined {
  if (!file) return file
  const rel = path.relative(from, file)
  return rel.startsWith('..') || path.isAbsolute(rel) ? file : path.join(to, rel)
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p)
    return true
  } catch {
    return false
  }
}

// returns false when it already was in that library
async function transferOne(
  wallpaper: WallpaperMeta,
  root: string,
  mode: TransferMode,
  win: BrowserWindow
): Promise<boolean> {
  const sourcePath = wallpaper.localPath ? path.resolve(wallpaper.localPath) : null
  if (!sourcePath || wallpaper.downloading || !(await hasBackupFiles(sourcePath))) {
    throw new Error('no complete local files')
  }
  if (path.dirname(sourcePath) === root) return false
  if (mode === 'move' && getScreenAssignments().some((a) => a.wallpaperId === wallpaper.id)) {
    throw new Error('it is on a screen right now')
  }

  const destDir = path.join(root, path.basename(sourcePath))
  if (await exists(destDir)) {
    // reuse an identical copy from an earlier run, anything else is someone's data
    if (!(await verifyOnDisk(sourcePath, destDir))) {
      throw new Error(`a different folder ${destDir} already exists`)
    }
  } else {
    await copyWallpaperFolder(wallpaper.id, sourcePath, destDir, win, mode)
  }
  if (mode === 'copy') return true

  // make sure the final folder is complete before the original goes away
  if (!(await hasBackupFiles(destDir)) || !(await sameFileList(sourcePath, destDir).catch(() => false))) {
    throw new Error(`the copy at ${destDir} does not match the original, nothing was deleted`)
  }

  // Steam would download a moved item again while subscribed
  if (wallpaper.source === 'workshop' && wallpaper.subscribed) {
    try {
      await unsubscribeFromItem(BigInt(wallpaper.id))
    } catch (err) {
      throw new Error(
        `copied to ${destDir}, but unsubscribing failed so the original was kept: ${(err as Error).message}`,
        { cause: err }
      )
    }
  }

  const patch: Partial<WallpaperMeta> = {
    source: 'local',
    localPath: destDir,
    previewLocal: rebase(wallpaper.previewLocal, sourcePath, destDir),
    subscribed: false,
    downloading: false,
    downloadFailed: false
  }
  if (wallpaper.source === 'backup') {
    patch.backedUp = false
    patch.backupDir = undefined
  }
  library.updateWallpaper(wallpaper.id, patch)
  await fs.promises.rm(sourcePath, { recursive: true, force: true })
  await syncDir(path.dirname(sourcePath)).catch(() => {})
  return true
}

export async function transferWallpapers(
  ids: string[],
  libraryPath: string,
  mode: TransferMode,
  win: BrowserWindow
): Promise<TransferResult> {
  const root = path.resolve(libraryPath)
  if (!getExtraLibraryRoots().includes(root)) throw new Error(`${libraryPath} is not a library folder`)
  if (!(await exists(root))) throw new Error(`${libraryPath} is not available, is the drive mounted?`)

  const result: TransferResult = { done: 0, alreadyThere: 0, failed: [] }
  for (const id of ids) {
    const wallpaper = library.getWallpaper(id)
    if (!wallpaper) continue
    if (inFlight.has(id)) {
      result.failed.push({ id, title: wallpaper.title, reason: 'already being copied' })
      continue
    }
    inFlight.add(id)
    try {
      if (await transferOne(wallpaper, root, mode, win)) result.done++
      else result.alreadyThere++
    } catch (err) {
      console.error(`[Library] ${mode} of ${id} to ${root} failed:`, err)
      result.failed.push({ id, title: wallpaper.title, reason: (err as Error).message })
    } finally {
      inFlight.delete(id)
    }
  }
  return result
}
