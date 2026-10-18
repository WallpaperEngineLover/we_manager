import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FavoriteFailure, FavoriteStatus } from '@shared/types'
import { useToast } from '../components/common/Toast'
import { t } from '../i18n'

export const FAVORITE_IDS_KEY = ['steam-favorite-ids']
export const FAVORITE_STATUS_KEY = ['steam-favorite-status']

const NO_STATUS: FavoriteStatus = { failed: {}, checking: [] }

export function useFavoriteStatus(): FavoriteStatus {
  const { data } = useQuery({
    queryKey: FAVORITE_STATUS_KEY,
    queryFn: () => window.electronAPI.steam.getFavoriteStatus(),
    staleTime: Infinity
  })
  return data ?? NO_STATUS
}

export function useItemFavoriteStatus(id: string): { failure: FavoriteFailure | undefined; checking: boolean } {
  const status = useFavoriteStatus()
  return { failure: status.failed[id], checking: status.checking.includes(id) }
}

export function useFavoriteIds(): Set<string> {
  const { data } = useQuery({
    queryKey: FAVORITE_IDS_KEY,
    queryFn: () => window.electronAPI.steam.getFavoriteIds(),
    staleTime: Infinity
  })
  return useMemo(() => new Set(data ?? []), [data])
}

function useRecordFavorites(): (ids: string[], add: boolean) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (ids: string[], add: boolean) => {
      if (ids.length === 0) return
      const changed = new Set(ids)
      queryClient.setQueryData<string[]>(FAVORITE_IDS_KEY, (old = []) =>
        add ? [...new Set([...old, ...ids])] : old.filter((id) => !changed.has(id))
      )
    },
    [queryClient]
  )
}

// failures go to onError, else a toast
export function useFavoriteAction(onError?: (message: string) => void) {
  const { showToast } = useToast()
  const recordFavorites = useRecordFavorites()
  const [pending, setPending] = useState(false)
  const report = onError ?? ((message: string) => showToast(message, { warning: true }))

  async function setFavorite(id: string, add: boolean): Promise<void> {
    if (pending) return
    setPending(true)
    try {
      const { confirmed } = await window.electronAPI.steam.favorite(id, add)
      if (confirmed) recordFavorites([id], add)
      else report(t('favorite.unconfirmed'))
    } catch (err) {
      report((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return { setFavorite, isPending: pending }
}

export function useBatchFavorite(): (ids: string[], add: boolean) => Promise<void> {
  const { showToast } = useToast()
  const recordFavorites = useRecordFavorites()

  return async (ids: string[], add: boolean) => {
    if (ids.length > 1) showToast(t(add ? 'favorite.adding' : 'favorite.removing', { count: ids.length }))

    const results = await Promise.allSettled(ids.map((id) => window.electronAPI.steam.favorite(id, add)))
    const confirmedIds = ids.filter((_, i) => {
      const r = results[i]
      return r.status === 'fulfilled' && r.value.confirmed
    })
    recordFavorites(confirmedIds, add)

    const failed = ids.length - confirmedIds.length
    const count = confirmedIds.length
    showToast(
      failed === 0
        ? t(add ? 'favorite.addedCount' : 'favorite.removedCount', { count })
        : t(add ? 'favorite.addedSomeFailed' : 'favorite.removedSomeFailed', { count, failed }),
      failed === 0 ? undefined : { warning: true, durationMs: 5000 }
    )
  }
}
