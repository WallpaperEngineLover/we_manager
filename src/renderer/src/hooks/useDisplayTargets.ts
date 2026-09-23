import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScreenTarget } from '@shared/types'

/** The screens things can be put on; a single '*' in shared mode, where there is nothing to choose */
export function useDisplayTargets(): { targets: ScreenTarget[]; perScreen: boolean } {
  const queryClient = useQueryClient()
  const { data: targets = ['*'] } = useQuery({
    queryKey: ['display-targets'],
    queryFn: () => window.electronAPI.wallpaper.getTargets(),
    staleTime: 30_000
  })

  useEffect(() => {
    return window.electronAPI.on.displayChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['display-targets'] })
    })
  }, [queryClient])

  return { targets, perScreen: targets.length > 1 || targets[0] !== '*' }
}

export function useScreenAssignments() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['screen-assignments'],
    queryFn: () => window.electronAPI.wallpaper.getAssignments(),
    staleTime: 5_000
  })

  useEffect(() => {
    return window.electronAPI.on.displayChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['screen-assignments'] })
    })
  }, [queryClient])

  return query.data ?? []
}
