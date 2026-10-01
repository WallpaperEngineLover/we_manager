import { BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { IpcChannels } from '@shared/ipc-channels'
import type { BackupProgressEvent, WallpaperMeta } from '@shared/types'
import { getConfiguredBackupPath } from './config.service'
import * as library from './library.service'
import { normalizeType, normalizeRating, type ProjectJson } from './library.service'

export function getBackupDir(id: string): string {
  const backupPath = getConfiguredBackupPath()
  if (!backupPath) throw new Error('Backup path must be configured before backing up')
  return path.join(backupPath, id)
}

export function resolveBackupDir(wallpaper: WallpaperMeta): string | null {
  if (wallpaper.source === 'backup' && wallpaper.localPath) return wallpaper.localPath
  if (wallpaper.backupDir) return wallpaper.backupDir
  try {
    return getBackupDir(wallpaper.id)
  } catch {
    return null
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p)
    return true
  } catch {
    return false
  }
}

async function readProjectJson(dir: string): Promise<ProjectJson | null> {
  try {
    return JSON.parse(await fs.promises.readFile(path.join(dir, 'project.json'), 'utf8')) as ProjectJson
  } catch {
    return null
  }
}

export async function hasBackupFiles(dir: string | null): Promise<boolean> {
  return !!dir && (await isDir(dir)) && (await exists(path.join(dir, 'project.json')))
}

export async function findBackupProblem(dir: string): Promise<string | null> {
  if (!(await isDir(dir))) return 'folder is missing'
  const pj = await readProjectJson(dir)
  if (!pj) return 'project.json is missing or unreadable'
  if (!pj.file) return null
  if (await exists(path.join(dir, pj.file))) return null
  if (normalizeType(pj.type) === 'scene' && (await fs.promises.readdir(dir)).some((f) => f.endsWith('.pkg'))) {
    return null
  }
  return `${pj.file} is missing`
}

async function sameFileList(sourcePath: string, backupDir: string): Promise<boolean> {
  const [src, dst] = await Promise.all([walkFiles(sourcePath), walkFiles(backupDir)])
  const dstSizes = new Map(dst.map((f) => [f.relPath, f.size]))
  return src.length === dst.length && src.every((f) => dstSizes.get(f.relPath) === f.size)
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

// Wallpaper Engine writes its compiled shaders (shaders/blobsSM40/*.dxs) into the wallpaper folder
function isShaderCache(relPath: string): boolean {
  return /^shaders[\\/]blobs/i.test(relPath)
}

async function walkFiles(dirPath: string, baseDir = dirPath): Promise<{ relPath: string; size: number }[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dirPath, entry.name)
      if (entry.isDirectory()) return isShaderCache(path.relative(baseDir, full)) ? [] : walkFiles(full, baseDir)
      if (!entry.isFile()) return []
      return [{ relPath: path.relative(baseDir, full), size: (await fs.promises.stat(full)).size }]
    })
  )
  return nested.flat()
}

async function walkDirs(dirPath: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  const nested = await Promise.all(
    entries.filter((e) => e.isDirectory()).map((e) => walkDirs(path.join(dirPath, e.name)))
  )
  return [dirPath, ...nested.flat()]
}

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

async function fsyncPath(p: string): Promise<void> {
  const handle = await fs.promises.open(p, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

// fsynced pages are clean, so iflag=nocache can evict them and the hash check reads the disk
function dropPageCache(dir: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(
      'find',
      [dir, '-type', 'f', '-exec', 'sh', '-c',
        'for f do dd if="$f" iflag=nocache count=0 status=none; done', 'sh', '{}', '+'],
      { stdio: 'ignore' }
    )
    child.on('error', () => resolve())
    child.on('close', () => resolve())
  })
}

function sendProgress(win: BrowserWindow, progress: BackupProgressEvent): void {
  if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_BACKUP_PROGRESS, progress)
}

function percent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 100
}

export async function backupMatchesSource(sourcePath: string, backupDir: string): Promise<boolean> {
  let src: { relPath: string; size: number }[]
  let dst: { relPath: string; size: number }[]
  try {
    ;[src, dst] = await Promise.all([walkFiles(sourcePath), walkFiles(backupDir)])
  } catch {
    return false
  }
  if (src.length !== dst.length) return false
  const dstSizes = new Map(dst.map((f) => [f.relPath, f.size]))
  if (src.some((f) => dstSizes.get(f.relPath) !== f.size)) return false

  for (const file of src) {
    const [a, b] = await Promise.all([
      hashFile(path.join(sourcePath, file.relPath)),
      hashFile(path.join(backupDir, file.relPath))
    ])
    if (a !== b) return false
  }
  return true
}

export async function backupWallpaper(
  id: string,
  sourcePath: string,
  win: BrowserWindow
): Promise<string> {
  const destDir = getBackupDir(id)
  const backupRoot = path.dirname(destDir)
  if (path.resolve(sourcePath) === path.resolve(destDir)) {
    throw new Error('Wallpaper already lives in the backup folder')
  }

  const files = await walkFiles(sourcePath)
  if (!files.some((f) => f.relPath === 'project.json')) {
    throw new Error('Source folder has no project.json, refusing to back up an incomplete wallpaper')
  }
  const bytesTotal = files.reduce((sum, f) => sum + f.size, 0)

  await fs.promises.mkdir(backupRoot, { recursive: true })
  const stagingDir = path.join(backupRoot, `.${id}.partial`)
  const oldDir = path.join(backupRoot, `.${id}.old`)
  await fs.promises.rm(stagingDir, { recursive: true, force: true })
  await fs.promises.mkdir(stagingDir)

  let bytesDone = 0
  try {
    for (const file of files) {
      const srcFile = path.join(sourcePath, file.relPath)
      const destFile = path.join(stagingDir, file.relPath)

      let srcStat: fs.Stats
      try {
        srcStat = await fs.promises.stat(srcFile)
      } catch {
        throw new Error(`Source file is gone, refusing to back up: ${file.relPath}`)
      }
      if (!srcStat.isFile() || srcStat.size !== file.size) {
        throw new Error(`Source file changed since it was scanned, refusing to back up: ${file.relPath}`)
      }

      await fs.promises.mkdir(path.dirname(destFile), { recursive: true })
      await fs.promises.copyFile(srcFile, destFile)
      await fsyncPath(destFile)
      bytesDone += file.size
      sendProgress(win, {
        itemId: id,
        bytesCopied: bytesDone,
        bytesTotal,
        percentage: percent(bytesDone, bytesTotal),
        status: 'copying'
      })
    }
    for (const dir of await walkDirs(stagingDir)) await fsyncPath(dir)
    await dropPageCache(stagingDir)

    bytesDone = 0
    for (const file of files) {
      const destFile = path.join(stagingDir, file.relPath)
      const destSize = (await fs.promises.stat(destFile)).size
      if (destSize !== file.size) {
        throw new Error(
          `Backup verification failed for ${file.relPath}: expected ${file.size} bytes, got ${destSize}`
        )
      }
      const [srcHash, destHash] = await Promise.all([
        hashFile(path.join(sourcePath, file.relPath)),
        hashFile(destFile)
      ])
      if (srcHash !== destHash) {
        throw new Error(`Backup verification failed for ${file.relPath}: hash mismatch`)
      }
      bytesDone += file.size
      sendProgress(win, {
        itemId: id,
        bytesCopied: bytesDone,
        bytesTotal,
        percentage: percent(bytesDone, bytesTotal),
        status: 'verifying'
      })
    }

    await fs.promises.rm(oldDir, { recursive: true, force: true })
    const hadOld = await exists(destDir)
    if (hadOld) await fs.promises.rename(destDir, oldDir)
    await fs.promises.rename(stagingDir, destDir)
    await fsyncPath(backupRoot)
    if (hadOld) await fs.promises.rm(oldDir, { recursive: true, force: true })
  } catch (err) {
    await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    sendProgress(win, {
      itemId: id,
      bytesCopied: bytesDone,
      bytesTotal,
      percentage: 0,
      status: 'error',
      message: (err as Error).message
    })
    throw err
  }

  sendProgress(win, { itemId: id, bytesCopied: bytesTotal, bytesTotal, percentage: 100, status: 'completed' })
  return destDir
}

function isDeletableBackupDir(wallpaper: WallpaperMeta, dir: string): boolean {
  const resolved = path.resolve(dir)
  if (wallpaper.backupDir && path.resolve(wallpaper.backupDir) === resolved) return true
  if (wallpaper.source === 'backup' && path.basename(resolved) === wallpaper.id) return true
  const backupPath = getConfiguredBackupPath()
  return !!backupPath && path.dirname(resolved) === path.resolve(backupPath)
}

export async function removeBackup(id: string): Promise<{ keptDir: string | null }> {
  const wallpaper = library.getWallpaper(id)
  if (!wallpaper) return { keptDir: null }
  const dir = resolveBackupDir(wallpaper)
  let keptDir: string | null = null

  if (dir && (await exists(dir))) {
    const isWorkshopCopy =
      wallpaper.source === 'workshop' && !!wallpaper.localPath && path.resolve(wallpaper.localPath) === path.resolve(dir)
    if (isWorkshopCopy || !isDeletableBackupDir(wallpaper, dir)) {
      keptDir = dir
      console.warn(`[Backup] Not deleting ${dir} for ${id}, only dropping the reference`)
    } else {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  }

  if (wallpaper.source === 'backup') {
    library.deleteWallpaper(id)
  } else {
    library.updateWallpaper(id, { backedUp: false, backupDir: undefined })
  }
  return { keptDir }
}

async function buildBackupMeta(id: string, localPath: string, existing?: WallpaperMeta): Promise<WallpaperMeta> {
  const [pj, files] = await Promise.all([readProjectJson(localPath), walkFiles(localPath)])
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
    fileSize: files.reduce((sum, f) => sum + f.size, 0),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    subscribed: false,
    appliedCount: existing?.appliedCount ?? 0,
    source: 'backup',
    tags: pj?.tags ?? existing?.tags ?? [],
    resolutions: existing?.resolutions,
    categories: existing?.categories ?? [],
    backedUp: true,
    backupDir: localPath
  }
}

const SCAN_CONCURRENCY = 4

export async function scanBackupFolder(): Promise<{
  imported: number
  skipped: number
  linked: number
  removed: number
  unlinked: number
  corrupted: string[]
}> {
  const result = { imported: 0, skipped: 0, linked: 0, removed: 0, unlinked: 0, corrupted: [] as string[] }
  const backupPath = getConfiguredBackupPath()
  if (!backupPath || !(await isDir(backupPath))) return result

  const wallpapers = new Map(library.getAllWallpapers().map((w) => [w.id, w]))
  const folderIds = (await fs.promises.readdir(backupPath, { withFileTypes: true }))
    // dot folders are staging copies of an in-progress backup
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)

  const problems = new Map<string, Promise<string | null>>()
  const problemOf = (dir: string): Promise<string | null> => {
    const key = path.resolve(dir)
    if (!problems.has(key)) problems.set(key, findBackupProblem(dir))
    return problems.get(key)!
  }

  const upserts: WallpaperMeta[] = []
  const patches: { id: string; patch: Partial<WallpaperMeta> }[] = []
  const deletes: string[] = []

  const referenced = [...wallpapers.values()].filter((w) => (w.source === 'backup' || w.backedUp) && !w.downloading)
  await forEachLimit(referenced, SCAN_CONCURRENCY, async (w) => {
    const dir = resolveBackupDir(w)
    // the drive holding it is not mounted
    if (dir && !(await isDir(path.dirname(dir)))) return
    const reason = dir ? await problemOf(dir) : 'no backup folder'
    if (!reason) return
    console.warn(`[Backup] Dropping broken backup of ${w.id} at ${dir}: ${reason}`)
    if (w.source === 'backup') {
      deletes.push(w.id)
      result.removed++
    } else {
      patches.push({ id: w.id, patch: { backedUp: false, backupDir: undefined } })
      result.unlinked++
    }
  })
  const dropped = new Set([...deletes, ...patches.map((p) => p.id)])

  await forEachLimit(folderIds, SCAN_CONCURRENCY, async (id) => {
    const dir = path.join(backupPath, id)
    const problem = await problemOf(dir)
    if (problem) {
      console.warn(`[Backup] Skipping corrupted backup ${dir}: ${problem}`)
      result.corrupted.push(id)
      return
    }
    const existing = wallpapers.get(id)

    if (existing?.source === 'workshop') {
      if ((existing.backedUp && !dropped.has(id)) || existing.downloading) {
        result.skipped++
      } else {
        // an older version than the workshop copy is still a backup, backing up again refreshes it
        patches.push({ id, patch: { backedUp: true, backupDir: dir } })
        result.linked++
      }
      return
    }
    if (
      existing?.source === 'backup' &&
      !dropped.has(id) &&
      existing.fileSize !== undefined &&
      path.resolve(existing.localPath ?? '') === path.resolve(dir)
    ) {
      result.skipped++
      return
    }
    upserts.push(await buildBackupMeta(id, dir, existing))
    result.imported++
  })

  const reimported = new Set(upserts.map((m) => m.id))
  library.applyWallpaperChanges({
    upserts,
    patches,
    deletes: deletes.filter((id) => !reimported.has(id))
  })
  result.removed -= deletes.filter((id) => reimported.has(id)).length
  result.corrupted.sort()
  return result
}

// what each entry was last compared at, so only items whose workshop folder changed get re-walked
const outdatedCheckedAt = new Map<string, string>()

export async function checkOutdatedBackups(): Promise<boolean> {
  const candidates = library
    .getAllWallpapers()
    .filter((w) => w.source === 'workshop' && w.backedUp && !w.downloading && w.localPath)
  const patches: { id: string; patch: Partial<WallpaperMeta> }[] = []

  await forEachLimit(candidates, SCAN_CONCURRENCY, async (w) => {
    const dir = resolveBackupDir(w)
    if (!dir) return
    let key: string
    try {
      const stat = await fs.promises.stat(w.localPath!)
      key = `${w.updatedAt}|${dir}|${stat.mtimeMs}`
    } catch {
      return
    }
    if (outdatedCheckedAt.get(w.id) === key) return
    let outdated: boolean
    try {
      outdated = !(await sameFileList(w.localPath!, dir))
    } catch {
      // backup drive not mounted, or the folder is being replaced right now
      return
    }
    outdatedCheckedAt.set(w.id, key)
    if (!!w.backupOutdated !== outdated) patches.push({ id: w.id, patch: { backupOutdated: outdated } })
  })

  if (patches.length > 0) library.applyWallpaperChanges({ patches })
  return patches.length > 0
}
