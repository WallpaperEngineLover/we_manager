import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app, utilityProcess, type BrowserWindow, type UtilityProcess } from 'electron'
import { WE_APP_ID, STANDALONE_APP_ID } from '@shared/constants'
import type { DownloadProgressEvent, FavoriteFailure, FavoriteStatus, WorkshopAuthorInfo } from '@shared/types'
import { getSteamIdentity } from './config.service'
import { encodeBigInts, decodeBigInts, type SteamHostResponse } from '../steam-host-protocol'
import { hostCommand, isFlatpak } from '../utils/flatpak'
import { SteamListCache } from './steam-list-cache'

// Steam counts a process that called SteamAPI_Init as a running game, which also breaks Steam
// Game Recording. Like WE's ui32.exe, the connection only lives while the window is shown.
let windowActive = false

// Steam not running is a normal, common state (this app works as a local library manager
// without it). Only retry a failed connect - and only warn - once per cooldown window, and only
// log the first failure of a run.
const RETRY_COOLDOWN_MS = 15000
let lastInitFailure = 0
let hasWarnedThisOutage = false

let host: UtilityProcess | null = null
let hostReady: Promise<void> | null = null
let nextRequestId = 1
const pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let inFlight = 0

const STEAM_PID_FILES = [
  path.join(os.homedir(), '.steam', 'steam.pid'),
  path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', '.steam', 'steam.pid')
]
const PROCESS_CHECK_TTL_MS = 5000
let processCheck = { at: 0, alive: false }

// Flatpak Steam writes a pid from its own namespace, hence the /proc scan fallback (the host is asked from our own Flatpak)
function steamProcessAlive(): boolean {
  if (Date.now() - processCheck.at < PROCESS_CHECK_TTL_MS) return processCheck.alive
  if (isFlatpak()) {
    let hostAlive = false
    try {
      const [file, args] = hostCommand('pgrep', ['-x', 'steam'])
      execFileSync(file, args, { stdio: 'ignore', timeout: 5000 })
      hostAlive = true
    } catch {
      hostAlive = false
    }
    processCheck = { at: Date.now(), alive: hostAlive }
    return hostAlive
  }
  let alive = false
  for (const file of STEAM_PID_FILES) {
    try {
      const pid = Number(fs.readFileSync(file, 'utf8').trim())
      if (pid > 0 && fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() === 'steam') {
        alive = true
        break
      }
    } catch {
      // no pid file or the process is gone
    }
  }
  if (!alive) {
    try {
      alive = fs.readdirSync('/proc').some((entry) => {
        if (!/^\d+$/.test(entry)) return false
        try {
          return fs.readFileSync(`/proc/${entry}/comm`, 'utf8').trim() === 'steam'
        } catch {
          return false
        }
      })
    } catch {
      alive = false
    }
  }
  processCheck = { at: Date.now(), alive }
  return alive
}

function stopHost(): void {
  host?.kill()
  host = null
  hostReady = null
}

app.on('will-quit', stopHost)

export function bindSteamToWindow(win: BrowserWindow): void {
  const update = (): void => {
    const active = !win.isDestroyed() && win.isVisible() && !win.isMinimized()
    if (active === windowActive) return
    windowActive = active
    // calls already running get to finish, steamCall() disconnects after the last one
    if (!active && host && inFlight === 0) {
      console.log('[Steam] Window hidden, disconnecting')
      stopHost()
    }
  }
  win.on('show', update)
  win.on('hide', update)
  win.on('minimize', update)
  win.on('restore', update)
  win.on('closed', update)
  update()
}

export function isSteamAllowed(): boolean {
  return windowActive
}

// steamworks.js async calls have no timeout of their own, a hung one would otherwise keep the
// connection open forever
const REQUEST_TIMEOUT_MS = 60 * 1000

function send(proc: UtilityProcess, method: string, args: unknown[]): Promise<unknown> {
  const id = nextRequestId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Steam ${method} timed out`))
    }, REQUEST_TIMEOUT_MS)
    pendingRequests.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      reject: (e) => {
        clearTimeout(timer)
        reject(e)
      }
    })
    proc.postMessage(encodeBigInts({ id, method, args }))
  })
}

function startHost(): Promise<void> {
  const proc = utilityProcess.fork(path.join(__dirname, 'steam-host.js'), [], {
    serviceName: 'we-manager-steam',
    stdio: 'inherit'
  })
  host = proc
  proc.on('message', (data) => {
    const res = decodeBigInts(data) as SteamHostResponse
    const pending = pendingRequests.get(res.id)
    if (!pending) return
    pendingRequests.delete(res.id)
    if (res.error !== undefined) pending.reject(new Error(res.error))
    else pending.resolve(res.result)
  })
  proc.on('exit', (code) => {
    if (host === proc) {
      host = null
      hostReady = null
    }
    if (pendingRequests.size > 0) {
      const err = new Error(`Steam host exited (code ${code})`)
      for (const pending of pendingRequests.values()) pending.reject(err)
      pendingRequests.clear()
    }
  })

  const appId = getSteamIdentity() === 'standalone' ? STANDALONE_APP_ID : WE_APP_ID
  return send(proc, 'init', [appId]).then(
    () => {
      hasWarnedThisOutage = false
      console.log(`[Steam] Connected (app id ${appId})`)
    },
    (err) => {
      if (host === proc) stopHost()
      lastInitFailure = Date.now()
      if (!hasWarnedThisOutage) {
        hasWarnedThisOutage = true
        console.warn('[Steam] Init failed (Steam may not be running):', err?.message ?? err)
      }
      throw err
    }
  )
}

async function steamCall<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!windowActive) throw new Error('Steam is only used while the window is open')
  if (!isSteamRunning()) throw new Error('Steam not running')
  inFlight++
  try {
    if (!hostReady) hostReady = startHost()
    await hostReady
    return (await send(host!, method, args)) as T
  } finally {
    inFlight--
    if (inFlight === 0 && host && !windowActive) {
      console.log('[Steam] Window hidden, disconnecting')
      stopHost()
    }
  }
}

export function isSteamRunning(): boolean {
  if (!windowActive) return false
  if (Date.now() - lastInitFailure < RETRY_COOLDOWN_MS) return false
  return steamProcessAlive()
}

export async function getLocalAccountId(): Promise<number> {
  const id = await steamCall<{ accountId: number }>('localplayer.getSteamId')
  return id.accountId
}

export function getSubscribedIds(): Promise<bigint[]> {
  return steamCall<bigint[]>('workshop.getSubscribedItems')
}

export function workshopCall<T>(method: string, ...args: unknown[]): Promise<T> {
  return steamCall<T>(`workshop.${method}`, ...args)
}

export async function subscribeToItem(itemId: bigint): Promise<void> {
  await steamCall('workshop.subscribe', itemId)
}

// Steam's subscribe doesn't reliably auto-download (seen with items subscribed via the Workshop
// website rather than the Steam client) - items can sit at bare "Subscribed" forever. This is the
// reliable kick; a no-op if already installed or downloading.
export async function downloadItem(itemId: bigint, highPriority = true): Promise<boolean> {
  try {
    return await steamCall<boolean>('workshop.download', itemId, highPriority)
  } catch {
    return false
  }
}

export async function unsubscribeFromItem(itemId: bigint): Promise<void> {
  await steamCall('workshop.unsubscribe', itemId)
}

function isSteamOnline(): Promise<boolean> {
  return steamCall<boolean>('isOnline')
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
let hasPatchedVoteApi: boolean | null = null

async function patchedVoteApiAvailable(): Promise<boolean> {
  if (hasPatchedVoteApi === null) {
    const [vote, check] = await Promise.all([
      steamCall<boolean>('hasMethod', 'workshop.voteItem'),
      steamCall<boolean>('hasMethod', 'workshop.getUserVote')
    ])
    hasPatchedVoteApi = vote && check
  }
  return hasPatchedVoteApi
}

export async function checkUserVote(
  itemId: bigint
): Promise<{ votedUp: boolean; votedDown: boolean } | null> {
  if (!(await patchedVoteApiAvailable())) return null
  const result = await steamCall<{ votedUp: boolean; votedDown: boolean }>('workshop.getUserVote', itemId)
  return { votedUp: result.votedUp, votedDown: result.votedDown }
}

export function voteOnItem(itemId: bigint, voteUp: boolean): Promise<bigint> {
  return steamCall<bigint>('voteRaw', itemId, voteUp)
}

export async function openWorkshopItemOverlay(itemId: bigint): Promise<void> {
  await steamCall('overlay.activateToWebPage', `https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`)
}

const USER_ITEM_TYPE = 13 // UGCType.All, since WE items span multiple subtypes
const CREATION_ORDER_DESC = 1
const VOTED_UP = 2
const VOTED_DOWN = 3
const FAVORITED = 4
const PAGE_FETCH_TIMEOUT_MS = 8000
const VOTE_TIMEOUT_MS = 15000

interface UserItemsPage {
  items: Array<{ publishedFileId: bigint } | null | undefined>
  returnedResults: number
  totalResults: number
}

async function getUserItemsPage(
  accountId: number,
  listType: number,
  page: number,
  retries = 2
): Promise<UserItemsPage> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(
        workshopCall<UserItemsPage>(
          'getUserItems', page, accountId, listType, USER_ITEM_TYPE, CREATION_ORDER_DESC, { consumer: WE_APP_ID }
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

const VOTE_FETCH_CONCURRENCY = 3
const PAGE_PACING_MS = 150

// lists sort by publish date, not vote date, so a full list means crawling all of it
async function fetchUserList(
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

function listSource(listType: number) {
  return {
    canSync: isSteamRunning,
    getAccountId: getLocalAccountId,
    crawl: (accountId: number, onPage: (ids: string[]) => void) => fetchUserList(accountId, listType, onPage)
  }
}

const likedList = new SteamListCache('Liked list', 'vote-cache', listSource(VOTED_UP))
const dislikedList = new SteamListCache('Disliked list', 'dislike-cache', listSource(VOTED_DOWN))
const favoriteList = new SteamListCache('Favorites', 'favorite-cache', listSource(FAVORITED))

const WRITE_ATTEMPTS = 4
const WRITE_RETRY_BASE_MS = 1500
// Steam drops overlapping UGC writes
const WRITE_GAP_MS = 400

let writeQueue: Promise<unknown> = Promise.resolve()

function queueSteamWrite<T>(run: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(run)
  writeQueue = result.catch(() => {}).then(() => sleep(WRITE_GAP_MS))
  return result
}

async function withRetry(what: string, attempt: () => Promise<void>): Promise<void> {
  let lastErr: unknown
  for (let i = 0; i < WRITE_ATTEMPTS; i++) {
    if (i > 0) await sleep(WRITE_RETRY_BASE_MS * 2 ** (i - 1))
    if (!isSteamRunning()) throw new Error(`Steam is not running - start Steam to ${what}`)
    if (!(await isSteamOnline())) throw new Error('Steam is offline - check your internet connection and try again')
    try {
      await attempt()
      return
    } catch (err) {
      lastErr = err
      console.warn(`[Steam] Could not ${what} (attempt ${i + 1}/${WRITE_ATTEMPTS}):`, (err as Error)?.message ?? err)
    }
  }
  throw lastErr
}

// kept for this session only, a failure usually means Steam was busy or offline at the time
const failedVotes = new Map<string, { up: boolean; message: string }>()
let failedVotesChangeListener: ((failed: Record<string, string>) => void) | null = null

export function getFailedVotes(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, failure] of failedVotes) {
    // liked elsewhere since, e.g. on the website or picked up by the background sync
    if ((failure.up ? likedList : dislikedList).has(id)) failedVotes.delete(id)
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
  const idStr = itemId.toString()
  return queueSteamWrite(async () => {
    try {
      await withRetry(voteUp ? 'like wallpapers' : 'dislike wallpapers', () => voteOnce(itemId, voteUp))
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      setVoteFailure(idStr, {
        up: voteUp,
        message: `${voteUp ? 'Like' : 'Dislike'} failed after ${WRITE_ATTEMPTS} attempts: ${msg}`
      })
      throw new Error(`Could not reach Steam to ${voteUp ? 'like' : 'dislike'} this wallpaper: ${msg}`)
    }
    setVoteFailure(idStr, null)
    likedList.record(idStr, voteUp)
    dislikedList.record(idStr, !voteUp)
    return true
  })
}

// Without the patched steamworks.js, success is reported once SetUserItemVote is enqueued: its result can't be read back,
// because steamworks.js's manual dispatch loop consumes every call result on the shared Steam pipe first.
async function voteOnce(itemId: bigint, voteUp: boolean): Promise<void> {
  if (await patchedVoteApiAvailable()) {
    await withTimeout(steamCall('workshop.voteItem', itemId, voteUp), VOTE_TIMEOUT_MS, 'Vote')
  } else {
    await voteOnItem(itemId, voteUp)
  }
}

export async function getVotedUpItemIds(): Promise<string[]> {
  return likedList.list()
}

export function getVotedDownItemIds(): string[] {
  return dislikedList.list()
}

export async function refreshItemVote(itemId: bigint): Promise<boolean | null> {
  if (!isSteamRunning() || !(await isSteamOnline().catch(() => false))) return null
  const result = await withTimeout(checkUserVote(itemId), PAGE_FETCH_TIMEOUT_MS, 'getUserVote').catch((err) => {
    console.warn('[Steam] Per-item vote check failed:', err?.message ?? err)
    return null
  })
  if (!result) return null
  dislikedList.applyCheck(itemId.toString(), result.votedDown)
  return likedList.applyCheck(itemId.toString(), result.votedUp)
}

let hasPatchedFavoriteApi: boolean | null = null

async function patchedFavoriteApiAvailable(): Promise<boolean> {
  if (hasPatchedFavoriteApi === null) {
    const [add, remove] = await Promise.all([
      steamCall<boolean>('hasMethod', 'workshop.addFavorite'),
      steamCall<boolean>('hasMethod', 'workshop.removeFavorite')
    ])
    hasPatchedFavoriteApi = add && remove
  }
  return hasPatchedFavoriteApi
}

// favorites belong to WE's app id, even when connected as Spacewar
async function favoriteOnce(itemId: bigint, add: boolean): Promise<void> {
  if (await patchedFavoriteApiAvailable()) {
    const method = add ? 'workshop.addFavorite' : 'workshop.removeFavorite'
    await withTimeout(steamCall(method, WE_APP_ID, itemId), VOTE_TIMEOUT_MS, 'Favorite')
  } else {
    await steamCall<bigint>('favoriteRaw', WE_APP_ID, itemId, add)
  }
}

// session-only, like failedVotes
const failedFavorites = new Map<string, FavoriteFailure>()
let favoriteStatusListener: ((status: FavoriteStatus) => void) | null = null

export function getFavoriteStatus(): FavoriteStatus {
  const failed: Record<string, FavoriteFailure> = {}
  for (const [id, failure] of failedFavorites) {
    // already as intended, e.g. changed on the website
    if (favoriteList.has(id) === failure.add) failedFavorites.delete(id)
    else failed[id] = failure
  }
  return { failed, checking: favoriteList.unverified() }
}

export function onFavoriteStatusChange(cb: (status: FavoriteStatus) => void): void {
  favoriteStatusListener = cb
}

function favoriteStatusChanged(): void {
  favoriteStatusListener?.(getFavoriteStatus())
}

favoriteList.onVerified((id, add, confirmed) => {
  if (confirmed) {
    failedFavorites.delete(id)
  } else {
    console.warn(`[Steam] Favorites list still ${add ? 'misses' : 'has'} ${id}, the change didn't stick`)
    failedFavorites.set(id, {
      add,
      readBack: true,
      message: `Steam accepted the ${add ? 'favorite' : 'removal'}, but your favorites list still ${add ? "doesn't show" : 'shows'} this wallpaper 15 minutes later`
    })
  }
  favoriteStatusChanged()
})

export function setFavorite(itemId: bigint, add: boolean): Promise<boolean> {
  const idStr = itemId.toString()
  return queueSteamWrite(async () => {
    try {
      await withRetry(add ? 'add favorites' : 'remove favorites', () => favoriteOnce(itemId, add))
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      failedFavorites.set(idStr, {
        add,
        readBack: false,
        message: `${add ? 'Adding to' : 'Removing from'} favorites failed after ${WRITE_ATTEMPTS} attempts: ${msg}`
      })
      favoriteStatusChanged()
      throw new Error(`Could not reach Steam to ${add ? 'favorite' : 'unfavorite'} this wallpaper: ${msg}`)
    }
    failedFavorites.delete(idStr)
    favoriteList.record(idStr, add)
    favoriteStatusChanged()
    return true
  })
}

export function getFavoriteItemIds(): string[] {
  return favoriteList.list()
}

const SYNC_CHECK_INTERVAL_MS = 10 * 60 * 1000
const SYNC_STARTUP_DELAY_MS = 20 * 1000
let listSyncTimer: ReturnType<typeof setInterval> | null = null

export function startUserListSync(listeners: {
  onLikedChange: (ids: string[]) => void
  onDislikedChange: (ids: string[]) => void
  onFavoritesChange: (ids: string[]) => void
}): void {
  likedList.onChange(listeners.onLikedChange)
  dislikedList.onChange(listeners.onDislikedChange)
  favoriteList.onChange((ids) => {
    listeners.onFavoritesChange(ids)
    if (failedFavorites.size > 0) favoriteStatusChanged()
  })
  if (listSyncTimer) return
  const tick = (): void => {
    likedList.maybeSync()
    dislikedList.maybeSync()
    favoriteList.maybeSync()
  }
  setTimeout(tick, SYNC_STARTUP_DELAY_MS)
  listSyncTimer = setInterval(tick, SYNC_CHECK_INTERVAL_MS)
}

export async function getSubscribedItems(): Promise<string[]> {
  return (await getSubscribedIds()).map((id) => id.toString())
}

export async function getDownloadInfo(itemId: bigint): Promise<DownloadProgressEvent | null> {
  try {
    const info = await workshopCall<{ current: bigint; total: bigint } | null>('downloadInfo', itemId)
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

export async function getInstallInfo(itemId: bigint): Promise<{ folder: string; sizeOnDisk: number } | null> {
  try {
    const info = await workshopCall<{ folder: string; sizeOnDisk: bigint } | null>('installInfo', itemId)
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

export async function getItemState(itemId: bigint): Promise<number> {
  try {
    return await workshopCall<number>('state', itemId)
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
function isStuckNeverDownloaded(state: number): boolean {
  const installed = (state & ITEM_STATE_INSTALLED) !== 0
  const inProgress = (state & (ITEM_STATE_DOWNLOADING | ITEM_STATE_DOWNLOAD_PENDING | ITEM_STATE_NEEDS_UPDATE)) !== 0
  return !installed && !inProgress
}

export async function isItemStuckNeverDownloaded(itemId: bigint): Promise<boolean> {
  return isStuckNeverDownloaded(await getItemState(itemId))
}

export async function isItemDownloading(itemId: bigint): Promise<boolean> {
  const state = await getItemState(itemId)
  return (state & (ITEM_STATE_DOWNLOADING | ITEM_STATE_DOWNLOAD_PENDING)) !== 0
}

// NeedsUpdate stays set while Steam hasn't caught the local copy up to the server version. If
// it's set but nothing is actively downloading/pending, Steam gave up on the transfer (e.g. it
// errored out or the disk filled up). A never-downloaded item reports neither bit - treated as
// "downloading" since the caller (scanLibrary) just kicked one off for it.
export async function getItemDownloadStatus(itemId: bigint): Promise<{ downloading: boolean; failed: boolean }> {
  const state = await getItemState(itemId)
  const downloading =
    (state & (ITEM_STATE_DOWNLOADING | ITEM_STATE_DOWNLOAD_PENDING)) !== 0 || isStuckNeverDownloaded(state)
  const failed = !downloading && (state & ITEM_STATE_NEEDS_UPDATE) !== 0
  return { downloading, failed }
}
