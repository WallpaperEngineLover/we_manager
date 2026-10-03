import { WE_APP_ID } from '@shared/constants'
import type {
  WorkshopQueryParams,
  WorkshopQueryResult,
  WorkshopItem,
  CreatorWorkshopQueryParams
} from '@shared/types'
import type { workshop } from 'steamworks.js/client'
import { workshopCall, getSubscribedItems } from './steam.service'

type SteamWorkshopItem = workshop.WorkshopItem
type WorkshopPage = workshop.WorkshopPaginatedResult

// Maps our string names to steamworks.js UGCQueryType enum values
const QUERY_TYPE_MAP: Record<string, number> = {
  RankedByVote: 0,
  RankedByPublicationDate: 1,
  RankedByTrend: 3,
  RankedByTotalUniqueSubscriptions: 12,
  RankedByTextSearch: 11,
  RankedByLastUpdatedDate: 19
}

// Maps our string names to steamworks.js UserListOrder enum values, used for
// UserUGCList queries (querying a specific creator) which don't support the
// UGCQueryType ranking options above.
const USER_LIST_ORDER_MAP: Record<string, number> = {
  RankedByVote: 5, // VoteScoreDesc
  RankedByPublicationDate: 1, // CreationOrderDesc
  RankedByTrend: 1, // no trend equivalent, falls back to newest
  RankedByTotalUniqueSubscriptions: 4, // SubscriptionDateDesc, closest analog
  RankedByTextSearch: 1,
  RankedByLastUpdatedDate: 3 // LastUpdatedDesc
}

export async function queryWorkshop(params: WorkshopQueryParams): Promise<WorkshopQueryResult> {
  const appId = params.appId ?? WE_APP_ID
  const page = params.page ?? 1
  const queryType = QUERY_TYPE_MAP[params.queryType ?? 'RankedByPublicationDate'] ?? 1

  const result = await workshopCall<WorkshopPage>(
    'getAllItems',
    page,
    queryType,
    13, // UGCType.All, since WE items span multiple subtypes
    appId,
    appId,
    queryConfig(params)
  )

  return toQueryResult(result, page)
}

export async function getWorkshopItem(publishedFileId: string): Promise<WorkshopItem | null> {
  let item: SteamWorkshopItem | null
  try {
    item = await workshopCall<SteamWorkshopItem | null>('getItem', BigInt(publishedFileId), {
      includeLongDescription: true
    })
  } catch {
    // Steam's UGC details lookup throws a generic failure for an id it can no longer resolve
    // (taken down, banned) rather than returning null the way a batch getItems() call does -
    // treat it the same way: "we can't tell you about this item" rather than a hard error.
    return null
  }
  if (!item) return null

  const subscribedSet = new Set(await getSubscribedItems())
  const transformed = transformItem(item, subscribedSet)
  await attachFileSizes([transformed])
  return transformed
}

// UserUGCList lets us query another Steam user's published items directly,
// unlike getAllItems which only ranks/filters across the whole workshop.
export async function queryWorkshopByCreator(
  creatorSteamId: string,
  params: CreatorWorkshopQueryParams = {}
): Promise<WorkshopQueryResult> {
  const accountId = Number(BigInt(creatorSteamId) & 0xffffffffn)
  const page = params.page ?? 1
  const sortOrder = USER_LIST_ORDER_MAP[params.queryType ?? 'RankedByPublicationDate'] ?? 1

  const result = await workshopCall<WorkshopPage>(
    'getUserItems',
    page,
    accountId,
    0, // UserListType.Published
    13, // UGCType.All
    sortOrder,
    { consumer: WE_APP_ID },
    queryConfig(params)
  )

  return toQueryResult(result, page)
}

function queryConfig(params: CreatorWorkshopQueryParams): workshop.WorkshopItemQueryConfig {
  return {
    searchText: params.searchText,
    requiredTags: params.tags,
    excludedTags: params.excludedTags,
    includeLongDescription: true
  }
}

async function toQueryResult(result: WorkshopPage, page: number): Promise<WorkshopQueryResult> {
  const subscribedSet = new Set(await getSubscribedItems())
  const items = result.items.filter(Boolean).map((item) => transformItem(item!, subscribedSet))
  await attachFileSizes(items)
  return { items, page, totalResults: result.totalResults }
}

// A details query only fetches its first result page, and Steam pages those at 50 items -
// anything past that in a single getItems() call silently comes back missing.
const DETAILS_QUERY_BATCH = 50

async function getItemsBatched(publishedFileIds: string[]) {
  const items: SteamWorkshopItem[] = []
  for (let i = 0; i < publishedFileIds.length; i += DETAILS_QUERY_BATCH) {
    const batch = publishedFileIds.slice(i, i + DETAILS_QUERY_BATCH)
    const result = await workshopCall<workshop.WorkshopItemsResult>('getItems', batch.map((id) => BigInt(id)))
    for (const item of result.items) {
      if (item) items.push(item)
    }
  }
  return items
}

export interface WorkshopDetails {
  timeUpdated: number
  // Steam tags an item's type ("Video", "Scene", ...) and age rating ("Everyone", ...)
  // alongside its genre/resolution tags, so this works even for items that never
  // finished downloading and have no local project.json to read that from.
  tags: string[]
  authorSteamId: string
}

// One details query serves everything the library backfills (update time, live tags, author),
// ids Steam no longer resolves are simply missing from the map
export async function getWorkshopDetails(publishedFileIds: string[]): Promise<Map<string, WorkshopDetails>> {
  const map = new Map<string, WorkshopDetails>()
  if (publishedFileIds.length === 0) return map

  for (const item of await getItemsBatched(publishedFileIds)) {
    map.set(item.publishedFileId.toString(), {
      timeUpdated: item.timeUpdated,
      tags: item.tags ?? [],
      authorSteamId: item.owner.steamId64.toString()
    })
  }
  return map
}

// Steam returns a null entry for any id that no longer resolves to a workshop
// item (removed by its author or taken down), so anything missing from the
// result is treated as unavailable. Lets a request error (network hiccup)
// propagate rather than swallowing it here - the caller decides what "we
// couldn't tell" should mean, instead of this silently reporting "all clear".
export async function getUnavailableWorkshopItems(publishedFileIds: string[]): Promise<Set<string>> {
  const details = await getWorkshopDetails(publishedFileIds)
  return new Set(publishedFileIds.filter((id) => !details.has(id)))
}

// steamworks.js's UGC query bindings don't surface a file's size (the underlying Steamworks SDK
// struct has it, the napi wrapper just doesn't map that field). Steam's own public web API does,
// unauthenticated, for any published file regardless of subscription state - this is the exact
// "File Size" figure shown on the item's Steam Workshop page. Cached per id for the process
// lifetime since it barely ever changes.
const fileSizeCache = new Map<string, number>()
const FILE_SIZE_BATCH = 100

async function fetchFileSizesBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const body = new URLSearchParams({ itemcount: String(ids.length) })
  ids.forEach((id, i) => body.set(`publishedfileids[${i}]`, id))

  const res = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
    method: 'POST',
    body
  })
  const data = await res.json()
  const details = data?.response?.publishedfiledetails ?? []
  for (const d of details) {
    if (d?.publishedfileid && d.file_size != null) {
      fileSizeCache.set(d.publishedfileid, Number(d.file_size))
    }
  }
}

async function attachFileSizes(items: WorkshopItem[]): Promise<void> {
  const uncached = [...new Set(items.map((i) => i.publishedFileId).filter((id) => !fileSizeCache.has(id)))]
  if (uncached.length > 0) {
    try {
      for (let i = 0; i < uncached.length; i += FILE_SIZE_BATCH) {
        await fetchFileSizesBatch(uncached.slice(i, i + FILE_SIZE_BATCH))
      }
    } catch (err) {
      console.warn('[Workshop] Failed to fetch file sizes:', err)
    }
  }
  for (const item of items) {
    const size = fileSizeCache.get(item.publishedFileId)
    if (size != null) item.fileSize = size
  }
}

function transformItem(
  item: SteamWorkshopItem,
  subscribedSet: Set<string>
): WorkshopItem {
  return {
    publishedFileId: item.publishedFileId.toString(),
    title: item.title,
    description: item.description,
    previewUrl: item.previewUrl ?? '',
    creatorSteamId: item.owner.steamId64.toString(),
    tags: item.tags ?? [],
    timeCreated: item.timeCreated,
    timeUpdated: item.timeUpdated,
    subscriptions: Number(item.statistics?.numSubscriptions ?? 0),
    upvotes: item.numUpvotes,
    downvotes: item.numDownvotes,
    isSubscribed: subscribedSet.has(item.publishedFileId.toString())
  }
}
