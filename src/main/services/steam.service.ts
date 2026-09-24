import * as path from 'path'
import Store from 'electron-store'
import { app } from 'electron'
import { WE_APP_ID, STANDALONE_APP_ID } from '@shared/constants'
import type { DownloadProgressEvent, WorkshopAuthorInfo } from '@shared/types'
import { getSteamIdentity } from './config.service'

let client: ReturnType<typeof import('steamworks.js')['init']> | null = null

// Steam not running is a normal, common state (this app works as a local library manager
// without it). Every isSteamRunning()/getClient() call used to retry the native init and log a
// warning, so anything that polls (react-query refetches, library scans, ...) turned "Steam is
// closed" into a continuous stream of console warnings. Only actually retry - and only warn -
// once per cooldown window, and only log the first failure of a run.
const RETRY_COOLDOWN_MS = 15000
let lastInitAttempt = 0
let hasWarnedThisOutage = false

export function initSteam(): boolean {
  lastInitAttempt = Date.now()
  try {
    // steamworks.js is a native module and must be required at runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const steamworks: typeof import('steamworks.js') = require('steamworks.js')
    const appId = getSteamIdentity() === 'standalone' ? STANDALONE_APP_ID : WE_APP_ID
    client = steamworks.init(appId)
    hasWarnedThisOutage = false
    console.log(`[Steam] Initialized (app id ${appId})`)
    return true
  } catch (err) {
    client = null
    if (!hasWarnedThisOutage) {
      hasWarnedThisOutage = true
      console.warn('[Steam] Init failed (Steam may not be running):', err)
    }
    return false
  }
}

function ensureClient(): void {
  if (client) return
  if (Date.now() - lastInitAttempt < RETRY_COOLDOWN_MS) return
  initSteam()
}

export function isSteamRunning(): boolean {
  ensureClient()
  return client !== null
}

export function getClient() {
  ensureClient()
  if (!client) throw new Error('Steam not initialized')
  return client
}

export async function subscribeToItem(itemId: bigint): Promise<void> {
  await getClient().workshop.subscribe(itemId)
}

// Steam's subscribe doesn't reliably auto-download (seen with items subscribed via the Workshop
// website rather than the Steam client) - items can sit at bare "Subscribed" forever. This is the
// reliable kick; a no-op if already installed or downloading.
export function downloadItem(itemId: bigint, highPriority = true): boolean {
  try {
    return getClient().workshop.download(itemId, highPriority)
  } catch {
    return false
  }
}

export async function unsubscribeFromItem(itemId: bigint): Promise<void> {
  await getClient().workshop.unsubscribe(itemId)
}

// ISteamUGC::SetUserItemVote is not bound in steamworks.js, so we call the
// flat C API directly via koffi FFI. libsteam_api.so is already loaded by
// steamworks.js, so dlopen just returns the existing handle. Set up lazily
// after SteamAPI_Init so a load failure can't take down the whole app.
// eslint-disable-next-line @typescript-eslint/no-require-imports
type Koffi = typeof import('koffi')

let steamLibHandle: ReturnType<Koffi['load']> | null = null

function getSteamLib(): ReturnType<Koffi['load']> {
  if (!steamLibHandle) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi')
    const libPath = path.join(
      path.dirname(require.resolve('steamworks.js')),
      'dist', 'linux64', 'libsteam_api.so'
    ).replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked')
    steamLibHandle = koffi.load(libPath)
  }
  return steamLibHandle
}

interface UgcFfi {
  setUserItemVote: (ugc: unknown, itemId: bigint, voteUp: boolean) => bigint
  ugcPtr: unknown
}

let ugcFfi: UgcFfi | null = null

function getUgcFfi(): UgcFfi {
  if (!ugcFfi) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi')
    const steamLib = getSteamLib()
    const ugcPtrType = koffi.pointer(koffi.opaque('ISteamUGC'))
    const getSteamUGC = steamLib.func('SteamAPI_SteamUGC_v020', ugcPtrType, [])
    ugcFfi = {
      setUserItemVote: steamLib.func(
        'SteamAPI_ISteamUGC_SetUserItemVote', 'uint64', [ugcPtrType, 'uint64', 'bool']
      ),
      ugcPtr: getSteamUGC()
    }
  }
  return ugcFfi
}

let isLoggedOnFn: (() => boolean) | null = null

function isSteamOnline(): boolean {
  if (!isLoggedOnFn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi')
    const steamLib = getSteamLib()
    const userPtrType = koffi.pointer(koffi.opaque('ISteamUser'))
    const getSteamUser = steamLib.func('SteamAPI_SteamUser_v023', userPtrType, [])
    const bLoggedOn = steamLib.func('SteamAPI_ISteamUser_BLoggedOn', 'bool', [userPtrType])
    const userPtr = getSteamUser()
    isLoggedOnFn = () => bLoggedOn(userPtr)
  }
  return isLoggedOnFn()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// steamworks.js async calls have no timeout and can hang forever if Steam stalls
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

// steamworks.js has no vote bindings; this app's fork adds them (patches/steamworks-vote/), feature-detected so unpatched builds still work
interface PatchedVoteWorkshop {
  voteItem(itemId: bigint, voteUp: boolean): Promise<void>
  getUserVote(itemId: bigint): Promise<{ votedUp: boolean; votedDown: boolean; voteSkipped: boolean }>
}

function getPatchedVoteApi(client: ReturnType<typeof getClient>): PatchedVoteWorkshop | null {
  const workshop = client.workshop as unknown as Partial<PatchedVoteWorkshop>
  if (typeof workshop.voteItem === 'function' && typeof workshop.getUserVote === 'function') {
    return workshop as PatchedVoteWorkshop
  }
  return null
}

export async function checkUserVote(
  itemId: bigint
): Promise<{ votedUp: boolean; votedDown: boolean } | null> {
  const patched = getPatchedVoteApi(getClient())
  if (!patched) return null
  const result = await patched.getUserVote(itemId)
  return { votedUp: result.votedUp, votedDown: result.votedDown }
}

export function voteOnItem(itemId: bigint, voteUp: boolean): bigint {
  getClient() // ensure Steam is initialized before touching the flat API
  const ffi = getUgcFfi()
  const handle = ffi.setUserItemVote(ffi.ugcPtr, itemId, voteUp)
  // k_uAPICallInvalid = 0 means the call failed immediately
  if (handle === BigInt(0)) throw new Error('SetUserItemVote failed')
  return handle
}

export function openWorkshopItemOverlay(itemId: bigint): void {
  getClient().overlay.activateToWebPage(
    `https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`
  )
}

const USER_ITEM_TYPE = 13 // UGCType.All, since WE items span multiple subtypes
const CREATION_ORDER_DESC = 1
const VOTED_UP = 2
const VOTED_DOWN = 3
const PAGE_FETCH_TIMEOUT_MS = 8000
const VOTE_TIMEOUT_MS = 15000

async function getUserItemsPage(
  accountId: number,
  listType: number,
  page: number,
  retries = 2
): Promise<{ items: Array<{ publishedFileId: bigint } | null | undefined>; returnedResults: number; totalResults: number }> {
  const c = getClient()
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(
        c.workshop.getUserItems(
          page, accountId, listType, USER_ITEM_TYPE, CREATION_ORDER_DESC, { consumer: WE_APP_ID }
        ),
        PAGE_FETCH_TIMEOUT_MS,
        `getUserItems page ${page}`
      )
    } catch (err) {
      if (attempt >= retries) throw err
      await sleep(300 * (attempt + 1))
    }
  }
}

interface VoteCacheStore {
  accountId: number | null
  up: string[]
  missing: string[]
  lastFullSync: number
  pending: Record<string, { up: boolean; at: number }>
}

const voteStore = new Store<VoteCacheStore>({
  name: 'vote-cache',
  defaults: { accountId: null, up: [], missing: [], lastFullSync: 0, pending: {} }
})

let votedUpCache = new Set<string>(voteStore.get('up'))

// an id must be missing on two consecutive full crawls before it is dropped, to absorb pagination drift
let missingLastCycle = new Set<string>(voteStore.get('missing'))

// Steam's voted-up list lags behind the vote itself, so local votes stay authoritative until the crawl agrees or this window runs out
const PENDING_VOTE_TTL_MS = 15 * 60 * 1000
const pendingVotes = new Map<string, { up: boolean; at: number }>(
  Object.entries(voteStore.get('pending')).filter(([, v]) => Date.now() - v.at <= PENDING_VOTE_TTL_MS)
)

function applyPendingVotes(fresh: Set<string>): Set<string> {
  const now = Date.now()
  const merged = new Set(fresh)
  for (const [id, vote] of pendingVotes) {
    if (fresh.has(id) === vote.up || now - vote.at > PENDING_VOTE_TTL_MS) {
      pendingVotes.delete(id)
      continue
    }
    if (vote.up) merged.add(id)
    else merged.delete(id)
  }
  return merged
}

const PERSIST_DELAY_MS = 3000
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistDirty = false

function persistVoteCache(): void {
  persistDirty = true
  if (persistTimer) return
  persistTimer = setTimeout(flushVoteCache, PERSIST_DELAY_MS)
}

function flushVoteCache(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!persistDirty) return
  persistDirty = false
  voteStore.set('up', [...votedUpCache])
  voteStore.set('missing', [...missingLastCycle])
  voteStore.set('pending', Object.fromEntries(pendingVotes))
}

app.on('will-quit', flushVoteCache)

const VOTE_FETCH_CONCURRENCY = 3
const PAGE_PACING_MS = 150

// list sort orders use the item's publish date, not the vote date, so the only way to get the full liked list is to crawl all of it
async function fetchVotedItems(
  accountId: number,
  listType: number,
  onPage: (ids: string[]) => void
): Promise<Set<string>> {
  const ids = new Set<string>()
  const take = (items: Array<{ publishedFileId: bigint } | null | undefined>): void => {
    const pageIds: string[] = []
    for (const item of items) if (item) pageIds.push(item.publishedFileId.toString())
    for (const id of pageIds) ids.add(id)
    onPage(pageIds)
  }

  const first = await getUserItemsPage(accountId, listType, 1)
  take(first.items)

  const pageSize = first.returnedResults
  if (pageSize <= 0 || ids.size >= first.totalResults) return ids

  const totalPages = Math.ceil(first.totalResults / pageSize)
  const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 2)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < remainingPages.length) {
      const page = remainingPages[cursor++]
      const r = await getUserItemsPage(accountId, listType, page)
      take(r.items)
      await sleep(PAGE_PACING_MS)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(VOTE_FETCH_CONCURRENCY, remainingPages.length) }, worker)
  )

  return ids
}

const FULL_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000
const SYNC_CHECK_INTERVAL_MS = 10 * 60 * 1000
const SYNC_STARTUP_DELAY_MS = 20 * 1000
const PROGRESS_NOTIFY_INTERVAL_MS = 15 * 1000

let votedIdsChangeListener: ((ids: string[]) => void) | null = null
let syncInFlight = false
let lastSyncFailure = 0

function notifyVotedIds(): void {
  votedIdsChangeListener?.([...votedUpCache])
}

async function runFullSync(): Promise<void> {
  const accountId = getClient().localplayer.getSteamId().accountId
  if (voteStore.get('accountId') !== null && voteStore.get('accountId') !== accountId) {
    votedUpCache = new Set()
    missingLastCycle = new Set()
    pendingVotes.clear()
    notifyVotedIds()
  }
  voteStore.set('accountId', accountId)

  let lastNotify = Date.now()
  const seen = await fetchVotedItems(accountId, VOTED_UP, (pageIds) => {
    let added = false
    for (const id of pageIds) {
      if (!votedUpCache.has(id) && pendingVotes.get(id)?.up !== false) {
        votedUpCache.add(id)
        added = true
      }
    }
    if (!added) return
    persistVoteCache()
    if (Date.now() - lastNotify >= PROGRESS_NOTIFY_INTERVAL_MS) {
      lastNotify = Date.now()
      notifyVotedIds()
    }
  })

  const fresh = applyPendingVotes(seen)
  const merged = new Set(fresh)
  const missingThisCycle = new Set<string>()
  for (const id of votedUpCache) {
    if (fresh.has(id)) continue
    if (missingLastCycle.has(id)) continue
    merged.add(id)
    missingThisCycle.add(id)
  }
  const changed = !sameIds(votedUpCache, merged)
  missingLastCycle = missingThisCycle
  votedUpCache = merged
  voteStore.set('lastFullSync', Date.now())
  persistVoteCache()
  if (changed) notifyVotedIds()
  console.log(`[Steam] Liked list synced: ${votedUpCache.size} items`)
}

function maybeRunFullSync(): void {
  if (syncInFlight || !isSteamRunning()) return
  const now = Date.now()
  if (now - voteStore.get('lastFullSync') < FULL_SYNC_INTERVAL_MS) return
  if (now - lastSyncFailure < SYNC_CHECK_INTERVAL_MS) return
  syncInFlight = true
  runFullSync()
    .catch((err) => {
      lastSyncFailure = Date.now()
      console.warn('[Steam] Liked list sync failed, will retry later:', err?.message ?? err)
    })
    .finally(() => {
      syncInFlight = false
    })
}

function recordVote(idStr: string, voteUp: boolean): void {
  pendingVotes.set(idStr, { up: voteUp, at: Date.now() })
  if (voteUp) votedUpCache.add(idStr)
  else votedUpCache.delete(idStr)
  missingLastCycle.delete(idStr)
  persistVoteCache()
}

const VOTE_ATTEMPTS = 4
const VOTE_RETRY_BASE_MS = 1500
// Steam rejects or drops SetUserItemVote calls that overlap, so votes go out one at a time
const VOTE_GAP_MS = 400

let voteQueue: Promise<unknown> = Promise.resolve()

// kept for this session only, a failure usually means Steam was busy or offline at the time
const failedVotes = new Map<string, { up: boolean; message: string }>()
let failedVotesChangeListener: ((failed: Record<string, string>) => void) | null = null

export function getFailedVotes(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, failure] of failedVotes) {
    // liked elsewhere since, e.g. on the website or picked up by the background sync
    if (failure.up && votedUpCache.has(id)) failedVotes.delete(id)
    else out[id] = failure.message
  }
  return out
}

export function onFailedVotesChange(cb: (failed: Record<string, string>) => void): void {
  failedVotesChangeListener = cb
}

function setVoteFailure(idStr: string, failure: { up: boolean; message: string } | null): void {
  if (failure === null) {
    if (!failedVotes.delete(idStr)) return
  } else {
    failedVotes.set(idStr, failure)
  }
  failedVotesChangeListener?.(getFailedVotes())
}

export function voteOnItemAndConfirm(itemId: bigint, voteUp: boolean): Promise<boolean> {
  const run = voteQueue.then(() => voteWithRetry(itemId, voteUp))
  voteQueue = run.catch(() => {}).then(() => sleep(VOTE_GAP_MS))
  return run
}

async function voteWithRetry(itemId: bigint, voteUp: boolean): Promise<boolean> {
  let lastErr: unknown
  for (let attempt = 0; attempt < VOTE_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(VOTE_RETRY_BASE_MS * 2 ** (attempt - 1))
    if (!isSteamRunning()) throw new Error('Steam is not running - start Steam to like wallpapers')
    if (!isSteamOnline()) throw new Error('Steam is offline - check your internet connection and try again')
    try {
      const ok = await voteOnce(itemId, voteUp)
      setVoteFailure(itemId.toString(), null)
      return ok
    } catch (err) {
      lastErr = err
      console.warn(`[Steam] Vote on ${itemId} failed (attempt ${attempt + 1}/${VOTE_ATTEMPTS}):`, (err as Error)?.message ?? err)
    }
  }
  const msg = (lastErr as Error)?.message ?? String(lastErr)
  setVoteFailure(itemId.toString(), {
    up: voteUp,
    message: `${voteUp ? 'Like' : 'Dislike'} failed after ${VOTE_ATTEMPTS} attempts: ${msg}`
  })
  throw new Error(`Could not reach Steam to ${voteUp ? 'like' : 'dislike'} this wallpaper: ${msg}`)
}

// Without the patched steamworks.js, success is reported once SetUserItemVote is enqueued: its result can't be read back,
// because steamworks.js's manual dispatch loop consumes every call result on the shared Steam pipe first.
async function voteOnce(itemId: bigint, voteUp: boolean): Promise<boolean> {
  const idStr = itemId.toString()
  const patched = getPatchedVoteApi(getClient())

  if (patched) {
    await withTimeout(patched.voteItem(itemId, voteUp), VOTE_TIMEOUT_MS, 'Vote')
  } else {
    voteOnItem(itemId, voteUp)
  }
  recordVote(idStr, voteUp)
  return true
}

function sameIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

export async function getVotedUpItemIds(): Promise<string[]> {
  return [...votedUpCache]
}

// a vote this fresh may not have reached Steam's per-item lookup yet
const VOTE_SETTLE_MS = 10_000

export async function refreshItemVote(itemId: bigint): Promise<boolean | null> {
  if (!isSteamRunning() || !isSteamOnline()) return null
  const idStr = itemId.toString()
  const result = await withTimeout(checkUserVote(itemId), PAGE_FETCH_TIMEOUT_MS, 'getUserVote').catch((err) => {
    console.warn('[Steam] Per-item vote check failed:', err?.message ?? err)
    return null
  })
  if (!result) return null

  const pending = pendingVotes.get(idStr)
  if (pending && Date.now() - pending.at < VOTE_SETTLE_MS) return pending.up
  pendingVotes.delete(idStr)
  missingLastCycle.delete(idStr)

  if (votedUpCache.has(idStr) !== result.votedUp) {
    if (result.votedUp) votedUpCache.add(idStr)
    else votedUpCache.delete(idStr)
    persistVoteCache()
    notifyVotedIds()
  }
  return result.votedUp
}

let voteSyncTimer: ReturnType<typeof setInterval> | null = null

export function startVotedItemsSync(onChange: (ids: string[]) => void): void {
  votedIdsChangeListener = onChange
  if (voteSyncTimer) return
  setTimeout(maybeRunFullSync, SYNC_STARTUP_DELAY_MS)
  voteSyncTimer = setInterval(maybeRunFullSync, SYNC_CHECK_INTERVAL_MS)
}

export function getSubscribedItems(): string[] {
  return getClient()
    .workshop.getSubscribedItems()
    .map((id) => id.toString())
}

export function getDownloadInfo(itemId: bigint): DownloadProgressEvent | null {
  try {
    const info = getClient().workshop.downloadInfo(itemId)
    if (!info) return null
    const bytesTotal = Number(info.total)
    const bytesDownloaded = Number(info.current)
    return {
      itemId: itemId.toString(),
      bytesDownloaded,
      bytesTotal,
      percentage: bytesTotal > 0 ? Math.round((bytesDownloaded / bytesTotal) * 100) : 0,
      status: 'downloading'
    }
  } catch {
    return null
  }
}

export function getInstallInfo(itemId: bigint): { folder: string; sizeOnDisk: number } | null {
  try {
    const info = getClient().workshop.installInfo(itemId)
    if (!info) return null
    return { folder: info.folder, sizeOnDisk: Number(info.sizeOnDisk) }
  } catch {
    return null
  }
}

// steamworks.js only exposes persona info for the local player/friends, so this
// pulls it from the public community profile XML instead. Cached for the process lifetime.
const authorInfoCache = new Map<string, WorkshopAuthorInfo | null>()

export async function getAuthorInfo(steamId: string): Promise<WorkshopAuthorInfo | null> {
  if (authorInfoCache.has(steamId)) return authorInfoCache.get(steamId) ?? null
  try {
    const res = await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`)
    const xml = await res.text()
    const name = xml.match(/<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/)?.[1]
    const avatarUrl = xml.match(/<avatarFull><!\[CDATA\[([\s\S]*?)\]\]><\/avatarFull>/)?.[1]
    const info = name && avatarUrl ? { steamId, name, avatarUrl } : null
    authorInfoCache.set(steamId, info)
    return info
  } catch {
    authorInfoCache.set(steamId, null)
    return null
  }
}

export function getItemState(itemId: bigint): number {
  try {
    return getClient().workshop.state(itemId) as number
  } catch {
    return 0
  }
}

// EItemState flags from the Steamworks SDK (isteamugc.h)
const ITEM_STATE_INSTALLED = 4
const ITEM_STATE_NEEDS_UPDATE = 8
const ITEM_STATE_DOWNLOADING = 16
const ITEM_STATE_DOWNLOAD_PENDING = 32

// True for a subscribed item Steam has never actually started fetching - not installed, not
// mid-transfer, not even flagged as needing an update. See downloadItem() above.
export function isItemStuckNeverDownloaded(itemId: bigint): boolean {
  const state = getItemState(itemId)
  const installed = (state & ITEM_STATE_INSTALLED) !== 0
  const inProgress = (state & (ITEM_STATE_DOWNLOADING | ITEM_STATE_DOWNLOAD_PENDING | ITEM_STATE_NEEDS_UPDATE)) !== 0
  return !installed && !inProgress
}

export function isItemDownloading(itemId: bigint): boolean {
  const state = getItemState(itemId)
  return (state & (ITEM_STATE_DOWNLOADING | ITEM_STATE_DOWNLOAD_PENDING)) !== 0
}

// NeedsUpdate stays set while Steam hasn't caught the local copy up to the server version. If
// it's set but nothing is actively downloading/pending, Steam gave up on the transfer (e.g. it
// errored out or the disk filled up). A never-downloaded item reports neither bit - treated as
// "downloading" since the caller (scanLibrary) just kicked one off for it.
export function getItemDownloadStatus(itemId: bigint): { downloading: boolean; failed: boolean } {
  const state = getItemState(itemId)
  const downloading =
    (state & (ITEM_STATE_DOWNLOADING | ITEM_STATE_DOWNLOAD_PENDING)) !== 0 || isItemStuckNeverDownloaded(itemId)
  const failed = !downloading && (state & ITEM_STATE_NEEDS_UPDATE) !== 0
  return { downloading, failed }
}
