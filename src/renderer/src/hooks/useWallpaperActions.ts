import { useQueryClient } from '@tanstack/react-query'
import type { ScreenTarget } from '@shared/types'
import { useToast } from '../components/common/Toast'
import { forEachIgnoringErrors } from '../utils/async'
import { t } from '../i18n'

export function useApplyWallpaper(): (id: string, screen?: ScreenTarget) => Promise<void> {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return async (id, screen) => {
    try {
      await window.electronAPI.wallpaper.apply({ wallpaperId: id, screen })
      void queryClient.invalidateQueries({ queryKey: ['library'] })
    } catch (err) {
      showToast((err as Error).message)
    }
  }
}

export function useSubscribe(): (id: string) => Promise<void> {
  const queryClient = useQueryClient()
  return async (id) => {
    await window.electronAPI.steam.subscribe(id)
    void queryClient.invalidateQueries({ queryKey: ['library'] })
  }
}

// unsubscribing can drop a wallpaper from the library, and with it from its folder
export function useUnsubscribe(): (ids: string[]) => Promise<void> {
  const queryClient = useQueryClient()
  return async (ids) => {
    await forEachIgnoringErrors(ids, (id) => window.electronAPI.steam.unsubscribe(id))
    void queryClient.invalidateQueries({ queryKey: ['library'] })
    void queryClient.invalidateQueries({ queryKey: ['folders'] })
  }
}

function useRepairFiles(): (ids: string[], onStatus: (text: string) => void) => Promise<string> {
  const queryClient = useQueryClient()
  return async (ids, onStatus) => {
    onStatus(t('verify.starting', { count: ids.length }))
    void queryClient.invalidateQueries({ queryKey: ['library'] })
    let latest: { done: number; total: number } | null = null
    const off = window.electronAPI.on.repairProgress(({ done, total }) => {
      latest = { done, total }
      if (done >= total) {
        off()
        onStatus(t('verify.repairFinished', { done, total }))
      } else {
        onStatus(t('verify.repairProgress', { done, total }))
      }
    })
    try {
      const result = await window.electronAPI.steam.repair(ids)
      if (result.started === 0) off()
      const progress = latest as { done: number; total: number } | null
      let summary = progress
        ? t(progress.done >= progress.total ? 'verify.repairFinished' : 'verify.repairProgress', { done: progress.done, total: progress.total })
        : t('verify.repairing', { count: result.started })
      if (result.failed > 0) summary += ', ' + t('common.failedCount', { count: result.failed })
      return summary
    } catch (err) {
      off()
      return (err as Error).message
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['library'] })
    }
  }
}

// ids undefined = all workshop wallpapers; damaged ones redownload after a confirm
export function useVerifyFiles(): (ids: string[] | undefined, onStatus: (text: string) => void) => Promise<string> {
  const queryClient = useQueryClient()
  const repairFiles = useRepairFiles()
  return async (ids, onStatus) => {
    const off = window.electronAPI.on.verifyProgress(({ done, total }) => { onStatus(t('verify.progress', { done, total })) })
    let result
    try {
      result = await window.electronAPI.steam.verify(ids)
    } catch (err) {
      return (err as Error).message
    } finally {
      off()
      void queryClient.invalidateQueries({ queryKey: ['library'] })
    }
    const { checked, skipped, damaged } = result
    const parts = [
      damaged.length === 0
        ? t('verify.noProblems', { count: checked })
        : t('verify.foundDamaged', { count: damaged.length })
    ]
    if (skipped > 0) parts.push(t('verify.skipped', { count: skipped }))
    if (damaged.length === 0 || !confirm(t('verify.repairConfirm', { count: damaged.length }))) return parts.join(', ')
    return repairFiles(damaged, onStatus)
  }
}
