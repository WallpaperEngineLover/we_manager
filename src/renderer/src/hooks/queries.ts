import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LweInstallProgress, WallpaperFolder } from '@shared/types'
import { t } from '../i18n'

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => window.electronAPI.config.get()
  }).data
}

type AppConfigData = NonNullable<ReturnType<typeof useConfig>>

export function useConfigSection<T extends object>(
  pick: (config: AppConfigData) => T,
  save: (section: T) => unknown
): [T | null, (patch: Partial<T>) => void] {
  const queryClient = useQueryClient()
  const config = useConfig()
  const [edited, setEdited] = useState<T | null>(null)
  const section = edited ?? (config ? pick(config) : null)

  function change(patch: Partial<T>) {
    if (!section) return
    const next = { ...section, ...patch }
    setEdited(next)
    const resync = () => queryClient.invalidateQueries({ queryKey: ['config'] })
    void Promise.resolve(save(next)).then(resync, () => {
      setEdited(null)
      void resync()
    })
  }

  return [section, change]
}

const LWE_INSTALL_PROGRESS_KEY = ['lwe-install-progress']

export function useLweInstallProgress() {
  const queryClient = useQueryClient()
  const { data: progress = null } = useQuery<LweInstallProgress | null>({
    queryKey: LWE_INSTALL_PROGRESS_KEY,
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: Infinity
  })

  function setProgress(next: LweInstallProgress) {
    queryClient.setQueryData(LWE_INSTALL_PROGRESS_KEY, next)
  }

  async function run(start: LweInstallProgress, install: () => Promise<unknown>, failedKey: Parameters<typeof t>[0]) {
    setProgress(start)
    try {
      await install()
    } catch (err) {
      setProgress({ stage: 'error', message: t(failedKey, { error: (err as Error).message }), percentage: 0 })
    }
  }

  return { progress, setProgress, run }
}

export function useLweInstalled(): boolean {
  const { data } = useQuery({
    queryKey: ['lwe-status'],
    queryFn: () => window.electronAPI.lwe.status()
  })
  return data?.installed ?? false
}

// ['library'] prefix so every library invalidation reaches it
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
  const { data: folders = [], isSuccess: foldersLoaded } = useQuery({
    queryKey: ['folders'],
    queryFn: () => window.electronAPI.folders.getAll()
  })

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
    void refetchFolders()
  }

  async function removeFromFolders(ids: string[]): Promise<void> {
    for (const folder of folders) {
      const overlap = ids.filter((id) => folder.items.includes(id))
      if (overlap.length > 0) await window.electronAPI.folders.removeItems(folder.id, overlap)
    }
    void refetchFolders()
  }

  function menuState(ids: string[]): FolderMenuState {
    const current = new Set(ids.map((id) => folderOfItem.get(id)).filter((id): id is string => !!id))
    return {
      hasFolder: current.size > 0,
      moveTargets: folders.filter((f) => !(current.size === 1 && current.has(f.id)))
    }
  }

  return { folders, foldersLoaded, folderOfItem, refetchFolders, moveToFolder, removeFromFolders, menuState }
}

export const UPDATE_STATUS_KEY = ['update-status']

// pushed by main after every check (App.tsx), fetched once on mount
export function useUpdateStatus() {
  return useQuery({
    queryKey: UPDATE_STATUS_KEY,
    queryFn: () => window.electronAPI.updates.status(),
    staleTime: Infinity
  }).data
}
