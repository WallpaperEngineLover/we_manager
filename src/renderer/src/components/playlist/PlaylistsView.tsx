import { useMemo, useState } from 'react'
import Toggle from '../common/Toggle'
import { useQueryClient } from '@tanstack/react-query'
import {
  ListVideo,
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Shuffle,
  Film,
  Heart,
  ArrowDownWideNarrow
} from 'lucide-react'
import clsx from 'clsx'
import type { PlaylistSettings, ScreenTarget } from '@shared/types'
import PlaylistItemRow from './PlaylistItemRow'
import WallpaperPickerModal from './WallpaperPickerModal'
import DetailSidebar from '../common/DetailSidebar'
import WallpaperContextMenu from '../common/WallpaperContextMenu'
import { useAllWallpapers, usePlaybackStates, usePlaylists } from '../../hooks/queries'
import { useFavoriteIds } from '../../hooks/useFavorites'
import { useApplyWallpaper, useSubscribe, useUnsubscribe } from '../../hooks/useWallpaperActions'
import { detailSidebarProps } from '../../utils/wallpaper'
import ScreenSelect from '../common/ScreenSelect'
import { useDisplayTargets } from '../../hooks/useDisplayTargets'
import { screenLabel } from '../../utils/screens'
import { t } from '../../i18n'
import type { MessageKey } from '@shared/i18n'

const SORT_OPTIONS: { value: PlaylistSettings['sortBy']; label: MessageKey }[] = [
  { value: 'manual', label: 'playlist.sortManual' },
  { value: 'title', label: 'playlist.sortTitle' },
  { value: 'createdAt', label: 'playlist.sortAdded' }
]

interface PlaylistsViewProps {
  onBrowseCreator?: (creatorSteamId: string) => void
}

export default function PlaylistsView({ onBrowseCreator }: PlaylistsViewProps) {
  const queryClient = useQueryClient()
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wallpaperId: string } | null>(null)

  const playlists = usePlaylists()
  const wallpapers = useAllWallpapers()
  const wallpaperById = useMemo(() => new Map(wallpapers.map((w) => [w.id, w])), [wallpapers])
  const playbackStates = usePlaybackStates()
  const { targets, perScreen } = useDisplayTargets()
  const [screen, setScreen] = useState<ScreenTarget>('*')
  const applyWallpaper = useApplyWallpaper()
  const subscribe = useSubscribe()
  const unsubscribe = useUnsubscribe()

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null
  const favoriteIds = useFavoriteIds()
  const favoriteCount = activePlaylist?.items.filter((i) => favoriteIds.has(i.wallpaperId)).length ?? 0

  function invalidatePlaylists() {
    queryClient.invalidateQueries({ queryKey: ['playlists'] })
  }

  async function handleCreate() {
    if (!newTitle.trim()) {
      setCreating(false)
      return
    }
    const playlist = await window.electronAPI.playlist.create(newTitle.trim())
    setNewTitle('')
    setCreating(false)
    invalidatePlaylists()
    setActivePlaylistId(playlist.id)
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) {
      setRenamingId(null)
      return
    }
    await window.electronAPI.playlist.rename(id, renameValue.trim())
    setRenamingId(null)
    invalidatePlaylists()
  }

  async function handleDelete(id: string) {
    await window.electronAPI.playlist.delete(id)
    if (activePlaylistId === id) setActivePlaylistId(null)
    invalidatePlaylists()
    queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
  }

  async function updateSettings(patch: Partial<PlaylistSettings>) {
    if (!activePlaylist) return
    await window.electronAPI.playlist.updateSettings(activePlaylist.id, patch)
    invalidatePlaylists()
  }

  async function handleAddWallpapers(wallpaperIds: string[]) {
    if (!activePlaylist) return
    await window.electronAPI.playlist.addItems(activePlaylist.id, wallpaperIds)
    setPickerOpen(false)
    invalidatePlaylists()
  }

  async function handleRemoveItem(wallpaperId: string) {
    if (!activePlaylist) return
    await window.electronAPI.playlist.removeItems(activePlaylist.id, [wallpaperId])
    invalidatePlaylists()
  }

  async function handleUpdateItem(
    wallpaperId: string,
    patch: { volume?: number; durationSec?: number }
  ) {
    if (!activePlaylist) return
    await window.electronAPI.playlist.updateItem(activePlaylist.id, wallpaperId, patch)
    invalidatePlaylists()
  }

  function openItemCtxMenu(e: React.MouseEvent, wallpaperId: string) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, wallpaperId })
  }

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(index: number) {
    setDragOverIndex(index)
  }

  async function handleDrop() {
    if (!activePlaylist || dragIndex === null || dragOverIndex === null || dragIndex === dragOverIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const order = activePlaylist.items.map((i) => i.wallpaperId)
    const [moved] = order.splice(dragIndex, 1)
    order.splice(dragOverIndex, 0, moved)
    setDragIndex(null)
    setDragOverIndex(null)
    await window.electronAPI.playlist.reorderItems(activePlaylist.id, order)
    invalidatePlaylists()
  }

  async function handlePlay() {
    if (!activePlaylist) return
    setError(null)
    try {
      await window.electronAPI.playlist.start(activePlaylist.id, screen)
      queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handlePlayItem(wallpaperId: string) {
    if (!activePlaylist) return
    const playingIt = thisStates.filter((s) => s.isPlaying && s.currentItemId === wallpaperId)
    if (playingIt.length > 0) {
      for (const s of playingIt) await window.electronAPI.playlist.pause(s.screen)
      queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
      return
    }
    setError(null)
    try {
      await window.electronAPI.playlist.playItem(activePlaylist.id, wallpaperId, isThisPlaylistActive ? undefined : screen)
      queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // controls act on every screen this playlist plays on, narrowed down by the screen picker
  async function forEachScreen(action: (screen: ScreenTarget) => Promise<unknown>) {
    for (const s of thisStates) await action(s.screen)
    queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
  }

  const handlePauseResume = () =>
    forEachScreen((s) => (isPlaying ? window.electronAPI.playlist.pause(s) : window.electronAPI.playlist.resume(s)))
  const handleStop = () => forEachScreen((s) => window.electronAPI.playlist.stop(s))
  const handleNext = () => forEachScreen((s) => window.electronAPI.playlist.next(s))
  const handlePrevious = () => forEachScreen((s) => window.electronAPI.playlist.previous(s))

  const thisStates = playbackStates.filter(
    (s) => s.playlistId === activePlaylist?.id && (screen === '*' || s.screen === screen)
  )
  const isThisPlaylistActive = thisStates.length > 0
  const isPlaying = thisStates.some((s) => s.isPlaying)
  const currentItemIds = new Set(thisStates.map((s) => s.currentItemId))
  const ctxWallpaper = ctxMenu ? wallpaperById.get(ctxMenu.wallpaperId) : undefined
  const detailWallpaper = detailId ? wallpaperById.get(detailId) : undefined
  const existingIds = useMemo(
    () => new Set(activePlaylist?.items.map((i) => i.wallpaperId) ?? []),
    [activePlaylist]
  )

  return (
    <div className="flex h-full">
      <div className="flex w-56 shrink-0 flex-col border-r border-fg/5 overflow-y-auto">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            {t('nav.playlists')}
          </span>
          <button
            onClick={() => {
              setCreating(true)
              setNewTitle('')
            }}
            title={t('playlist.create')}
            className="rounded p-0.5 text-gray-600 hover:text-gray-300"
          >
            <Plus size={14} />
          </button>
        </div>

        {creating && (
          <div className="flex items-center gap-1 px-3 py-1.5">
            <ListVideo size={14} className="shrink-0 text-gray-500" />
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={handleCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder={t('playlist.namePlaceholder')}
              className="flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder-gray-600"
            />
          </div>
        )}

        {playlists.length === 0 && !creating && (
          <p className="px-3 py-4 text-xs text-gray-600">
            {t('playlist.noneYet')}
          </p>
        )}

        {playlists.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePlaylistId(p.id)}
            className={clsx(
              'group flex items-center gap-2 px-3 py-2 text-sm',
              activePlaylistId === p.id
                ? 'bg-fg/5 text-fg'
                : 'text-gray-400 hover:bg-fg/5 hover:text-gray-200'
            )}
          >
            <ListVideo
              size={14}
              className={clsx(
                'shrink-0',
                playbackStates.some((s) => s.playlistId === p.id) ? 'text-accent-400' : 'text-gray-600'
              )}
            />
            {renamingId === p.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRename(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(p.id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent text-sm text-gray-200 outline-none"
              />
            ) : (
              <span className="flex-1 truncate text-left">{p.title}</span>
            )}
            <span className="text-xs text-gray-600">{p.items.length}</span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                setRenamingId(p.id)
                setRenameValue(p.title)
              }}
              className="hidden rounded p-0.5 text-gray-600 hover:text-gray-300 group-hover:block"
            >
              <Pencil size={11} />
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(p.id)
              }}
              className="hidden rounded p-0.5 text-gray-600 hover:text-red-400 group-hover:block"
            >
              <Trash2 size={11} />
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        {!activePlaylist ? (
          <div className="flex h-full items-center justify-center text-gray-600">
            <p>{t('playlist.selectOrCreate')}</p>
          </div>
        ) : (
          <>
            <div className="border-b border-fg/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100">{activePlaylist.title}</h2>
                <div className="flex items-center gap-2">
                  {perScreen && (
                    <ScreenSelect targets={targets} value={screen} onChange={setScreen} title={t('playlist.whichScreen')} />
                  )}
                  {isThisPlaylistActive ? (
                    <>
                      <button
                        onClick={handlePrevious}
                        title={t('playlist.previous')}
                        className="rounded-lg bg-fg/5 p-2 text-gray-300 hover:bg-fg/10"
                      >
                        <SkipBack size={14} />
                      </button>
                      <button
                        onClick={handlePauseResume}
                        title={isPlaying ? t('common.pause') : t('common.resume')}
                        className="rounded-lg bg-accent-600 p-2 text-white hover:bg-accent-500"
                      >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button
                        onClick={handleNext}
                        title={t('common.next')}
                        className="rounded-lg bg-fg/5 p-2 text-gray-300 hover:bg-fg/10"
                      >
                        <SkipForward size={14} />
                      </button>
                      <button
                        onClick={handleStop}
                        title={t('playlist.stop')}
                        className="rounded-lg bg-fg/5 p-2 text-gray-300 hover:bg-red-500/20 hover:text-red-400"
                      >
                        <Square size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handlePlay}
                      disabled={activePlaylist.items.length === 0}
                      className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                    >
                      <Play size={14} />
                      {t('playlist.play')}
                    </button>
                  )}
                </div>
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              {perScreen && isThisPlaylistActive && (
                <p className="mt-1 text-xs text-gray-500">
                  {t('playlist.playingOn', { screens: thisStates.map((s) => screenLabel(s.screen)).join(', ') })}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <Toggle on={activePlaylist.settings.randomize} onClick={() => updateSettings({ randomize: !activePlaylist.settings.randomize })} />
                  <Shuffle size={12} />
                  {t('playlist.randomize')}
                </label>

                {!activePlaylist.settings.randomize && (
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <ArrowDownWideNarrow size={12} />
                    {t('playlist.sortBy')}
                    <select
                      value={activePlaylist.settings.sortBy}
                      onChange={(e) =>
                        updateSettings({ sortBy: e.target.value as PlaylistSettings['sortBy'] })
                      }
                      className="rounded bg-fg/5 px-2 py-1 text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {t(o.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-400">
                  {t('playlist.duration')}
                  <input
                    type="number"
                    min={1}
                    value={activePlaylist.settings.defaultDurationSec}
                    onChange={(e) =>
                      updateSettings({ defaultDurationSec: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-20 rounded bg-fg/5 px-2 py-1 text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                  />
                  {t('playlist.seconds')}
                </label>

                <label
                  className="flex items-center gap-2 text-xs text-gray-400"
                  title={t('playlist.finishVideosHint')}
                >
                  <Toggle on={!!activePlaylist.settings.finishVideos} onClick={() => updateSettings({ finishVideos: !activePlaylist.settings.finishVideos })} />
                  <Film size={12} />
                  {t('playlist.finishVideos')}
                </label>

                <label
                  className="flex items-center gap-2 text-xs text-gray-400"
                  title={t('playlist.favoritesOnlyHint')}
                >
                  <Toggle on={!!activePlaylist.settings.favoritesOnly} onClick={() => updateSettings({ favoritesOnly: !activePlaylist.settings.favoritesOnly })} />
                  <Heart size={12} />
                  {t('playlist.favoritesOnly')}
                  {activePlaylist.settings.favoritesOnly && (
                    <span className={favoriteCount === 0 ? 'text-amber-400' : 'text-gray-600'}>
                      {favoriteCount === 0
                        ? t('playlist.favoritesOnlyNone')
                        : t('playlist.favoritesOnlyCount', { favorites: favoriteCount, total: activePlaylist.items.length })}
                    </span>
                  )}
                </label>

                <label className="flex items-center gap-2 text-xs text-gray-400">
                  {t('playlist.defaultVolume')}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={activePlaylist.settings.defaultVolume}
                    onChange={(e) => updateSettings({ defaultVolume: Number(e.target.value) })}
                    className="w-24 accent-accent-500"
                  />
                  <span className="w-8 text-gray-300">{activePlaylist.settings.defaultVolume}</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-xs text-gray-600">
                {t('playlist.count', { count: activePlaylist.items.length })}
              </span>
              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-fg/10"
              >
                <Plus size={12} />
                {t('playlist.addWallpapers')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {activePlaylist.items.length === 0 && (
                <div className="flex h-32 items-center justify-center text-sm text-gray-600">
                  {t('playlist.empty')}
                </div>
              )}
              {activePlaylist.items.map((item, index) => (
                <PlaylistItemRow
                  key={item.wallpaperId}
                  item={item}
                  wallpaper={wallpaperById.get(item.wallpaperId)}
                  index={index}
                  isPlaying={isPlaying}
                  isCurrent={currentItemIds.has(item.wallpaperId)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onPlay={() => handlePlayItem(item.wallpaperId)}
                  onRemove={() => handleRemoveItem(item.wallpaperId)}
                  onUpdate={(patch) => handleUpdateItem(item.wallpaperId, patch)}
                  onContextMenu={(e) => openItemCtxMenu(e, item.wallpaperId)}
                  onOpenDetail={() => setDetailId(item.wallpaperId)}
                  defaultDurationSec={activePlaylist.settings.defaultDurationSec}
                  defaultVolume={activePlaylist.settings.defaultVolume}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {detailWallpaper && (
        <DetailSidebar
          id={detailWallpaper.id}
          {...detailSidebarProps(detailWallpaper)}
          onClose={() => setDetailId(null)}
          onSubscribe={() => subscribe(detailWallpaper.id)}
          onUnsubscribe={() => unsubscribe([detailWallpaper.id])}
          onPlay={(target) => applyWallpaper(detailWallpaper.id, target)}
          onBrowseCreator={onBrowseCreator}
        />
      )}
      </div>

      {pickerOpen && activePlaylist && (
        <WallpaperPickerModal
          excludeIds={existingIds}
          onAdd={handleAddWallpapers}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {ctxMenu && (
        <WallpaperContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          ids={[ctxMenu.wallpaperId]}
          wallpapers={ctxWallpaper ? [ctxWallpaper] : []}
          onClose={() => setCtxMenu(null)}
          onBrowseCreator={onBrowseCreator}
        />
      )}
    </div>
  )
}
