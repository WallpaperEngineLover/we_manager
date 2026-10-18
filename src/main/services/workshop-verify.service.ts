import * as fs from 'fs'
import * as path from 'path'
import type { VerifyProblem, VerifyResult, WallpaperMeta } from '@shared/types'
import * as library from './library.service'
import * as steam from './steam.service'
import { exists, findFolderProblem, forEachLimit } from './backup.service'
import { getWorkshopPath } from '../utils/paths'

// the workshop folder is often on a HDD
const VERIFY_CONCURRENCY = 4

export interface ItemCheck {
  problem: VerifyProblem | null
  detail?: string
  busy?: boolean
}

export function presetDependency(pj: { dependency?: string | number }): string | null {
  const id = pj.dependency == null ? '' : String(pj.dependency)
  return /^\d+$/.test(id) ? id : null
}

// EItemState and install size vs the folder; a failed Steam call throws instead of reporting "not installed"
export async function checkItem(wallpaper: WallpaperMeta): Promise<ItemCheck> {
  const id = BigInt(wallpaper.id)
  const state = await steam.fetchItemState(id)
  if (state & (steam.ITEM_STATE_DOWNLOADING | steam.ITEM_STATE_DOWNLOAD_PENDING)) return { problem: null, busy: true }
  if (!(state & steam.ITEM_STATE_INSTALLED)) return { problem: 'notInstalled' }
  if (state & steam.ITEM_STATE_NEEDS_UPDATE) return { problem: 'needsUpdate' }

  const info = await steam.getInstallInfo(id)
  const dir = info?.folder || wallpaper.localPath
  if (!dir) return { problem: 'missingFolder' }
  const folderProblem = await findFolderProblem(dir)
  if (folderProblem) return { problem: folderProblem.code, detail: folderProblem.detail }

  // a preset's wallpaper is its dependency
  const pj = library.readProjectJson(dir)
  if (pj && !pj.file) {
    const dependency = presetDependency(pj)
    if (!dependency) return { problem: 'missingMainFile', detail: 'project.json names no file and no dependency' }
    if (!library.readProjectJson(path.join(path.dirname(dir), dependency))) {
      return { problem: 'missingDependency', detail: `dependency ${dependency} is not installed` }
    }
  }

  // WE adds its shader cache later, so only smaller means missing
  if (info && info.sizeOnDisk > 0) {
    const actual = await library.getDirSizeAsync(dir)
    if (actual < info.sizeOnDisk) {
      return { problem: 'missingData', detail: `${actual} of ${info.sizeOnDisk} bytes on disk` }
    }
  }
  return { problem: null }
}

/** dot names are skipped by the scan and watcher */
export function repairStashOf(dir: string, itemId: string): string {
  return path.join(path.dirname(dir), `.reverify-${itemId}`)
}

const STASH_NAME = /^\.reverify-(\d+)$/
const STATE_CHECK_TIMEOUT_MS = 3000
const HOST_START_TIMEOUT_MS = 15_000

async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Steam did not answer')), ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function steamIsFetching(itemId: string): Promise<boolean> {
  try {
    await within(steam.whenHostReady(), HOST_START_TIMEOUT_MS)
    const state = await within(steam.fetchItemState(BigInt(itemId)), STATE_CHECK_TIMEOUT_MS)
    return (state & (steam.ITEM_STATE_DOWNLOADING | steam.ITEM_STATE_DOWNLOAD_PENDING)) !== 0
  } catch {
    return false
  }
}

/**
 * After an interrupted repair, restores the old copy (true) unless Steam's folder is complete. While Steam is still
 * fetching the item neither folder is touched, the old copy may be all there is
 */
export async function settleRepairStash(dir: string, stash: string): Promise<boolean> {
  if (!(await exists(stash))) return false
  const itemId = STASH_NAME.exec(path.basename(stash))?.[1]
  if (itemId && (await steamIsFetching(itemId))) return false
  if (!(await findFolderProblem(dir))) {
    await fs.promises.rm(stash, { recursive: true, force: true })
    return false
  }
  console.log(`[Verify] Putting back the old copy from ${stash}`)
  await fs.promises.rm(dir, { recursive: true, force: true })
  await fs.promises.rename(stash, dir)
  return true
}

let stashesRestored: Promise<void> | null = null

/** Before the first scan, which would drop stashed items */
export function restoreRepairStashes(): Promise<void> {
  stashesRestored ??= (async () => {
    const root = getWorkshopPath()
    let names: string[]
    try {
      names = await fs.promises.readdir(root)
    } catch {
      return
    }
    for (const name of names) {
      const id = STASH_NAME.exec(name)?.[1]
      if (!id) continue
      try {
        await settleRepairStash(path.join(root, id), path.join(root, name))
      } catch (err) {
        console.warn(`[Verify] Could not settle ${name}:`, err)
      }
    }
  })()
  return stashesRestored
}

// subscriptions too, which may have no workshop entry yet

async function verifiableItems(ids?: string[]): Promise<{ wallpaper: WallpaperMeta; inLibrary: boolean }[]> {
  const wanted = ids ? new Set(ids) : null
  const all = library.getAllWallpapers()
  const byId = new Map(all.map((w) => [w.id, w]))
  const items = all
    .filter((w) => w.source === 'workshop' && (!wanted || wanted.has(w.id)))
    .map((wallpaper) => ({ wallpaper, inLibrary: true }))

  const subscribed = await steam.getSubscribedItems()
  for (const id of subscribed) {
    const existing = byId.get(id)
    if (existing?.source === 'workshop' || (wanted && !wanted.has(id))) continue
    console.log(`[Verify] ${id} is subscribed but ${existing ? `a ${existing.source} entry` : 'not in the library'}`)
    items.push({
      wallpaper: {
        id,
        title: existing?.title ?? id,
        type: existing?.type ?? 'scene',
        source: 'workshop',
        localPath: path.join(getWorkshopPath(), id),
        subscribed: true,
        createdAt: 0,
        updatedAt: 0,
        appliedCount: 0,
        tags: [],
        categories: []
      },
      inLibrary: false
    })
  }
  return items
}

export async function verifyItems(
  ids: string[] | undefined,
  onProgress: (done: number, total: number) => void
): Promise<VerifyResult> {
  if (!steam.isSteamRunning()) throw new Error('Steam is not running')
  const items = await verifiableItems(ids)
  const patches: { id: string; patch: Partial<WallpaperMeta> }[] = []
  const damaged: string[] = []
  let skipped = 0
  let done = 0

  onProgress(0, items.length)
  await forEachLimit(items, VERIFY_CONCURRENCY, async ({ wallpaper: w, inLibrary }) => {
    try {
      if (w.downloading) {
        skipped++
        return
      }
      const check = await checkItem(w)
      if (check.busy) {
        skipped++
        return
      }
      if (check.problem) {
        console.warn(`[Verify] ${w.id} (${w.title}): ${check.problem}${check.detail ? ` - ${check.detail}` : ''}`)
        damaged.push(w.id)
      }
      if (inLibrary && check.problem !== (w.verifyProblem ?? null)) {
        patches.push({ id: w.id, patch: { verifyProblem: check.problem ?? undefined } })
      }
    } catch (err) {
      console.warn(`[Verify] ${w.id}:`, err)
      skipped++
    } finally {
      onProgress(++done, items.length)
    }
  })

  if (patches.length > 0) library.applyWallpaperChanges({ patches })
  return { checked: items.length - skipped, skipped, damaged }
}
