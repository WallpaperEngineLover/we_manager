import Store from 'electron-store'
import type { WallpaperMeta, WallpaperType, ContentRating, LibraryFilters, WallpaperFolder } from '@shared/types'
import { getWorkshopPath } from '../utils/paths'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import { cleanupPlaylists } from './playlist.service'
import {
  getWorkshopTimesUpdated,
  getWorkshopTags,
  getWorkshopAuthors,
  getUnavailableWorkshopItems
} from './workshop.service'
import { findAndMutate } from '../utils/collections'
import { RESOLUTION_TAGS } from '@shared/resolutions'
import {
  isSteamRunning,
  getItemDownloadStatus,
  getSubscribedItems,
  isItemStuckNeverDownloaded,
  downloadItem
} from './steam.service'

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
  repairStaleDownloadFlags()
}

function repairStaleDownloadFlags(): void {
  const wallpapers = store.get('wallpapers')
  let changed = false
  for (const wallpaper of Object.values(wallpapers)) {
    if (!wallpaper.subscribed && (wallpaper.downloading || wallpaper.downloadFailed)) {
      wallpaper.downloading = false
      wallpaper.downloadFailed = false
      changed = true
    }
  }
  if (changed) store.set('wallpapers', wallpapers)
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

// Derived from the item's Steam Workshop tags for wallpapers that never finished
// downloading (no local project.json), so failed downloads still land in the
// right type/rating filters instead of "uncategorized".
function deriveTypeFromTags(tags: string[]): WallpaperType | undefined {
  const match = tags.find((t) => ['Video', 'Web', 'Application', 'Scene'].includes(t))
  return match ? normalizeType(match) : undefined
}

function deriveRatingFromTags(tags: string[]): ContentRating | undefined {
  const match = tags.find((t) => ['Everyone', 'Questionable', 'Mature'].includes(t))
  return match ? normalizeRating(match) : undefined
}

function sameTags(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return a === b
  return a.length === b.length && a.every((t) => b.includes(t))
}

function deriveResolutionsFromTags(tags: string[]): string[] {
  return tags.filter((t) => RESOLUTION_TAGS.has(t))
}

const RATING_RESTRICTIVENESS: Record<ContentRating, number> = {
  uncategorized: 0,
  everyone: 1,
  questionable: 2,
  mature: 3
}

// project.json's "contentrating" field and its "tags" array can disagree (an author can tag
// something "Mature" without setting the formal rating) - always trust the stricter one.
function stricterRating(a: ContentRating, b?: ContentRating): ContentRating {
  if (!b) return a
  return RATING_RESTRICTIVENESS[b] > RATING_RESTRICTIVENESS[a] ? b : a
}

async function safeGetWorkshopTags(ids: string[]): Promise<Map<string, string[]>> {
  try {
    return await getWorkshopTags(ids)
  } catch {
    return new Map()
  }
}

async function safeGetWorkshopAuthors(ids: string[]): Promise<Map<string, string>> {
  try {
    return await getWorkshopAuthors(ids)
  } catch {
    return new Map()
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
  workshopTimeUpdated?: number,
  authorSteamId?: string,
  liveWorkshopTags?: string[]
): WallpaperMeta {
  const now = Date.now()
  const { downloading: _d, downloadFailed: _df, ...existingRest } = existing ?? { appliedCount: 0, categories: [] }
  // project.json can land on disk before the preview image it references has
  // finished downloading (the watcher imports shortly after the folder shows
  // up) - pointing previewLocal at a file that doesn't exist yet makes the
  // wallpaper:// protocol handler fail with net::ERR_FILE_NOT_FOUND. Leaving
  // it unset here falls back to the "No preview" placeholder, and the next
  // library scan picks up the real file once it exists.
  const previewPath = pj?.preview ? path.join(localPath, pj.preview) : undefined
  // Steam can flag an item Mature after the fact (moderation, community reports) without the
  // author ever republishing - project.json keeps saying whatever it said at publish time, so
  // the live Workshop tags are the only place that catches it.
  const fromProject = stricterRating(normalizeRating(pj?.contentrating), deriveRatingFromTags(pj?.tags ?? []))
  const contentRating = stricterRating(fromProject, deriveRatingFromTags(liveWorkshopTags ?? []))
  return {
    ...existingRest,
    id: workshopId,
    title: pj?.title ?? `Wallpaper ${workshopId}`,
    type: normalizeType(pj?.type),
    contentRating,
    description: pj?.description,
    previewLocal: previewPath && fs.existsSync(previewPath) ? previewPath : undefined,
    previewUrl: undefined,
    localPath,
    file: pj?.file,
    fileSize: getDirSize(localPath),
    createdAt: existing?.createdAt ?? now,
    updatedAt: workshopTimeUpdated ? workshopTimeUpdated * 1000 : (existing?.updatedAt ?? now),
    subscribed: true,
    source: 'workshop',
    tags: pj?.tags ?? existing?.tags ?? [],
    resolutions: liveWorkshopTags ? deriveResolutionsFromTags(liveWorkshopTags) : existing?.resolutions,
    authorSteamId: authorSteamId ?? existing?.authorSteamId
  }
}

function buildIncompleteMeta(
  workshopId: string,
  localPath: string,
  existing?: WallpaperMeta,
  workshopTags?: string[],
  authorSteamId?: string
): WallpaperMeta {
  const now = Date.now()
  const { downloading, failed } = isSteamRunning()
    ? getItemDownloadStatus(BigInt(workshopId))
    : { downloading: true, failed: false }
  const tags = workshopTags
    ? [...new Set([...(existing?.tags ?? []), ...workshopTags])]
    : (existing?.tags ?? [])
  return {
    id: workshopId,
    title: existing?.title ?? `Wallpaper ${workshopId}`,
    type: (workshopTags && deriveTypeFromTags(workshopTags)) ?? existing?.type ?? 'scene',
    contentRating:
      (workshopTags && deriveRatingFromTags(workshopTags)) ?? existing?.contentRating ?? 'uncategorized',
    localPath,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    subscribed: true,
    appliedCount: existing?.appliedCount ?? 0,
    source: 'workshop',
    tags,
    resolutions: workshopTags ? deriveResolutionsFromTags(workshopTags) : existing?.resolutions,
    categories: existing?.categories ?? [],
    downloading,
    downloadFailed: failed,
    authorSteamId: authorSteamId ?? existing?.authorSteamId
  }
}

export async function importWallpaperById(workshopId: string): Promise<WallpaperMeta | null> {
  const localPath = path.join(getWorkshopPath(), workshopId)
  if (!fs.existsSync(localPath)) return null

  const existing = getWallpaper(workshopId) ?? undefined
  const authorSteamId =
    existing?.authorSteamId ?? (await safeGetWorkshopAuthors([workshopId])).get(workshopId)
  const pj = readProjectJson(localPath)
  if (!pj) {
    const tags = await safeGetWorkshopTags([workshopId])
    const meta = buildIncompleteMeta(workshopId, localPath, existing, tags.get(workshopId), authorSteamId)
    upsertWallpaper(meta)
    return meta
  }

  const timesUpdated = await safeGetWorkshopTimesUpdated([workshopId])
  const liveTags = await safeGetWorkshopTags([workshopId])
  const meta = buildMeta(
    workshopId,
    localPath,
    pj,
    existing,
    timesUpdated.get(workshopId),
    authorSteamId,
    liveTags.get(workshopId)
  )
  upsertWallpaper(meta)
  return meta
}

export async function scanLibrary(): Promise<{ imported: number; skipped: number; removed: number }> {
  const workshopPath = getWorkshopPath()
  if (!fs.existsSync(workshopPath)) return { imported: 0, skipped: 0, removed: 0 }

  const entries = fs.readdirSync(workshopPath, { withFileTypes: true })
  const onDisk = new Set(entries.filter(e => e.isDirectory()).map(e => e.name))
  const subscribedIds = isSteamRunning() ? new Set(getSubscribedItems()) : new Set<string>()

  // Load entire store once, mutate in memory, write once at the end
  const wallpapers = store.get('wallpapers')
  let imported = 0
  let skipped = 0
  let removed = 0
  let resynced = false

  // Remove workshop wallpapers whose directories no longer exist on disk, unless Steam
  // still has them subscribed (those get tracked below instead, so a failed
  // or never-started download doesn't just vanish from the library). Only source:'workshop'
  // entries live under workshopPath - local imports and backups (source:'local'/'backup') are
  // never on disk here, so including them in this check would delete them on every scan.
  for (const id of Object.keys(wallpapers)) {
    if (wallpapers[id].source !== 'workshop') continue
    if (!onDisk.has(id) && !subscribedIds.has(id)) {
      delete wallpapers[id]
      removed++
    }
  }

  const incomplete: { id: string; localPath: string }[] = []
  const toRebuild: { entry: fs.Dirent; localPath: string; pj: ProjectJson }[] = []
  const cacheHits: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const localPath = path.join(workshopPath, entry.name)
    const pj = readProjectJson(localPath)

    if (!pj) {
      incomplete.push({ id: entry.name, localPath })
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

  // Items Steam still lists as subscribed but that never got a local folder at all (the download
  // failed before writing anything, or Steam never actually started it - see
  // isItemStuckNeverDownloaded, this is more common than it sounds).
  for (const id of subscribedIds) {
    if (onDisk.has(id)) continue
    if (isSteamRunning() && isItemStuckNeverDownloaded(BigInt(id))) {
      downloadItem(BigInt(id))
    }
    incomplete.push({ id, localPath: path.join(workshopPath, id) })
  }

  // Author never changes once known, so only fetch it for items that don't have it yet
  const missingAuthorIds = [
    ...incomplete.map((i) => i.id),
    ...toRebuild.map(({ entry }) => entry.name),
    ...cacheHits
  ].filter((id) => !wallpapers[id]?.authorSteamId)
  const authors = await safeGetWorkshopAuthors(missingAuthorIds)

  const incompleteTags = await safeGetWorkshopTags(incomplete.map((i) => i.id))
  for (const { id, localPath } of incomplete) {
    const existing = wallpapers[id]
    const meta = buildIncompleteMeta(id, localPath, existing, incompleteTags.get(id), authors.get(id))
    if (!existing) {
      wallpapers[id] = meta
      imported++
    } else if (
      existing.downloading !== meta.downloading ||
      existing.downloadFailed !== meta.downloadFailed ||
      existing.type !== meta.type ||
      existing.contentRating !== meta.contentRating ||
      existing.authorSteamId !== meta.authorSteamId ||
      !sameTags(existing.resolutions, meta.resolutions)
    ) {
      wallpapers[id] = {
        ...existing,
        downloading: meta.downloading,
        downloadFailed: meta.downloadFailed,
        type: meta.type,
        contentRating: meta.contentRating,
        tags: meta.tags,
        resolutions: meta.resolutions,
        authorSteamId: meta.authorSteamId
      }
      resynced = true
      skipped++
    } else {
      skipped++
    }
  }

  const timesUpdated = await safeGetWorkshopTimesUpdated([
    ...toRebuild.map(({ entry }) => entry.name),
    ...cacheHits
  ])
  const liveTags = await safeGetWorkshopTags([
    ...toRebuild.map(({ entry }) => entry.name),
    ...cacheHits
  ])

  for (const { entry, localPath, pj } of toRebuild) {
    wallpapers[entry.name] = buildMeta(
      entry.name,
      localPath,
      pj,
      wallpapers[entry.name] ?? undefined,
      timesUpdated.get(entry.name),
      authors.get(entry.name),
      liveTags.get(entry.name)
    )
    imported++
  }

  for (const id of cacheHits) {
    const seconds = timesUpdated.get(id)
    const authorId = authors.get(id)
    const live = liveTags.get(id)

    // A time_updated bump means the author changed something on the Workshop side
    // (tags, content rating, a republish) - re-read project.json instead of just
    // touching updatedAt, otherwise a corrected rating/genre never leaves the cache
    // until the item is removed and reimported.
    const localPath = wallpapers[id].localPath
    if (seconds !== undefined && wallpapers[id].updatedAt !== seconds * 1000 && localPath) {
      const pj = readProjectJson(localPath)
      if (pj) {
        wallpapers[id] = buildMeta(
          id,
          localPath,
          pj,
          wallpapers[id],
          seconds,
          authorId ?? wallpapers[id].authorSteamId,
          live
        )
        resynced = true
        continue
      }
    }

    const patch: Partial<WallpaperMeta> = {}
    if (seconds !== undefined && wallpapers[id].updatedAt !== seconds * 1000) {
      patch.updatedAt = seconds * 1000
    }
    if (authorId && wallpapers[id].authorSteamId !== authorId) {
      patch.authorSteamId = authorId
    }
    // Only tighten, never loosen - a failed/empty tag fetch must not walk a rating back down.
    const liveRating = live ? deriveRatingFromTags(live) : undefined
    if (liveRating) {
      const stricter = stricterRating(wallpapers[id].contentRating ?? 'uncategorized', liveRating)
      if (stricter !== wallpapers[id].contentRating) {
        patch.contentRating = stricter
      }
    }
    if (live) {
      const resolutions = deriveResolutionsFromTags(live)
      if (!sameTags(wallpapers[id].resolutions, resolutions)) {
        patch.resolutions = resolutions
      }
    }
    if (Object.keys(patch).length > 0) {
      wallpapers[id] = { ...wallpapers[id], ...patch }
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

// Flags library items whose Steam Workshop listing has been taken down (the
// author deleted it, Valve removed it, etc). Those items can never be
// re-downloaded once lost locally, which is what "backup all unavailable"
// is for - only workshop-sourced items with local content are worth checking.
export async function checkUnavailableWallpapers(): Promise<{
  checked: number
  unavailable: number
  changed: boolean
}> {
  if (!isSteamRunning()) return { checked: 0, unavailable: 0, changed: false }

  const wallpapers = store.get('wallpapers')
  const candidates = Object.values(wallpapers).filter(
    (w) => w.source === 'workshop' && !!w.localPath && !w.downloading
  )
  if (candidates.length === 0) return { checked: 0, unavailable: 0, changed: false }

  let unavailableIds: Set<string>
  try {
    unavailableIds = await getUnavailableWorkshopItems(candidates.map((w) => w.id))
  } catch {
    // Steam request failed outright - leave existing unavailable flags alone
    // rather than reporting everything as available again.
    return { checked: 0, unavailable: 0, changed: false }
  }

  let changed = false
  for (const w of candidates) {
    const flag = unavailableIds.has(w.id)
    if (!!w.unavailable !== flag) {
      wallpapers[w.id] = { ...w, unavailable: flag }
      changed = true
    }
  }
  if (changed) store.set('wallpapers', wallpapers)

  return { checked: candidates.length, unavailable: unavailableIds.size, changed }
}

// Resolution only comes from the live Workshop tags (project.json never has it), so items
// imported before that was stored, or while Steam was offline, need a separate pass.
export async function backfillResolutions(): Promise<boolean> {
  if (!isSteamRunning()) return false

  const wallpapers = store.get('wallpapers')
  const missing = Object.values(wallpapers).filter(
    (w) => w.source === 'workshop' && w.resolutions === undefined
  )
  if (missing.length === 0) return false

  const tags = await safeGetWorkshopTags(missing.map((w) => w.id))
  let changed = false
  for (const w of missing) {
    const live = tags.get(w.id)
    if (!live) continue
    wallpapers[w.id] = { ...w, resolutions: deriveResolutionsFromTags(live) }
    changed = true
  }
  console.log(`[Library] Resolution tags fetched for ${tags.size} of ${missing.length} items`)
  if (changed) store.set('wallpapers', wallpapers)
  return changed
}

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
