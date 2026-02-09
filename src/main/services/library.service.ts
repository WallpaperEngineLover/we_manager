import Store from 'electron-store'
import type { WallpaperMeta, WallpaperType, ContentRating, LibraryFilters, WallpaperFolder } from '@shared/types'
import { getWorkshopPath } from '../utils/paths'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'

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

export function initDatabase(): void {
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

export function updateWallpaper(id: string, patch: Partial<WallpaperMeta>): void {
  const current = getWallpaper(id)
  if (!current) throw new Error(`Wallpaper ${id} not found`)
  upsertWallpaper({ ...current, ...patch, updatedAt: Date.now() })
}

export function deleteWallpaper(id: string): void {
  const wallpapers = store.get('wallpapers')
  delete wallpapers[id]
  store.set('wallpapers', wallpapers)
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

interface ProjectJson {
  title?: string
  type?: string
  file?: string
  tags?: string[]
  description?: string
  preview?: string
  contentrating?: string
  workshopid?: string
}

function readProjectJson(localPath: string): ProjectJson | null {
  try {
    const raw = fs.readFileSync(path.join(localPath, 'project.json'), 'utf8')
    return JSON.parse(raw) as ProjectJson
  } catch {
    return null
  }
}

function normalizeType(raw?: string): WallpaperType {
  switch (raw?.toLowerCase()) {
    case 'video': return 'video'
    case 'web': return 'web'
    case 'application': return 'application'
    default: return 'scene'
  }
}

function normalizeRating(raw?: string): ContentRating {
  switch (raw?.toLowerCase()) {
    case 'questionable': return 'questionable'
    case 'mature': return 'mature'
    default: return 'everyone'
  }
}

function buildMeta(
  workshopId: string,
  localPath: string,
  pj: ProjectJson | null,
  existing?: WallpaperMeta
): WallpaperMeta {
  const now = Date.now()
  return {
    ...(existing ?? { appliedCount: 0, categories: [] }),
    id: workshopId,
    title: pj?.title ?? `Wallpaper ${workshopId}`,
    type: normalizeType(pj?.type),
    contentRating: normalizeRating(pj?.contentrating),
    description: pj?.description,
    previewLocal: pj?.preview ? path.join(localPath, pj.preview) : undefined,
    previewUrl: undefined,
    localPath,
    file: pj?.file,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    subscribed: true,
    source: 'workshop',
    tags: pj?.tags ?? existing?.tags ?? []
  }
}

export function importWallpaperById(workshopId: string): WallpaperMeta | null {
  const localPath = path.join(getWorkshopPath(), workshopId)
  if (!fs.existsSync(localPath)) return null

  const meta = buildMeta(workshopId, localPath, readProjectJson(localPath), getWallpaper(workshopId) ?? undefined)
  upsertWallpaper(meta)
  return meta
}

export function scanLibrary(): { imported: number; skipped: number } {
  const workshopPath = getWorkshopPath()
  if (!fs.existsSync(workshopPath)) return { imported: 0, skipped: 0 }

  const entries = fs.readdirSync(workshopPath, { withFileTypes: true })

  // Load entire store once, mutate in memory, write once at the end
  const wallpapers = store.get('wallpapers')
  let imported = 0
  let skipped = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // Skip already-imported entries that have all required fields (cache hit)
    const existing = wallpapers[entry.name]
    if (existing?.previewLocal !== undefined && existing?.contentRating !== undefined) {
      skipped++
      continue
    }

    const localPath = path.join(workshopPath, entry.name)
    const pj = readProjectJson(localPath)
    if (!pj) { skipped++; continue }

    wallpapers[entry.name] = buildMeta(entry.name, localPath, pj)
    imported++
  }

  if (imported > 0) {
    store.set('wallpapers', wallpapers) // single write
  }

  console.log(`[Library] Scan complete: ${imported} imported, ${skipped} skipped`)
  return { imported, skipped }
}

// ── Folder CRUD ──

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

export function renameFolder(id: string, title: string): WallpaperFolder | null {
  const folders = store.get('folders')
  const folder = folders.find((f) => f.id === id)
  if (!folder) return null
  folder.title = title
  store.set('folders', folders)
  return folder
}

export function deleteFolder(id: string): void {
  const folders = store.get('folders').filter((f) => f.id !== id)
  store.set('folders', folders)
}

export function addItemsToFolder(folderId: string, itemIds: string[]): WallpaperFolder | null {
  const folders = store.get('folders')
  const folder = folders.find((f) => f.id === folderId)
  if (!folder) return null
  const set = new Set(folder.items)
  for (const id of itemIds) set.add(id)
  folder.items = [...set]
  store.set('folders', folders)
  return folder
}

export function removeItemsFromFolder(folderId: string, itemIds: string[]): WallpaperFolder | null {
  const folders = store.get('folders')
  const folder = folders.find((f) => f.id === folderId)
  if (!folder) return null
  const remove = new Set(itemIds)
  folder.items = folder.items.filter((id) => !remove.has(id))
  store.set('folders', folders)
  return folder
}

export function importWEConfig(configPath: string): { folders: number; playlists: number } {
  const raw = fs.readFileSync(configPath, 'utf8')
  const data = JSON.parse(raw)
  const workshopPath = getWorkshopPath()

  const imported: WallpaperFolder[] = []
  const existingTitles = new Set(store.get('folders').map((f) => f.title))

  // Try each profile — pick the one with the most folders (usually '~')
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

  // Import playlists (items are full file paths — extract workshop ID)
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
