import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../components/common/Toast'
import { t } from '../i18n'

const VOTED_IDS_KEY = ['steam-voted-ids']
export const DISLIKED_IDS_KEY = ['steam-disliked-ids']

export function useVotedIds(): Set<string> {
  const { data } = useQuery({
    queryKey: VOTED_IDS_KEY,
    queryFn: () => window.electronAPI.steam.getVotedIds(),
    staleTime: Infinity
  })
  return useMemo(() => new Set(data ?? []), [data])
}

export function useDislikedIds(): Set<string> {
  const { data } = useQuery({
    queryKey: DISLIKED_IDS_KEY,
    queryFn: () => window.electronAPI.steam.getDislikedIds(),
    staleTime: Infinity
  })
  return useMemo(() => new Set(data ?? []), [data])
}

// updates every view right away instead of waiting for the next sync
export function useRecordVotes(): (ids: string[], up: boolean) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (ids: string[], up: boolean) => {
      if (ids.length === 0) return
      const changed = new Set(ids)
      const put = (old: string[] = []): string[] => [...new Set([...old, ...ids])]
      const drop = (old: string[] = []): string[] => old.filter((id) => !changed.has(id))
      queryClient.setQueryData<string[]>(VOTED_IDS_KEY, up ? put : drop)
      queryClient.setQueryData<string[]>(DISLIKED_IDS_KEY, up ? drop : put)
      for (const id of ids) queryClient.setQueryData(['steam-vote', id], up)
    },
    [queryClient]
  )
}

// failures go to onError, else a toast
export function useVoteAction(onError?: (message: string) => void) {
  const { showToast } = useToast()
  const recordVotes = useRecordVotes()
  const [pending, setPending] = useState<'like' | 'dislike' | null>(null)
  const report = onError ?? showToast

  async function vote(id: string, up: boolean): Promise<boolean> {
    if (pending) return false
    setPending(up ? 'like' : 'dislike')
    try {
      const { confirmed } = await window.electronAPI.steam.vote(id, up)
      if (confirmed) recordVotes([id], up)
      else report(up ? t('vote.unconfirmedLike') : t('vote.unconfirmedDislike'))
      return confirmed
    } catch (err) {
      report((err as Error).message)
      return false
    } finally {
      setPending(null)
    }
  }

  return { vote, isLiking: pending === 'like', isDisliking: pending === 'dislike' }
}


export function useBatchVote(): (ids: string[], up: boolean) => Promise<void> {
  const { showToast } = useToast()
  const recordVotes = useRecordVotes()

  return async (ids: string[], up: boolean) => {
    if (ids.length > 1) showToast(t(up ? 'vote.liking' : 'vote.disliking', { count: ids.length }))

    const results = await Promise.allSettled(ids.map((id) => window.electronAPI.steam.vote(id, up)))
    const confirmedIds = ids.filter((_, i) => {
      const r = results[i]
      return r.status === 'fulfilled' && r.value.confirmed
    })
    recordVotes(confirmedIds, up)

    const failed = ids.length - confirmedIds.length
    const count = confirmedIds.length
    showToast(
      failed === 0
        ? t(up ? 'vote.likedCount' : 'vote.dislikedCount', { count })
        : t(up ? 'vote.likedSomeFailed' : 'vote.dislikedSomeFailed', { count, failed }),
      failed === 0 ? undefined : { warning: true, durationMs: 5000 }
    )
  }
}
