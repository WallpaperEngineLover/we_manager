import { useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Columns3,
  Copy,
  ExternalLink,
  Eye,
  FolderOpen,
  HardDrive,
  Monitor,
  MoveRight,
  ShieldCheck,
  Trash2,
  User
} from 'lucide-react'
import type { ExtraLibrary, WallpaperMeta } from '@shared/types'
import {
  ContextMenu,
  FolderMenuItems,
  MenuItem,
  MenuSelectionCount,
  MenuSeparator,
  SubMenu,
  VoteMenuItems,
  FavoriteMenuItems
} from './ContextMenu'
import { useToast } from './Toast'
import { useConfig, useFolders } from '../../hooks/queries'
import { useDisplayTargets } from '../../hooks/useDisplayTargets'
import { useBatchVote } from '../../hooks/useVotes'
import { useBatchFavorite, useFavoriteIds } from '../../hooks/useFavorites'
import { useUnsubscribe, useVerifyFiles } from '../../hooks/useWallpaperActions'
import { isWorkshopId, openWorkshopPage } from '../../utils/steam'
import {
  backupSummary,
  canBrowseCreator,
  hasBackup,
  isPlayable,
  resolveCreatorSteamId,
  transferSummary,
  videoPath
} from '../../utils/wallpaper'
import { t } from '../../i18n'

// ids is the selection, wallpapers the loaded ones of it

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
  const config = useConfig()
  const isBackupConfigured = config?.isBackupConfigured ?? false
  const libraries = config?.extraLibraries ?? []
  const { moveToFolder, removeFromFolders, menuState } = useFolders()
  const batchVote = useBatchVote()
  const batchFavorite = useBatchFavorite()
  const favoriteIds = useFavoriteIds()
  const unsubscribe = useUnsubscribe()
  const verifyFiles = useVerifyFiles()
  const { targets, perScreen } = useDisplayTargets()

  const backupable = wallpapers.filter((w) => w.source === 'workshop')
  const transferable = wallpapers.filter(isPlayable)
  const backups = wallpapers.filter(hasBackup)
  const video = wallpapers.map(videoPath).find(Boolean)
  const splittable = wallpapers.filter((w) => isPlayable(w) && ['scene', 'video', 'web'].includes(w.type))
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
        const done = result.alreadyBackedUp ? t('backup.alreadyCurrent') : t('backup.done')
        showToast(result.unsubscribed ? t('backup.doneUnsubscribed', { done }) : done)
      } else {
        showToast(backupSummary(await window.electronAPI.backup.selection(backupable.map((w) => w.id))))
      }
    } catch (err) {
      showToast(t('backup.failed', { error: (err as Error).message }))
    }
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function removeBackup() {
    const backupOnly = backups.filter((w) => w.source === 'backup').length
    const question =
      backups.length === 1
        ? t('backup.deleteOne', { title: backups[0].title })
        : t('backup.deleteMany', { count: backups.length })
    const note =
      backupOnly === 0
        ? ''
        : backups.length === 1
          ? t('backup.deleteOneNote')
          : t('backup.deleteManyNote', { count: backupOnly })
    if (!confirm(note ? `${question}\n\n${note}` : question)) return

    const result = await window.electronAPI.backup.remove(backups.map((w) => w.id))
    let summary = t('backup.removed', { count: result.removed })
    if (result.keptDirs.length > 0) summary += ' ' + t('backup.keptOutside', { count: result.keptDirs.length })
    if (result.failed > 0) summary += ', ' + t('common.failedCount', { count: result.failed })
    showToast(summary)
    queryClient.invalidateQueries({ queryKey: ['library'] })
    queryClient.invalidateQueries({ queryKey: ['folders'] })
  }

  async function transfer(library: ExtraLibrary, mode: 'copy' | 'move') {
    if (mode === 'move') {
      const workshop = transferable.filter((w) => w.source === 'workshop').length
      const backupOnly = transferable.filter((w) => w.source === 'backup').length
      const notes = [
        workshop > 0 && t('transfer.moveUnsubscribes', { count: workshop }),
        backupOnly > 0 && t('transfer.moveLeavesBackup', { count: backupOnly })
      ].filter(Boolean)
      if (notes.length > 0 && !confirm(`${t('transfer.moveConfirm', { library: library.name })}\n\n${notes.join('\n')}`)) return
    }
    try {
      const result = await window.electronAPI.library.transfer(
        transferable.map((w) => w.id),
        library.path,
        mode
      )
      showToast(transferSummary(result, mode, library.name))
    } catch (err) {
      showToast(t(mode === 'copy' ? 'transfer.copyFailed' : 'transfer.moveFailed', { error: (err as Error).message }))
    }
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function addToSplit(screen: string) {
    const split = config?.splitScreens?.[screen] ?? { layout: 'aspect' as const, slots: [] }
    const slots = [...split.slots, ...splittable.map((w) => ({ wallpaperId: w.id }))]
    await window.electronAPI.wallpaper.setSplit(screen, { ...split, slots })
    queryClient.invalidateQueries({ queryKey: ['config'] })
    showToast(t('split.added', { count: splittable.length, screen }))
  }

  async function openLocally() {
    const paths = wallpapers.filter((w) => w.localPath).map((w) => w.localPath!)
    if (paths.length > 0) await window.electronAPI.shell.openPaths(paths)
  }

  async function browseCreator() {
    if (!creatorSource) return
    const creatorSteamId = await resolveCreatorSteamId(creatorSource)
    if (creatorSteamId) onBrowseCreator?.(creatorSteamId)
    else showToast(t('creator.notFound'))
  }

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <MenuSelectionCount count={ids.length} />

      {backupable.length > 0 && isBackupConfigured && (
        <MenuItem icon={Archive} onClick={run(backup)}>
          {t('backup.action')}
        </MenuItem>
      )}
      {backups.length > 0 && (
        <MenuItem icon={Trash2} danger onClick={run(removeBackup)}>
          {t('backup.delete')}
        </MenuItem>
      )}
      {backupable.length > 0 && (
        <MenuItem icon={ShieldCheck} onClick={run(async () => showToast(await verifyFiles(backupable.map((w) => w.id), () => {})))}>
          {t('verify.action')}
        </MenuItem>
      )}
      <MenuItem danger onClick={run(() => unsubscribe(ids))}>
        {t('subscribe.unsubscribe')}
      </MenuItem>

      <MenuSeparator />
      <VoteMenuItems onVote={(up) => run(() => batchVote(ids, up))()} />
      <FavoriteMenuItems
        ids={ids.filter(isWorkshopId)}
        favorites={favoriteIds}
        onFavorite={(favIds, add) => run(() => batchFavorite(favIds, add))()}
      />

      <MenuSeparator />
      <MenuItem icon={ExternalLink} onClick={run(() => ids.forEach(openWorkshopPage))}>
        {t('menu.openWorkshop')}
      </MenuItem>
      <MenuItem icon={FolderOpen} onClick={run(openLocally)}>
        {t('menu.openLocally')}
      </MenuItem>
      {video && (
        <MenuItem icon={Eye} onClick={run(() => window.electronAPI.shell.openWithDefault(video))}>
          {t('menu.previewMedia')}
        </MenuItem>
      )}
      {creatorSource && (
        <MenuItem icon={User} onClick={run(browseCreator)}>
          {t('menu.browseCreator')}
        </MenuItem>
      )}
      {perScreen && splittable.length > 0 && (
        <SubMenu icon={Columns3} label={t('split.addTo')}>
          {targets
            .filter((screen) => screen !== '*')
            .map((screen) => (
              <MenuItem key={screen} icon={Monitor} onClick={run(() => addToSplit(screen))}>
                {screen}
              </MenuItem>
            ))}
        </SubMenu>
      )}

      {libraries.length > 0 && transferable.length > 0 && (
        <>
          <MenuSeparator />
          <SubMenu icon={Copy} label={t('transfer.copyTo')}>
            {libraries.map((l) => (
              <MenuItem key={l.path} icon={HardDrive} onClick={run(() => transfer(l, 'copy'))}>
                <span title={l.path}>{l.name}</span>
              </MenuItem>
            ))}
          </SubMenu>
          <SubMenu icon={MoveRight} label={t('transfer.moveTo')}>
            {libraries.map((l) => (
              <MenuItem key={l.path} icon={HardDrive} onClick={run(() => transfer(l, 'move'))}>
                <span title={l.path}>{l.name}</span>
              </MenuItem>
            ))}
          </SubMenu>
        </>
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
