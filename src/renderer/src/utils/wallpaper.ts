import type { VerifyProblem, WallpaperMeta } from '@shared/types'
import type { MessageKey } from '@shared/i18n'
import { getPreviewSrc } from './preview'
import { isWorkshopId } from './steam'
import { t } from '../i18n'

export function isPlayable(w: Pick<WallpaperMeta, 'localPath' | 'downloading' | 'downloadFailed'>): boolean {
  return !!w.localPath && !w.downloading && !w.downloadFailed
}

export function hasBackup(w: WallpaperMeta): boolean {
  return !!w.backedUp || w.source === 'backup'
}

// removed items can't be updated anymore, those belong to the Unavailable filter
export function isBackupOutdated(w: WallpaperMeta): boolean {
  return w.source === 'workshop' && !!w.backedUp && !!w.backupOutdated && !w.unavailable
}

const VERIFY_PROBLEM_LABELS: Record<VerifyProblem, MessageKey> = {
  notInstalled: 'verify.problem.notInstalled',
  needsUpdate: 'verify.problem.needsUpdate',
  missingFolder: 'verify.problem.missingFolder',
  brokenProject: 'verify.problem.brokenProject',
  missingMainFile: 'verify.problem.missingMainFile',
  missingData: 'verify.problem.missingData',
  missingDependency: 'verify.problem.missingDependency'
}

export function verifyProblemLabel(problem: VerifyProblem): string {
  return t(VERIFY_PROBLEM_LABELS[problem])
}

// a running or failed download shows its own state instead
export function hasDamagedFiles(w: WallpaperMeta): boolean {
  return w.source === 'workshop' && !!w.verifyProblem && !w.downloading && !w.downloadFailed
}

export function videoPath(w: WallpaperMeta): string | undefined {
  return w.type === 'video' && w.localPath && w.file ? `${w.localPath}/${w.file}` : undefined
}

export function canBrowseCreator(w: WallpaperMeta): boolean {
  return isWorkshopId(w.id) || (w.source !== 'local' && !!w.authorSteamId)
}

// items imported before authorSteamId was stored only have it on the Workshop
export async function resolveCreatorSteamId(w: WallpaperMeta): Promise<string | undefined> {
  if (w.authorSteamId) return w.authorSteamId
  if (!isWorkshopId(w.id)) return undefined
  try {
    return (await window.electronAPI.workshop.getItem(w.id))?.creatorSteamId
  } catch {
    return undefined
  }
}

export function backupSummary(result: { backedUp: number; alreadyBackedUp: number; failed: number; unsubscribed: number }): string {
  let summary = t('backup.backedUpCount', { count: result.backedUp })
  if (result.alreadyBackedUp > 0) summary += ', ' + t('backup.alreadyUpToDate', { count: result.alreadyBackedUp })
  if (result.unsubscribed > 0) summary += ' ' + t('backup.unsubscribedCount', { count: result.unsubscribed })
  if (result.failed > 0) summary += ', ' + t('common.failedCount', { count: result.failed })
  return summary
}

export function progressVerb(items: { action?: 'backup' | 'copy' | 'move' }[]): string {
  const actions = new Set(items.map((p) => p.action ?? 'backup'))
  if (actions.size > 1) return t('transfer.copying')
  return actions.has('move') ? t('transfer.moving') : actions.has('copy') ? t('transfer.copying') : t('backup.backingUp')
}

export function transferSummary(
  result: { done: number; alreadyThere: number; failed: { title: string; reason: string }[] },
  mode: 'copy' | 'move',
  libraryName: string
): string {
  const parts = [t(mode === 'copy' ? 'transfer.copied' : 'transfer.moved', { count: result.done, library: libraryName })]
  if (result.alreadyThere > 0) parts.push(t('transfer.alreadyThere', { count: result.alreadyThere }))
  if (result.failed.length === 1) {
    parts.push(t('transfer.oneFailed', { title: result.failed[0].title, reason: result.failed[0].reason }))
  } else if (result.failed.length > 1) {
    parts.push(t('transfer.manyFailed', { count: result.failed.length, reason: result.failed[0].reason }))
  }
  return parts.join(', ')
}

// until DetailSidebar's own queries have loaded

export function detailSidebarProps(w: WallpaperMeta) {
  return {
    fallbackTitle: w.title,
    fallbackPreviewUrl: getPreviewSrc(w),
    fallbackTags: [...w.tags, ...(w.resolutions ?? [])],
    fallbackAuthorSteamId: w.authorSteamId,
    localFileSize: w.fileSize,
    isSubscribed: w.subscribed,
    canPlay: isPlayable(w)
  }
}
