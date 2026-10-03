import { useQueryClient } from '@tanstack/react-query'
import type { ScreenTarget } from '@shared/types'
import { useToast } from '../components/common/Toast'
import { forEachIgnoringErrors } from '../utils/async'

export function useApplyWallpaper(): (id: string, screen?: ScreenTarget) => Promise<void> {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return async (id, screen) => {
    try {
      await window.electronAPI.wallpaper.apply({ wallpaperId: id, screen })
      queryClient.invalidateQueries({ queryKey: ['library'] })
    } catch (err) {
      showToast((err as Error).message)
    }
  }
}

export function useSubscribe(): (id: string) => Promise<void> {
  const queryClient = useQueryClient()
  return async (id) => {
    await window.electronAPI.steam.subscribe(id)
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }
}

// unsubscribing can drop a wallpaper from the library, and with it from its folder
export function useUnsubscribe(): (ids: string[]) => Promise<void> {
  const queryClient = useQueryClient()
  return async (ids) => {
    await forEachIgnoringErrors(ids, (id) => window.electronAPI.steam.unsubscribe(id))
    queryClient.invalidateQueries({ queryKey: ['library'] })
    queryClient.invalidateQueries({ queryKey: ['folders'] })
  }
}
