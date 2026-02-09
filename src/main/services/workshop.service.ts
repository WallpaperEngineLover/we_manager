import { WE_APP_ID } from '@shared/constants'
import type { WorkshopQueryParams, WorkshopQueryResult, WorkshopItem } from '@shared/types'
import { getClient } from './steam.service'

// Maps our string names to steamworks.js UGCQueryType enum values
const QUERY_TYPE_MAP: Record<string, number> = {
  RankedByVote: 0,
  RankedByPublicationDate: 1,
  RankedByTrend: 3,
  RankedByTotalUniqueSubscriptions: 12,
  RankedByTextSearch: 11,
  RankedByLastUpdatedDate: 19
}

export async function queryWorkshop(params: WorkshopQueryParams): Promise<WorkshopQueryResult> {
  const client = getClient()
  const appId = params.appId ?? WE_APP_ID
  const page = params.page ?? 1
  const queryType = QUERY_TYPE_MAP[params.queryType ?? 'RankedByPublicationDate'] ?? 1

  const result = await client.workshop.getAllItems(
    page,
    queryType,
    13, // UGCType.All — WE items span multiple subtypes
    appId,
    appId,
    {
      searchText: params.searchText,
      requiredTags: params.tags,
      excludedTags: params.excludedTags,
      includeLongDescription: true
    }
  )

  const subscribedSet = new Set(
    client.workshop.getSubscribedItems().map((id) => id.toString())
  )

  return {
    items: result.items.filter(Boolean).map((item) => transformItem(item!, subscribedSet)),
    page,
    totalResults: result.totalResults
  }
}

export async function getWorkshopItem(publishedFileId: string): Promise<WorkshopItem | null> {
  const client = getClient()
  const item = await client.workshop.getItem(BigInt(publishedFileId), {
    includeLongDescription: true
  })
  if (!item) return null

  const subscribedSet = new Set(
    client.workshop.getSubscribedItems().map((id) => id.toString())
  )
  return transformItem(item, subscribedSet)
}

function transformItem(
  item: NonNullable<Awaited<ReturnType<ReturnType<typeof getClient>['workshop']['getItem']>>>,
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
