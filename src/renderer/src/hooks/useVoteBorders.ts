import { useQuery } from '@tanstack/react-query'

export function useVoteBorders(): { enabled: boolean; failed: Record<string, string> } {
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => window.electronAPI.config.get()
  })
  const { data: failed } = useQuery({
    queryKey: ['steam-failed-votes'],
    queryFn: () => window.electronAPI.steam.getFailedVotes()
  })
  return { enabled: config?.voteBorders ?? true, failed: failed ?? {} }
}

// an outline sits outside the selection ring, so both stay visible on a selected card
export function voteBorderClass(voteError: string | undefined, isLiked: boolean): string | false {
  if (voteError) return 'outline-2 outline-offset-2 outline-red-500'
  if (isLiked) return 'outline-2 outline-offset-2 outline-green-500/70'
  return false
}
