import Store from 'electron-store'
import type { WallpaperMeta, WallpaperType, ContentRating, LibraryFilters, WallpaperFolder } from '@shared/types'
import { getWorkshopPath } from '../utils/paths'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import { cleanupPlaylists } from './playlist.service'
import { getWorkshopTimesUpdated } from './workshop.service'
import { findAndMutate } from '../utils/collections'
import { isSteamRunning, isItemDownloading } from './steam.service'

interface LibraryStore {
  wallpapers: Record<string, WallpaperMeta>
  tags: string[]
  folders: WallpaperFolder[]
}

const store = new Store<LibraryStore>({
  name: 'library',
  defaults: {
    wallpapers: {},
    tags: [],
    folders: []
  }
})

export function initLibrary(): void {
  console.log('[Library] Store initialized at', store.path)
}

export function getAllWallpapers(filters?: LibraryFilters): WallpaperMeta[] {
  const all = Object.values(store.get('wallpapers'))

  let results = all

  if (filters?.type) {
    results = results.filter((w) => w.type === filters.type)
  }
  if (filters?.searchText) {
    const q = filters.searchText.toLowerCase()
    results = results.filter(
      (w) => w.title.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q)
    )
  }
  if (filters?.contentRating) {
    results = results.filter((w) => w.contentRating === filters.contentRating)
  }
  if (filters?.tags && filters.tags.length > 0) {
    results = results.filter((w) => filters.tags!.every((tag) => w.tags.includes(tag)))
  }
  if (filters?.categories && filters.categories.length > 0) {
    results = results.filter((w) => filters.categories!.some((cat) => w.categories.includes(cat)))
  }

  // Sort
  const sortBy = filters?.sortBy ?? 'updatedAt'
  const dir = filters?.sortDir === 'asc' ? 1 : -1

  results = [...results].sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return dir * a.title.localeCompare(b.title)
      case 'createdAt':
        return dir * (a.createdAt - b.createdAt)
      case 'updatedAt':
        return dir * (a.updatedAt - b.updatedAt)
      case 'lastApplied':
        return dir * ((a.lastAppliedAt ?? 0) - (b.lastAppliedAt ?? 0))
      case 'appliedCount':
        return dir * (a.appliedCount - b.appliedCount)
      case 'fileSize':
        return dir * ((a.fileSize ?? 0) - (b.fileSize ?? 0))
      default:
        return dir * (a.updatedAt - b.updatedAt)
    }
  })

  return results
}

export function getWallpaper(id: string): WallpaperMeta | null {
  const wallpapers = store.get('wallpapers')
  return wallpapers[id] ?? null
}

export function upsertWallpaper(meta: WallpaperMeta): void {
  const wallpapers = store.get('wallpapers')
  wallpapers[meta.id] = meta
  store.set('wallpapers', wallpapers)
}

// updatedAt tracks the workshop item's own timestamp (set in buildMeta), not local edits.
export function updateWallpaper(id: string, patch: Partial<WallpaperMeta>): void {
  const current = getWallpaper(id)
  if (!current) throw new Error(`Wallpaper ${id} not found`)
  upsertWallpaper({ ...current, ...patch, updatedAt: current.updatedAt })
}

export function deleteWallpaper(id: string): void {
  const wallpapers = store.get('wallpapers')
  delete wallpapers[id]
  store.set('wallpapers', wallpapers)
}

export function resetAllFpsOverrides(): { count: number } {
  const wallpapers = store.get('wallpapers')
  let count = 0
  for (const id of Object.keys(wallpapers)) {
    if (wallpapers[id].fpsOverride !== undefined) {
      delete wallpapers[id].fpsOverride
      count++
    }
  }
  store.set('wallpapers', wallpapers)
  return { count }
}

export function addTag(wallpaperId: string, tagName: string): void {
  const wallpaper = getWallpaper(wallpaperId)
  if (!wallpaper) return
  if (!wallpaper.tags.includes(tagName)) {
    wallpaper.tags.push(tagName)
    upsertWallpaper(wallpaper)
  }
  const tags = store.get('tags')
  if (!tags.includes(tagName)) {
    tags.push(tagName)
    store.set('tags', tags.sort())
  }
}

export function removeTag(wallpaperId: string, tagName: string): void {
  const wallpaper = getWallpaper(wallpaperId)
  if (!wallpaper) return
  wallpaper.tags = wallpaper.tags.filter((t) => t !== tagName)
  upsertWallpaper(wallpaper)
}

export function getAllTags(): string[] {
  return store.get('tags')
}

export function getDistinctTags(): string[] {
  const all = Object.values(store.get('wallpapers'))
  const set = new Set<string>()
  for (const w of all) {
    for (const t of w.tags) set.add(t)
  }
  return [...set].sort()
}

export interface ProjectJson {
  title?: string
  type?: string
  file?: string
  tags?: string[]
  description?: string
  preview?: string
  contentrating?: string
  workshopid?: string
}

export function readProjectJson(localPath: string): ProjectJson | null {
  try {
    const raw = fs.readFileSync(path.join(localPath, 'project.json'), 'utf8')
    return JSON.parse(raw) as ProjectJson
  } catch {
    return null
  }
}

export function normalizeType(raw?: string): WallpaperType {
  switch (raw?.toLowerCase()) {
    case 'video': return 'video'
    case 'web': return 'web'
    case 'application': return 'application'
    default: return 'scene'
  }
}

export function normalizeRating(raw?: string): ContentRating {
  switch (raw?.toLowerCase()) {
    case 'everyone': return 'everyone'
    case 'questionable': return 'questionable'
    case 'mature': return 'mature'
    default: return 'uncategorized'
  }
}

export function getDirSize(dirPath: string): number {
  let total = 0
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        total += getDirSize(full)
      } else if (entry.isFile()) {
        try { total += fs.statSync(full).size } catch { /* skip */ }
      }
    }
  } catch { /* skip unreadable dirs */ }
  return total
}

async function safeGetWorkshopTimesUpdated(ids: string[]): Promise<Map<string, number>> {
  try {
    return await getWorkshopTimesUpdated(ids)
  } catch {
    return new Map()
  }
}

function buildMeta(
  workshopId: string,
  localPath: string,
  pj: ProjectJson | null,
  existing?: WallpaperMeta,
  workshopTimeUpdated?: number
): WallpaperMeta {
  const now = Date.now()
  const { downloading: _d, downloadFailed: _df, ...existingRest } = existing ?? { appliedCount: 0, categories: [] }
  return {
    ...existingRest,
    id: workshopId,
    title: pj?.title ?? `Wallpaper ${workshopId}`,
    type: normalizeType(pj?.type),
    contentRating: normalizeRating(pj?.contentrating),
    description: pj?.description,
    previewLocal: pj?.preview ? path.join(localPath, pj.preview) : undefined,
    previewUrl: undefined,
    localPath,
    file: pj?.file,
    fileSize: getDirSize(localPath),
    createdAt: existing?.createdAt ?? now,
    updatedAt: workshopTimeUpdated ? workshopTimeUpdated * 1000 : (existing?.updatedAt ?? now),
    subscribed: true,
    source: 'workshop',
    tags: pj?.tags ?? existing?.tags ?? []
  }
}

function buildIncompleteMeta(
  workshopId: string,
  localPath: string,
  existing?: WallpaperMeta
): WallpaperMeta {
  const now = Date.now()
  const downloading = isSteamRunning() ? isItemDownloading(BigInt(workshopId)) : true
  return {
    id: workshopId,
    title: existing?.title ?? `Wallpaper ${workshopId}`,
    type: existing?.type ?? 'scene',
    contentRating: existing?.contentRating ?? 'uncategorized',
    localPath,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    subscribed: true,
    appliedCount: existing?.appliedCount ?? 0,
    source: 'workshop',
    tags: existing?.tags ?? [],
    categories: existing?.categories ?? [],
    downloading,
    downloadFailed: !downloading
  }
}

export async function importWallpaperById(workshopId: string): Promise<WallpaperMeta | null> {
  const localPath = path.join(getWorkshopPath(), workshopId)
  if (!fs.existsSync(localPath)) return null

  const existing = getWallpaper(workshopId) ?? undefined
  const pj = readProjectJson(localPath)
  if (!pj) {
    const meta = buildIncompleteMeta(workshopId, localPath, existing)
    upsertWallpaper(meta)
    return meta
  }

  const timesUpdated = await safeGetWorkshopTimesUpdated([workshopId])
  const meta = buildMeta(workshopId, localPath, pj, existing, timesUpdated.get(workshopId))
  upsertWallpaper(meta)
  return meta
}

export async function scanLibrary(): Promise<{ imported: number; skipped: number; removed: number }> {
  const workshopPath = getWorkshopPath()
  if (!fs.existsSync(workshopPath)) return { imported: 0, skipped: 0, removed: 0 }

  const entries = fs.readdirSync(workshopPath, { withFileTypes: true })
  const onDisk = new Set(entries.filter(e => e.isDirectory()).map(e => e.name))

  // Load entire store once, mutate in memory, write once at the end
  const wallpapers = store.get('wallpapers')
  let imported = 0
  let skipped = 0
  let removed = 0

  // Remove wallpapers whose directories no longer exist on disk
  for (const id of Object.keys(wallpapers)) {
    if (!onDisk.has(id)) {
      delete wallpapers[id]
      removed++
    }
  }

  const toRebuild: { entry: fs.Dirent; localPath: string; pj: ProjectJson }[] = []
  const cacheHits: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const localPath = path.join(workshopPath, entry.name)
    const pj = readProjectJson(localPath)

    if (!pj) {
      const existing = wallpapers[entry.name]
      const meta = buildIncompleteMeta(entry.name, localPath, existing)
      if (!existing) {
        wallpapers[entry.name] = meta
        imported++
      } else if (existing.downloading !== meta.downloading || existing.downloadFailed !== meta.downloadFailed) {
        wallpapers[entry.name] = { ...existing, downloading: meta.downloading, downloadFailed: meta.downloadFailed }
        skipped++
      } else {
        skipped++
      }
      continue
    }

    const existing = wallpapers[entry.name]
    if (!existing?.downloading && existing?.previewLocal !== undefined && existing?.contentRating !== undefined && existing?.fileSize !== undefined) {
      cacheHits.push(entry.name)
      skipped++
      continue
    }

    toRebuild.push({ entry, localPath, pj })
  }

  const timesUpdated = await safeGetWorkshopTimesUpdated([
    ...toRebuild.map(({ entry }) => entry.name),
    ...cacheHits
  ])

  for (const { entry, localPath, pj } of toRebuild) {
    wallpapers[entry.name] = buildMeta(
      entry.name,
      localPath,
      pj,
      wallpapers[entry.name] ?? undefined,
      timesUpdated.get(entry.name)
    )
    imported++
  }

  let resynced = false
  for (const id of cacheHits) {
    const seconds = timesUpdated.get(id)
    if (seconds === undefined) continue
    const newUpdatedAt = seconds * 1000
    if (wallpapers[id].updatedAt !== newUpdatedAt) {
      wallpapers[id] = { ...wallpapers[id], updatedAt: newUpdatedAt }
      resynced = true
    }
  }

  if (imported > 0 || removed > 0 || resynced) {
    store.set('wallpapers', wallpapers)
  }

  console.log(`[Library] Scan complete: ${imported} imported, ${skipped} skipped, ${removed} removed`)

  // Auto-cleanup folder/playlist items that reference non-existent wallpapers
  cleanupFolders()
  cleanupPlaylists(new Set(Object.keys(wallpapers)))

  return { imported, skipped, removed }
}

// Folders

export function getAllFolders(): WallpaperFolder[] {
  return store.get('folders')
}

export function createFolder(title: string): WallpaperFolder {
  const folder: WallpaperFolder = { id: randomUUID(), title, items: [] }
  const folders = store.get('folders')
  folders.push(folder)
  store.set('folders', folders)
  return folder
}

function updateFolder(id: string, mutate: (folder: WallpaperFolder) => void): WallpaperFolder | null {
  const folders = store.get('folders')
  const folder = findAndMutate(folders, id, mutate)
  if (folder) store.set('folders', folders)
  return folder
}

export function renameFolder(id: string, title: string): WallpaperFolder | null {
  return updateFolder(id, (folder) => {
    folder.title = title
  })
}

export function deleteFolder(id: string): void {
  const folders = store.get('folders').filter((f) => f.id !== id)
  store.set('folders', folders)
}

/** A wallpaper can only live in one folder at a time, so adding it here pulls it out of any other. */
export function addItemsToFolder(folderId: string, itemIds: string[]): WallpaperFolder | null {
  const folders = store.get('folders')
  const moving = new Set(itemIds)
  for (const folder of folders) {
    if (folder.id === folderId) continue
    folder.items = folder.items.filter((id) => !moving.has(id))
  }

  const target = findAndMutate(folders, folderId, (folder) => {
    const set = new Set(folder.items)
    for (const id of itemIds) set.add(id)
    folder.items = [...set]
  })

  if (target) store.set('folders', folders)
  return target
}

export function removeItemsFromFolder(folderId: string, itemIds: string[]): WallpaperFolder | null {
  return updateFolder(folderId, (folder) => {
    const remove = new Set(itemIds)
    folder.items = folder.items.filter((id) => !remove.has(id))
  })
}

/**
 * Remove folder item IDs that don't exist in the wallpapers store, and drop
 * items from any folder beyond the first that also claims them (a wallpaper
 * can only belong to one folder).
 * Returns the number of stale/duplicate IDs removed.
 */
export function cleanupFolders(): number {
  const wallpapers = store.get('wallpapers')
  const validIds = new Set(Object.keys(wallpapers))
  const folders = store.get('folders')
  const seen = new Set<string>()
  let removed = 0

  for (const folder of folders) {
    const before = folder.items.length
    folder.items = folder.items.filter((id) => {
      if (!validIds.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
    removed += before - folder.items.length
  }

  if (removed > 0) {
    store.set('folders', folders)
    console.log(`[Library] Folder cleanup: removed ${removed} stale item(s)`)
  }

  return removed
}

export function importWEConfig(configPath: string): { folders: number; playlists: number } {
  const raw = fs.readFileSync(configPath, 'utf8')
  const data = JSON.parse(raw)
  const workshopPath = getWorkshopPath()

  const imported: WallpaperFolder[] = []
  const existingTitles = new Set(store.get('folders').map((f) => f.title))

  // Try each profile and pick the one with the most folders (usually '~')
  let bestProfile: { folders: any[]; playlists: any[] } = { folders: [], playlists: [] }
  for (const key of Object.keys(data)) {
    const val = data[key]
    if (!val || typeof val !== 'object') continue
    const general = val.general
    if (!general || typeof general !== 'object') continue
    const browser = general.browser
    const folders = browser?.folders ?? []
    const playlists = general.playlists ?? []
    const total = folders.length + playlists.length
    if (total > bestProfile.folders.length + bestProfile.playlists.length) {
      bestProfile = { folders, playlists }
    }
  }

  // Import folders (items are workshop IDs)
  for (const f of bestProfile.folders) {
    const title = f.title ?? 'Untitled'
    if (existingTitles.has(title)) continue
    const items = Object.keys(f.items ?? {}).filter((k) => /^\d+$/.test(k))
    imported.push({ id: randomUUID(), title, items })
    existingTitles.add(title)
  }

  // Import playlists (items are full file paths, so extract the workshop ID)
  for (const p of bestProfile.playlists) {
    const title = p.name ?? 'Untitled Playlist'
    if (existingTitles.has(title)) continue
    const items: string[] = []
    for (const filePath of p.items ?? []) {
      // Extract workshop ID from path like ".../431960/888689688/scene.pkg"
      const match = filePath.match(/\/431960\/(\d+)\//)
      if (match) items.push(match[1])
    }
    if (items.length > 0) {
      imported.push({ id: randomUUID(), title, items })
      existingTitles.add(title)
    }
  }

  if (imported.length > 0) {
    const folders = store.get('folders')
    folders.push(...imported)
    store.set('folders', folders)
  }

  const fCount = bestProfile.folders.length
  const pCount = bestProfile.playlists.length
  console.log(`[Library] WE config imported: ${imported.length} folders/playlists from ${fCount} folders + ${pCount} playlists`)
  return { folders: fCount, playlists: pCount }
}
