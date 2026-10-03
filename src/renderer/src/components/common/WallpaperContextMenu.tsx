import { useQueryClient } from '@tanstack/react-query'
import { Archive, ExternalLink, Eye, FolderOpen, Trash2, User } from 'lucide-react'
import type { WallpaperMeta } from '@shared/types'
import { ContextMenu, FolderMenuItems, MenuItem, MenuSelectionCount, MenuSeparator, VoteMenuItems } from './ContextMenu'
import { useToast } from './Toast'
import { useConfig, useFolders } from '../../hooks/queries'
import { useBatchVote } from '../../hooks/useVotes'
import { useUnsubscribe } from '../../hooks/useWallpaperActions'
import { openWorkshopPage } from '../../utils/steam'
import { backupSummary, canBrowseCreator, hasBackup, resolveCreatorSteamId, videoPath } from '../../utils/wallpaper'

// Right-click menu for library wallpapers, shared by the library grid and playlists.
// ids is what was right-clicked (the selection), wallpapers the ones of those that are loaded.
export default function WallpaperContextMenu({
  x,
  y,
  ids,
  wallpapers,
  onClose,
  onBrowseCreator
}: {
  x: number
  y: number
  ids: string[]
  wallpapers: WallpaperMeta[]
  onClose: () => void
  onBrowseCreator?: (creatorSteamId: string) => void
}) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const isBackupConfigured = useConfig()?.isBackupConfigured ?? false
  const { moveToFolder, removeFromFolders, menuState } = useFolders()
  const batchVote = useBatchVote()
  const unsubscribe = useUnsubscribe()

  const backupable = wallpapers.filter((w) => w.source === 'workshop')
  const backups = wallpapers.filter(hasBackup)
  const video = wallpapers.map(videoPath).find(Boolean)
  const creatorSource = wallpapers.length === 1 && canBrowseCreator(wallpapers[0]) ? wallpapers[0] : undefined
  const { hasFolder, moveTargets } = menuState(ids)

  function run(action: () => unknown) {
    return () => {
      onClose()
      void action()
    }
  }

  async function backup() {
    try {
      if (backupable.length === 1) {
        const result = await window.electronAPI.backup.item(backupable[0].id)
        const done = result.alreadyBackedUp ? 'Backup already up to date' : 'Backed up'
        showToast(result.unsubscribed ? `${done}, unsubscribed` : done)
      } else {
        showToast(backupSummary(await window.electronAPI.backup.selection(backupable.map((w) => w.id))))
      }
    } catch (err) {
      showToast(`Backup failed: ${(err as Error).message}`)
    }
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function removeBackup() {
    const backupOnly = backups.filter((w) => w.source === 'backup').length
    const what = backups.length === 1 ? `the backup of "${backups[0].title}"` : `${backups.length} backups`
    const note =
      backupOnly > 0
        ? `\n\n${backupOnly === 1 && backups.length === 1 ? 'It is' : `${backupOnly} of them are`} not subscribed on Steam anymore and will be removed from the library.`
        : ''
    if (!confirm(`Delete ${what} from the backup folder?${note}`)) return

    const result = await window.electronAPI.backup.remove(backups.map((w) => w.id))
    showToast(
      `Removed ${result.removed} backup${result.removed === 1 ? '' : 's'}${result.keptDirs.length > 0 ? ` (${result.keptDirs.length} outside the backup folder kept on disk)` : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}`
    )
    queryClient.invalidateQueries({ queryKey: ['library'] })
    queryClient.invalidateQueries({ queryKey: ['folders'] })
  }

  async function openLocally() {
    const paths = wallpapers.filter((w) => w.localPath).map((w) => w.localPath!)
    if (paths.length > 0) await window.electronAPI.shell.openPaths(paths)
  }

  async function browseCreator() {
    if (!creatorSource) return
    const creatorSteamId = await resolveCreatorSteamId(creatorSource)
    if (creatorSteamId) onBrowseCreator?.(creatorSteamId)
    else showToast('Could not find creator info for this wallpaper')
  }

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <MenuSelectionCount count={ids.length} />

      {backupable.length > 0 && isBackupConfigured && (
        <MenuItem icon={Archive} onClick={run(backup)}>
          Backup
        </MenuItem>
      )}
      {backups.length > 0 && (
        <MenuItem icon={Trash2} danger onClick={run(removeBackup)}>
          Delete backup
        </MenuItem>
      )}
      <MenuItem danger onClick={run(() => unsubscribe(ids))}>
        Unsubscribe
      </MenuItem>

      <MenuSeparator />
      <VoteMenuItems onVote={(up) => run(() => batchVote(ids, up))()} />

      <MenuSeparator />
      <MenuItem icon={ExternalLink} onClick={run(() => ids.forEach(openWorkshopPage))}>
        Open in Steam Workshop
      </MenuItem>
      <MenuItem icon={FolderOpen} onClick={run(openLocally)}>
        Open wallpaper locally
      </MenuItem>
      {video && (
        <MenuItem icon={Eye} onClick={run(() => window.electronAPI.shell.openWithDefault(video))}>
          Preview in media player
        </MenuItem>
      )}
      {creatorSource && (
        <MenuItem icon={User} onClick={run(browseCreator)}>
          Browse wallpapers from this creator
        </MenuItem>
      )}

      <MenuSeparator />
      <FolderMenuItems
        moveTargets={moveTargets}
        hasFolder={hasFolder}
        onMove={(folderId) => run(() => moveToFolder(folderId, ids))()}
        onRemove={run(() => removeFromFolders(ids))}
      />
    </ContextMenu>
  )
}
