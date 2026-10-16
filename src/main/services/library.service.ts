import Store from 'electron-store'
import type { WallpaperMeta, WallpaperType, ContentRating, LibraryFilters, WallpaperFolder } from '@shared/types'
import { getExtraLibraryRoots, getThumbnailsPath, getWorkshopPath } from '../utils/paths'
import { findLocalWallpapers, localWallpaperId } from '../utils/localLibrary'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import { cleanupPlaylists } from './playlist.service'
import { getWorkshopDetails, getUnavailableWorkshopItems, type WorkshopDetails } from './workshop.service'
import { findAndMutate } from '../utils/collections'
import { resolutionsFromTags } from '@shared/resolutions'
import { detectFeatures, type WallpaperFeatures } from '../utils/hdr'
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
  resolutionsVersion: number
}

const store = new Store<LibraryStore>({
  name: 'library',
  defaults: {
    wallpapers: {},
    tags: [],
    folders: [],
    resolutionsVersion: 0
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

// updatedAt is the workshop item's timestamp, not local edits
export function updateWallpaper(id: string, patch: Partial<WallpaperMeta>): void {
  const current = getWallpaper(id)
  if (!current) throw new Error(`Wallpaper ${id} not found`)
  upsertWallpaper({ ...current, ...patch, updatedAt: current.updatedAt })
}

export function deleteWallpaper(id: string): void {
  const wallpapers = store.get('wallpapers')
  const thumbnail = wallpapers[id]?.customPreview
  if (thumbnail && path.dirname(thumbnail) === getThumbnailsPath()) fs.rmSync(thumbnail, { force: true })
  delete wallpapers[id]
  store.set('wallpapers', wallpapers)
}

// reads the store fresh so changes made during a long scan aren't overwritten
export function applyWallpaperChanges(changes: {
  upserts?: WallpaperMeta[]
  patches?: { id: string; patch: Partial<WallpaperMeta> }[]
  deletes?: string[]
}): void {
  const wallpapers = store.get('wallpapers')
  for (const meta of changes.upserts ?? []) wallpapers[meta.id] = meta
  for (const { id, patch } of changes.patches ?? []) {
    if (wallpapers[id]) wallpapers[id] = { ...wallpapers[id], ...patch, updatedAt: wallpapers[id].updatedAt }
  }
  for (const id of changes.deletes ?? []) {
    const thumbnail = wallpapers[id]?.customPreview
    if (thumbnail && path.dirname(thumbnail) === getThumbnailsPath()) fs.rmSync(thumbnail, { force: true })
    delete wallpapers[id]
  }
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
  dependency?: string | number
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

// lets failed downloads without a project.json land in the right filters
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

const RATING_RESTRICTIVENESS: Record<ContentRating, number> = {
  uncategorized: 0,
  everyone: 1,
  questionable: 2,
  mature: 3
}

// contentrating and the tags can disagree, the stricter one wins
function stricterRating(a: ContentRating, b?: ContentRating): ContentRating {
  if (!b) return a
  return RATING_RESTRICTIVENESS[b] > RATING_RESTRICTIVENESS[a] ? b : a
}

async function safeGetWorkshopDetails(ids: string[]): Promise<Map<string, WorkshopDetails>> {
  try {
    return await getWorkshopDetails(ids)
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

// extra folders are often on HDDs, don't block the main process
export async function getDirSizeAsync(dirPath: string): Promise<number> {
  let total = 0
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += await getDirSizeAsync(full)
    } else if (entry.isFile()) {
      try { total += (await fs.promises.stat(full)).size } catch { /* skip */ }
    }
  }
  return total
}

function buildMeta(
  workshopId: string,
  localPath: string,
  pj: ProjectJson | null,
  existing?: WallpaperMeta,
  workshopTimeUpdated?: number,
  authorSteamId?: string,
  liveWorkshopTags?: string[],
  fileSize?: number
): WallpaperMeta {
  const now = Date.now()
  const { downloading: _d, downloadFailed: _df, ...existingRest } = existing ?? { appliedCount: 0, categories: [] }
  // the preview can still be downloading, the next scan picks it up
  const previewPath = pj?.preview ? path.join(localPath, pj.preview) : undefined
  // Steam can flag an item Mature later, only the live tags show that
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
    fileSize: fileSize ?? getDirSize(localPath),
    createdAt: existing?.createdAt ?? now,
    updatedAt: workshopTimeUpdated ? workshopTimeUpdated * 1000 : (existing?.updatedAt ?? now),
    subscribed: true,
    source: 'workshop',
    backupDir: existing?.backupDir ?? (existing?.source === 'backup' ? existing.localPath : undefined),
    tags: pj?.tags ?? existing?.tags ?? [],
    resolutions: liveWorkshopTags ? resolutionsFromTags(liveWorkshopTags) : existing?.resolutions,
    authorSteamId: authorSteamId ?? existing?.authorSteamId,
    // content may have changed, detect features and verify again
    hdr: undefined,
    hrtf: undefined,
    verifyProblem: undefined
  }
}

async function buildIncompleteMeta(
  workshopId: string,
  localPath: string,
  existing?: WallpaperMeta,
  workshopTags?: string[],
  authorSteamId?: string
): Promise<WallpaperMeta> {
  const now = Date.now()
  const { downloading, failed } = isSteamRunning()
    ? await getItemDownloadStatus(BigInt(workshopId))
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
    resolutions: workshopTags ? resolutionsFromTags(workshopTags) : existing?.resolutions,
    categories: existing?.categories ?? [],
    downloading,
    downloadFailed: failed,
    authorSteamId: authorSteamId ?? existing?.authorSteamId,
    backedUp: existing?.backedUp,
    backupOutdated: existing?.backupOutdated,
    backupDir: existing?.backupDir ?? (existing?.source === 'backup' ? existing.localPath : undefined)
  }
}

export async function importWallpaperById(workshopId: string): Promise<WallpaperMeta | null> {
  const localPath = path.join(getWorkshopPath(), workshopId)
  if (!fs.existsSync(localPath)) return null

  const existing = getWallpaper(workshopId) ?? undefined
  const details = (await safeGetWorkshopDetails([workshopId])).get(workshopId)
  const authorSteamId = existing?.authorSteamId ?? details?.authorSteamId
  const pj = readProjectJson(localPath)
  if (!pj) {
    const meta = await buildIncompleteMeta(workshopId, localPath, existing, details?.tags, authorSteamId)
    upsertWallpaper(meta)
    return meta
  }

  const meta = buildMeta(workshopId, localPath, pj, existing, details?.timeUpdated, authorSteamId, details?.tags)
  upsertWallpaper(meta)
  // a preset waiting on this item as its dependency can be decided now
  hdrUndecided.clear()
  queueHdrCheck()
  return meta
}

async function buildLocalMeta(
  id: string,
  localPath: string,
  existing?: WallpaperMeta,
  details?: WorkshopDetails
): Promise<WallpaperMeta | null> {
  const pj = readProjectJson(localPath)
  if (!pj) return null
  const fileSize = await getDirSizeAsync(localPath)
  const authorSteamId = existing?.authorSteamId ?? details?.authorSteamId
  return {
    ...buildMeta(id, localPath, pj, existing, details?.timeUpdated, authorSteamId, details?.tags, fileSize),
    subscribed: false,
    source: 'local'
  }
}

export async function importLocalWallpaper(localPath: string): Promise<WallpaperMeta | null> {
  const id = await localWallpaperId(localPath)
  if (!id) return null
  const existing = getWallpaper(id) ?? undefined
  if (existing && existing.source !== 'local') return null
  // the first library holding an id wins
  if (existing?.localPath && existing.localPath !== localPath && fs.existsSync(path.join(existing.localPath, 'project.json'))) {
    const roots = getExtraLibraryRoots()
    const rank = (p: string): number => roots.indexOf(path.dirname(path.resolve(p)))
    if (rank(existing.localPath) !== -1 && rank(existing.localPath) <= rank(localPath)) return null
  }

  const details = /^\d+$/.test(id) ? (await safeGetWorkshopDetails([id])).get(id) : undefined
  const meta = await buildLocalMeta(id, localPath, existing, details)
  if (!meta) return null
  upsertWallpaper(meta)
  queueHdrCheck()
  return meta
}

export async function scanLibrary(): Promise<{ imported: number; skipped: number; removed: number }> {
  const workshopPath = getWorkshopPath()
  // unmounted drive must not empty the library
  const workshopMounted = fs.existsSync(workshopPath)
  // dot folders are copies moved aside during a repair
  const entries = workshopMounted
    ? fs.readdirSync(workshopPath, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
    : []
  const onDisk = new Set(entries.filter(e => e.isDirectory()).map(e => e.name))
  const subscribedIds = isSteamRunning()
    ? new Set(await getSubscribedItems().catch(() => []))
    : new Set<string>()

  const wallpapers = store.get('wallpapers')
  let imported = 0
  let skipped = 0
  let removed = 0
  let resynced = false

  // drop workshop items whose folder is gone, unless still subscribed (tracked below)
  for (const id of Object.keys(wallpapers)) {
    if (wallpapers[id].source !== 'workshop' || !workshopMounted) continue
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
    if (existing?.localPath === localPath && !existing.downloading && existing.previewLocal !== undefined && fs.existsSync(existing.previewLocal) && existing?.contentRating !== undefined && existing?.fileSize !== undefined) {
      cacheHits.push(entry.name)
      skipped++
      continue
    }

    toRebuild.push({ entry, localPath, pj })
  }

  // subscribed items that never got a folder, see isItemStuckNeverDownloaded
  for (const id of subscribedIds) {
    if (onDisk.has(id)) continue
    if (isSteamRunning() && (await isItemStuckNeverDownloaded(BigInt(id)))) {
      await downloadItem(BigInt(id))
    }
    incomplete.push({ id, localPath: path.join(workshopPath, id) })
  }

  const roots = getExtraLibraryRoots()
  const { found, mounted } = await findLocalWallpapers(roots)
  const claimed = new Set([...onDisk, ...subscribedIds])
  for (const w of Object.values(wallpapers)) {
    if (w.source !== 'local') claimed.add(w.id)
  }
  const localFound = found.filter((f) => !claimed.has(f.id))
  const localIds = new Set(localFound.map((f) => f.id))
  for (const [id, w] of Object.entries(wallpapers)) {
    if (w.source !== 'local' || localIds.has(id) || claimed.has(id)) continue
    const root = path.dirname(path.resolve(w.localPath ?? ''))
    if (roots.includes(root) && !mounted.includes(root)) continue
    delete wallpapers[id]
    removed++
  }
  const localToBuild = localFound.filter((f) => {
    const existing = wallpapers[f.id]
    return !(existing?.source === 'local' && existing.localPath === f.localPath && existing.fileSize !== undefined)
  })
  skipped += localFound.length - localToBuild.length

  const details = await safeGetWorkshopDetails([
    ...incomplete.map((i) => i.id),
    ...toRebuild.map(({ entry }) => entry.name),
    ...cacheHits,
    ...localToBuild.map((f) => f.id).filter((id) => /^\d+$/.test(id))
  ])
  const authors = new Map<string, string>()
  for (const [id, d] of details) {
    if (!wallpapers[id]?.authorSteamId) authors.set(id, d.authorSteamId)
  }

  for (const { id, localPath } of incomplete) {
    const existing = wallpapers[id]
    const meta = await buildIncompleteMeta(id, localPath, existing, details.get(id)?.tags, authors.get(id))
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

  for (const { entry, localPath, pj } of toRebuild) {
    wallpapers[entry.name] = buildMeta(
      entry.name,
      localPath,
      pj,
      wallpapers[entry.name] ?? undefined,
      details.get(entry.name)?.timeUpdated,
      authors.get(entry.name),
      details.get(entry.name)?.tags
    )
    imported++
  }

  for (const { id, localPath } of localToBuild) {
    const meta = await buildLocalMeta(id, localPath, wallpapers[id], details.get(id))
    if (!meta) continue
    wallpapers[id] = meta
    imported++
  }

  for (const id of cacheHits) {
    const seconds = details.get(id)?.timeUpdated
    const authorId = authors.get(id)
    const live = details.get(id)?.tags

    // the author changed something, re-read project.json so a corrected rating sticks
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
    // only tighten, a failed tag fetch must not lower a rating
    const liveRating = live ? deriveRatingFromTags(live) : undefined
    if (liveRating) {
      const stricter = stricterRating(wallpapers[id].contentRating ?? 'uncategorized', liveRating)
      if (stricter !== wallpapers[id].contentRating) {
        patch.contentRating = stricter
      }
    }
    if (live) {
      const resolutions = resolutionsFromTags(live)
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

  cleanupFolders()
  cleanupPlaylists(new Set(Object.keys(wallpapers)))
  queueHdrCheck()

  return { imported, skipped, removed }
}

// flags workshop items whose listing was taken down, they can't be downloaded again
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

function isFromWorkshop(w: WallpaperMeta): boolean {
  return w.source === 'workshop' || (w.source === 'local' && /^\d+$/.test(w.id))
}

// bump when resolutionsFromTags() changes
const RESOLUTIONS_VERSION = 2

// resolution comes only from live tags, older or offline imports need this pass
export async function backfillResolutions(): Promise<boolean> {
  if (!isSteamRunning()) return false

  const rederive = store.get('resolutionsVersion') !== RESOLUTIONS_VERSION
  const ids = Object.values(store.get('wallpapers'))
    .filter((w) => isFromWorkshop(w) && (rederive || w.resolutions === undefined))
    .map((w) => w.id)

  let details = new Map<string, WorkshopDetails>()
  if (ids.length > 0) {
    try {
      details = await getWorkshopDetails(ids)
    } catch {
      return false
    }
  }

  // other writes may have landed during the fetch
  const wallpapers = store.get('wallpapers')
  let changed = false
  for (const id of ids) {
    const w = wallpapers[id]
    if (!w) continue
    const live = details.get(id)?.tags
    // removed or private items get "none" instead of being asked every tick
    const resolutions = live ? resolutionsFromTags(live) : (w.resolutions ?? [])
    if (sameTags(w.resolutions, resolutions)) continue
    wallpapers[id] = { ...w, resolutions }
    changed = true
  }
  if (changed) store.set('wallpapers', wallpapers)
  store.set('resolutionsVersion', RESOLUTIONS_VERSION)
  if (ids.length > 0) {
    console.log(`[Library] Resolution tags fetched for ${details.size} of ${ids.length} items`)
  }
  return changed
}

// undecided this session (no ffprobe, unreadable files), not re-read every tick
const hdrUndecided = new Set<string>()
let hdrPassRunning = false
let hdrPassQueued = false
let hdrListener: (() => void) | undefined

export function onHdrDetected(listener: () => void): void {
  hdrListener = listener
}

export function queueHdrCheck(): void {
  void backfillHdr().then((changed) => {
    if (changed) hdrListener?.()
  })
}

// HDR and HRTF share one scene read
export async function backfillHdr(): Promise<boolean> {
  if (hdrPassRunning) {
    hdrPassQueued = true
    return false
  }
  hdrPassRunning = true
  try {
    const pending = Object.values(store.get('wallpapers')).filter(
      (w) => (w.hdr === undefined || w.hrtf === undefined) && !!w.localPath && !w.downloading && !hdrUndecided.has(w.id)
    )
    if (pending.length === 0) return false

    let changed = false
    let results = new Map<string, WallpaperFeatures>()
    const flush = (): void => {
      if (results.size === 0) return
      const wallpapers = store.get('wallpapers')
      for (const [id, features] of results) {
        if (wallpapers[id]) wallpapers[id] = { ...wallpapers[id], ...features }
      }
      store.set('wallpapers', wallpapers)
      results = new Map()
      changed = true
    }

    // enough for SSDs without making HDDs seek back and forth
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < pending.length) {
        const w = pending[next++]
        const features = await detectFeatures(w).catch((): WallpaperFeatures => ({}))
        const known = Object.fromEntries(
          Object.entries(features).filter(([, value]) => value !== undefined)
        ) as WallpaperFeatures
        if (features.hdr === undefined || features.hrtf === undefined) hdrUndecided.add(w.id)
        if (Object.keys(known).length > 0) {
          results.set(w.id, known)
          if (results.size >= 500) flush()
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    flush()

    console.log(`[Library] HDR/HRTF check: ${pending.length} items read, ${hdrUndecided.size} undecided`)
    return changed
  } finally {
    hdrPassRunning = false
    if (hdrPassQueued) {
      hdrPassQueued = false
      queueHdrCheck()
    }
  }
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

/** Pulls the wallpaper out of any other folder */
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

/** Drops unknown ids and ids already claimed by an earlier folder, returns how many */
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

  // the profile with the most folders, usually '~'
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

  for (const f of bestProfile.folders) {
    const title = f.title ?? 'Untitled'
    if (existingTitles.has(title)) continue
    const items = Object.keys(f.items ?? {}).filter((k) => /^\d+$/.test(k))
    imported.push({ id: randomUUID(), title, items })
    existingTitles.add(title)
  }

  // playlist items are full file paths
  for (const p of bestProfile.playlists) {
    const title = p.name ?? 'Untitled Playlist'
    if (existingTitles.has(title)) continue
    const items: string[] = []
    for (const filePath of p.items ?? []) {
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
