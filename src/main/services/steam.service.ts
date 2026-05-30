import * as path from 'path'
import type { DownloadProgressEvent } from '@shared/types'

// steamworks.js must be required at runtime (native module)
// eslint-disable-next-line @typescript-eslint/no-require-imports
let steamworks: typeof import('steamworks.js') | null = null
let client: ReturnType<typeof import('steamworks.js')['init']> | null = null

export function initSteam(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    steamworks = require('steamworks.js')
    client = steamworks!.init(431960) // Wallpaper Engine
    console.log('[Steam] Initialized successfully')
    return true
  } catch (err) {
    console.warn('[Steam] Init failed (Steam may not be running):', err)
    return false
  }
}

export function isSteamRunning(): boolean {
  return client !== null
}

export function getClient() {
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
// steamworks.js, so dlopen just returns the existing handle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const koffi = require('koffi')
const _libPath = path.join(
  path.dirname(require.resolve('steamworks.js')),
  'dist', 'linux64', 'libsteam_api.so'
)
const _steamLib = koffi.load(_libPath)
const _UGCType = koffi.opaque('ISteamUGC')
const _UGCPtr = koffi.pointer(_UGCType)
const _getSteamUGC = _steamLib.func('SteamAPI_SteamUGC_v020', _UGCPtr, [])
const _setUserItemVote = _steamLib.func(
  'SteamAPI_ISteamUGC_SetUserItemVote', 'uint64', [_UGCPtr, 'uint64', 'bool']
)
// Resolved lazily after SteamAPI_Init (called inside steamworks.init)
let _ugcPtr: unknown = null
function getUGCPtr(): unknown {
  if (!_ugcPtr) _ugcPtr = _getSteamUGC()
  return _ugcPtr
}

export function voteOnItem(itemId: bigint, voteUp: boolean): void {
  const handle = _setUserItemVote(getUGCPtr(), itemId, voteUp)
  // k_uAPICallInvalid = 0 means the call failed immediately
  if (handle === BigInt(0)) throw new Error('SetUserItemVote failed')
  invalidateVoteCache()
}

export function openWorkshopItemOverlay(itemId: bigint): void {
  getClient().overlay.activateToWebPage(
    `https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`
  )
}

// steamworks.js does not expose SetUserItemVote, so we fetch via getUserItems(VotedUp).
// Results are cached for the process lifetime; call invalidateVoteCache() after a vote.
let _votedUpCache: Set<string> | null = null

export async function getVotedUpItemIds(): Promise<string[]> {
  if (_votedUpCache) return [..._votedUpCache]
  const c = getClient()
  const accountId = c.localplayer.getSteamId().accountId
  const ids = new Set<string>()
  let page = 1
  while (true) {
    const r = await c.workshop.getUserItems(
      page, accountId,
      2 /* VotedUp */, 0 /* Items */,
      1 /* CreationOrderDesc */,
      { consumer: 431960 }
    )
    for (const item of r.items) {
      if (item) ids.add(item.publishedFileId.toString())
    }
    if (r.returnedResults === 0 || ids.size >= r.totalResults) break
    page++
  }
  _votedUpCache = ids
  return [...ids]
}

export function invalidateVoteCache(): void {
  _votedUpCache = null
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
    const bytesTotal = Number(info.bytesTotal)
    const bytesDownloaded = Number(info.bytesDownloaded)
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
    return getClient().workshop.installInfo(itemId) as { folder: string; sizeOnDisk: number }
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
