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

export async function voteItem(itemId: bigint, voteUp: boolean): Promise<void> {
  await getClient().workshop.setUserItemVote(itemId, voteUp)
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
