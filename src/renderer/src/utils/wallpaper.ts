import type { WallpaperMeta } from '@shared/types'
import { getPreviewSrc } from './preview'
import { isWorkshopId } from './steam'

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
  return `Backed up ${result.backedUp}${result.alreadyBackedUp > 0 ? `, ${result.alreadyBackedUp} already up to date` : ''}${result.unsubscribed > 0 ? ` (${result.unsubscribed} unsubscribed)` : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}`
}

export function progressVerb(items: { action?: 'backup' | 'copy' | 'move' }[]): string {
  const actions = new Set(items.map((p) => p.action ?? 'backup'))
  if (actions.size > 1) return 'Copying'
  return actions.has('move') ? 'Moving' : actions.has('copy') ? 'Copying' : 'Backing up'
}

export function transferSummary(
  result: { done: number; alreadyThere: number; failed: { title: string; reason: string }[] },
  mode: 'copy' | 'move',
  libraryName: string
): string {
  const verb = mode === 'copy' ? 'Copied' : 'Moved'
  const parts = [`${verb} ${result.done} to ${libraryName}`]
  if (result.alreadyThere > 0) parts.push(`${result.alreadyThere} already there`)
  if (result.failed.length === 1) parts.push(`"${result.failed[0].title}" failed: ${result.failed[0].reason}`)
  else if (result.failed.length > 1) parts.push(`${result.failed.length} failed (first: ${result.failed[0].reason})`)
  return parts.join(', ')
}

// what DetailSidebar shows for a library item until its own queries have loaded
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
