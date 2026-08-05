import * as path from 'path'
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
interface UgcFfi {
  setUserItemVote: (ugc: unknown, itemId: bigint, voteUp: boolean) => bigint
  ugcPtr: unknown
}

let ugcFfi: UgcFfi | null = null

function getUgcFfi(): UgcFfi {
  if (!ugcFfi) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi')
    const libPath = path.join(
      path.dirname(require.resolve('steamworks.js')),
      'dist', 'linux64', 'libsteam_api.so'
    ).replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked')
    const steamLib = koffi.load(libPath)
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

export function voteOnItem(itemId: bigint, voteUp: boolean): void {
  getClient() // ensure Steam is initialized before touching the flat API
  const ffi = getUgcFfi()
  const handle = ffi.setUserItemVote(ffi.ugcPtr, itemId, voteUp)
  // k_uAPICallInvalid = 0 means the call failed immediately
  if (handle === BigInt(0)) throw new Error('SetUserItemVote failed')
  invalidateVoteCache()
}

export function openWorkshopItemOverlay(itemId: bigint): void {
  getClient().overlay.activateToWebPage(
    `https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`
  )
}

// Cached for the process lifetime; invalidateVoteCache() is called after each vote, and
// startVotedItemsSync() below periodically replaces it wholesale in the background so votes
// cast outside this app (Steam client, community website) show up without a restart.
let votedUpCache: Set<string> | null = null

async function fetchVotedUpItems(): Promise<Set<string>> {
  const c = getClient()
  const accountId = c.localplayer.getSteamId().accountId
  const ids = new Set<string>()
  let page = 1
  while (true) {
    const r = await c.workshop.getUserItems(
      page, accountId,
      2 /* VotedUp */, 13 /* UGCType.All, since WE items span multiple subtypes */,
      1 /* CreationOrderDesc */,
      { consumer: WE_APP_ID }
    )
    for (const item of r.items) {
      if (item) ids.add(item.publishedFileId.toString())
    }
    if (r.returnedResults === 0 || ids.size >= r.totalResults) break
    page++
  }
  return ids
}

export async function getVotedUpItemIds(): Promise<string[]> {
  if (votedUpCache) return [...votedUpCache]
  votedUpCache = await fetchVotedUpItems()
  return [...votedUpCache]
}

export function invalidateVoteCache(): void {
  votedUpCache = null
}

function sameIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

const VOTE_SYNC_INTERVAL_MS = 3 * 60 * 1000

// Background reconciliation for the vote cache: an in-app vote already updates the renderer
// optimistically (see WorkshopCard/WallpaperCard onLiked handlers), so this isn't on the
// critical path for your own votes - it's what catches up on votes cast elsewhere (Steam
// client, community website) and settles the rare case where SetUserItemVote's async call
// didn't actually land before the optimistic update fired.
let voteSyncTimer: ReturnType<typeof setInterval> | null = null

export function startVotedItemsSync(onChange: (ids: string[]) => void): void {
  if (voteSyncTimer) return
  voteSyncTimer = setInterval(async () => {
    if (!isSteamRunning()) return
    try {
      const fresh = await fetchVotedUpItems()
      const changed = !votedUpCache || !sameIds(votedUpCache, fresh)
      votedUpCache = fresh
      if (changed) onChange([...fresh])
    } catch {
      // transient Steam hiccup - just try again next tick
    }
  }, VOTE_SYNC_INTERVAL_MS)
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
