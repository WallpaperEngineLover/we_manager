import { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IpcChannels } from '@shared/ipc-channels'
import type { WallpaperMeta } from '@shared/types'
import { getConfiguredBackupPath } from './config.service'
import * as library from './library.service'
import { readProjectJson, normalizeType, normalizeRating, getDirSize } from './library.service'

export function getBackupDir(id: string): string {
  const backupPath = getConfiguredBackupPath()
  if (!backupPath) throw new Error('Backup path must be configured before backing up')
  return path.join(backupPath, id)
}

export function isBackedUp(id: string): boolean {
  try {
    return fs.existsSync(getBackupDir(id))
  } catch {
    return false
  }
}

function walkFiles(dirPath: string, baseDir = dirPath): { relPath: string; size: number }[] {
  const results: { relPath: string; size: number }[] = []
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, baseDir))
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, full)
      results.push({ relPath: rel, size: fs.statSync(full).size })
    }
  }
  return results
}

export async function backupWallpaper(
  id: string,
  sourcePath: string,
  win: BrowserWindow
): Promise<void> {
  const destDir = getBackupDir(id)
  const files = walkFiles(sourcePath)
  const bytesTotal = files.reduce((sum, f) => sum + f.size, 0)
  let bytesCopied = 0

  fs.mkdirSync(destDir, { recursive: true })

  try {
    for (const file of files) {
      const srcFile = path.join(sourcePath, file.relPath)
      const destFile = path.join(destDir, file.relPath)
      fs.mkdirSync(path.dirname(destFile), { recursive: true })
      await fs.promises.copyFile(srcFile, destFile)
      bytesCopied += file.size

      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.EVENT_BACKUP_PROGRESS, {
          itemId: id,
          bytesCopied,
          bytesTotal,
          percentage: bytesTotal > 0 ? Math.round((bytesCopied / bytesTotal) * 100) : 100,
          status: 'copying'
        })
      }
    }
  } catch (err) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.EVENT_BACKUP_PROGRESS, {
        itemId: id,
        bytesCopied,
        bytesTotal,
        percentage: 0,
        status: 'error',
        message: (err as Error).message
      })
    }
    throw err
  }

  if (!win.isDestroyed()) {
    win.webContents.send(IpcChannels.EVENT_BACKUP_PROGRESS, {
      itemId: id,
      bytesCopied,
      bytesTotal,
      percentage: 100,
      status: 'completed'
    })
  }
}

function buildBackupMeta(
  id: string,
  localPath: string,
  existing?: WallpaperMeta
): WallpaperMeta {
  const pj = readProjectJson(localPath)
  const now = Date.now()
  return {
    id,
    title: pj?.title ?? existing?.title ?? `Wallpaper ${id}`,
    type: normalizeType(pj?.type),
    contentRating: normalizeRating(pj?.contentrating),
    description: pj?.description ?? existing?.description,
    previewLocal: pj?.preview ? path.join(localPath, pj.preview) : undefined,
    localPath,
    file: pj?.file,
    fileSize: getDirSize(localPath),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    subscribed: false,
    appliedCount: existing?.appliedCount ?? 0,
    source: 'backup',
    tags: pj?.tags ?? existing?.tags ?? [],
    categories: existing?.categories ?? [],
    backedUp: true
  }
}

export function scanBackupFolder(): { imported: number; skipped: number; linked: number } {
  const backupPath = getConfiguredBackupPath()
  if (!backupPath || !fs.existsSync(backupPath)) return { imported: 0, skipped: 0, linked: 0 }

  let imported = 0
  let skipped = 0
  let linked = 0

  for (const entry of fs.readdirSync(backupPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const id = entry.name
    const localBackupPath = path.join(backupPath, id)
    const existing = library.getWallpaper(id)

    if (existing && existing.source === 'workshop') {
      if (!existing.backedUp) {
        library.updateWallpaper(id, { backedUp: true })
        linked++
      } else {
        skipped++
      }
      continue
    }

    const meta = buildBackupMeta(id, localBackupPath, existing ?? undefined)
    library.upsertWallpaper(meta)
    imported++
  }

  return { imported, skipped, linked }
}
