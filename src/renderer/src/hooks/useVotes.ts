import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../components/common/Toast'

const VOTED_IDS_KEY = ['steam-voted-ids']

export function useVotedIds(): Set<string> {
  const { data } = useQuery({
    queryKey: VOTED_IDS_KEY,
    queryFn: () => window.electronAPI.steam.getVotedIds(),
    staleTime: Infinity
  })
  return useMemo(() => new Set(data ?? []), [data])
}

// Writes confirmed votes into both the liked list and the per-item check the detail sidebar runs,
// so every view agrees right away instead of waiting for the next background sync
export function useRecordVotes(): (ids: string[], up: boolean) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (ids: string[], up: boolean) => {
      if (ids.length === 0) return
      const changed = new Set(ids)
      queryClient.setQueryData<string[]>(VOTED_IDS_KEY, (old = []) =>
        up ? [...new Set([...old, ...ids])] : old.filter((id) => !changed.has(id))
      )
      for (const id of ids) queryClient.setQueryData(['steam-vote', id], up)
    },
    [queryClient]
  )
}

// One item's like/dislike buttons. Failures go to onError, or a toast when there is none.
export function useVoteAction(onError?: (message: string) => void) {
  const { showToast } = useToast()
  const recordVotes = useRecordVotes()
  const [pending, setPending] = useState<'like' | 'dislike' | null>(null)
  const report = onError ?? showToast

  async function vote(id: string, up: boolean): Promise<void> {
    if (pending) return
    setPending(up ? 'like' : 'dislike')
    try {
      const { confirmed } = await window.electronAPI.steam.vote(id, up)
      if (confirmed) recordVotes([id], up)
      else report(`Could not confirm the ${up ? 'like' : 'dislike'} on Steam - try again`)
    } catch (err) {
      report((err as Error).message)
    } finally {
      setPending(null)
    }
  }

  return { vote, isLiking: pending === 'like', isDisliking: pending === 'dislike' }
}

// Like/dislike for a whole selection from a context menu, reported as one toast
export function useBatchVote(): (ids: string[], up: boolean) => Promise<void> {
  const { showToast } = useToast()
  const recordVotes = useRecordVotes()

  return async (ids: string[], up: boolean) => {
    if (ids.length > 1) showToast(`${up ? 'Liking' : 'Disliking'} ${ids.length} wallpapers on Steam...`)

    const results = await Promise.allSettled(ids.map((id) => window.electronAPI.steam.vote(id, up)))
    const confirmedIds = ids.filter((_, i) => {
      const r = results[i]
      return r.status === 'fulfilled' && r.value.confirmed
    })
    recordVotes(confirmedIds, up)

    const failed = ids.length - confirmedIds.length
    const done = up ? 'Liked' : 'Disliked'
    showToast(
      failed === 0
        ? `${done} ${confirmedIds.length} on Steam`
        : `${done} ${confirmedIds.length}, ${failed} could not be confirmed`
    )
  }
}
