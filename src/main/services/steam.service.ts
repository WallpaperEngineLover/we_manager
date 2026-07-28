import * as path from 'path'
import { WE_APP_ID } from '@shared/constants'
import type { DownloadProgressEvent } from '@shared/types'

let client: ReturnType<typeof import('steamworks.js')['init']> | null = null

export function initSteam(): boolean {
  try {
    // steamworks.js is a native module and must be required at runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const steamworks: typeof import('steamworks.js') = require('steamworks.js')
    client = steamworks.init(WE_APP_ID)
    console.log('[Steam] Initialized')
    return true
  } catch (err) {
    console.warn('[Steam] Init failed (Steam may not be running):', err)
    return false
  }
}

export function isSteamRunning(): boolean {
  if (!client) initSteam()
  return client !== null
}

export function getClient() {
  if (!client) initSteam()
  if (!client) throw new Error('Steam not initialized')
  return client
}

export async function subscribeToItem(itemId: bigint): Promise<void> {
  await getClient().workshop.subscribe(itemId)
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
    )
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

// Fetched via getUserItems(VotedUp) and cached for the process lifetime;
// invalidateVoteCache() is called after each vote.
let votedUpCache: Set<string> | null = null

export async function getVotedUpItemIds(): Promise<string[]> {
  if (votedUpCache) return [...votedUpCache]
  const c = getClient()
  const accountId = c.localplayer.getSteamId().accountId
  const ids = new Set<string>()
  let page = 1
  while (true) {
    const r = await c.workshop.getUserItems(
      page, accountId,
      2 /* VotedUp */, 0 /* Items */,
      1 /* CreationOrderDesc */,
      { consumer: WE_APP_ID }
    )
    for (const item of r.items) {
      if (item) ids.add(item.publishedFileId.toString())
    }
    if (r.returnedResults === 0 || ids.size >= r.totalResults) break
    page++
  }
  votedUpCache = ids
  return [...ids]
}

export function invalidateVoteCache(): void {
  votedUpCache = null
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

export function getItemState(itemId: bigint): number {
  try {
    return getClient().workshop.state(itemId) as number
  } catch {
    return 0
  }
}

// EItemState flags from the Steamworks SDK (isteamugc.h)
const ITEM_STATE_DOWNLOAD_PENDING = 32
const ITEM_STATE_DOWNLOADING = 16

export function isItemDownloading(itemId: bigint): boolean {
  const state = getItemState(itemId)
  return (state & (ITEM_STATE_DOWNLOADING | ITEM_STATE_DOWNLOAD_PENDING)) !== 0
}
