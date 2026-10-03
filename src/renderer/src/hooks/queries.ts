import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { WallpaperFolder } from '@shared/types'

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => window.electronAPI.config.get()
  }).data
}

export function useLweInstalled(): boolean {
  const { data } = useQuery({
    queryKey: ['lwe-status'],
    queryFn: () => window.electronAPI.lwe.status()
  })
  return data?.installed ?? false
}

// The whole library, unfiltered. Shares the ['library'] prefix so every library invalidation refreshes it.
export function useAllWallpapers() {
  const { data = [] } = useQuery({
    queryKey: ['library'],
    queryFn: () => window.electronAPI.library.getAll()
  })
  return data
}

export function usePlaylists() {
  const { data = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => window.electronAPI.playlist.getAll()
  })
  return data
}

export function usePlaybackStates() {
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({
    queryKey: ['playlist-playback-state'],
    queryFn: () => window.electronAPI.playlist.getState()
  })

  useEffect(() => {
    return window.electronAPI.on.playlistStateChanged((states) => {
      queryClient.setQueryData(['playlist-playback-state'], states)
    })
  }, [queryClient])

  return data
}

export interface FolderMenuState {
  hasFolder: boolean
  // folders the selection isn't already fully inside
  moveTargets: WallpaperFolder[]
}

export function useFolders() {
  const queryClient = useQueryClient()
  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: () => window.electronAPI.folders.getAll()
  })

  // each wallpaper lives in at most one folder
  const folderOfItem = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of folders) {
      for (const id of f.items) map.set(id, f.id)
    }
    return map
  }, [folders])

  // invalidate rather than refetch: callers are often menus that are already unmounting
  const refetchFolders = () => queryClient.invalidateQueries({ queryKey: ['folders'] })

  async function moveToFolder(folderId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await window.electronAPI.folders.addItems(folderId, ids)
    refetchFolders()
  }

  async function removeFromFolders(ids: string[]): Promise<void> {
    for (const folder of folders) {
      const overlap = ids.filter((id) => folder.items.includes(id))
      if (overlap.length > 0) await window.electronAPI.folders.removeItems(folder.id, overlap)
    }
    refetchFolders()
  }

  function menuState(ids: string[]): FolderMenuState {
    const current = new Set(ids.map((id) => folderOfItem.get(id)).filter((id): id is string => !!id))
    return {
      hasFolder: current.size > 0,
      moveTargets: folders.filter((f) => !(current.size === 1 && current.has(f.id)))
    }
  }

  return { folders, folderOfItem, refetchFolders, moveToFolder, removeFromFolders, menuState }
}
