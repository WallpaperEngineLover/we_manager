import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  ArrowDownWideNarrow
} from 'lucide-react'
import clsx from 'clsx'
import type { Playlist, PlaylistPlaybackState, PlaylistSettings } from '@shared/types'
import PlaylistItemRow from './PlaylistItemRow'
import WallpaperPickerModal from './WallpaperPickerModal'

const SORT_OPTIONS: { value: PlaylistSettings['sortBy']; label: string }[] = [
  { value: 'manual', label: 'Manual order' },
  { value: 'title', label: 'Title' },
  { value: 'createdAt', label: 'Date added' }
]

export default function PlaylistsView() {
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

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => window.electronAPI.playlist.getAll()
  })

  const { data: wallpapers = [] } = useQuery({
    queryKey: ['library-all'],
    queryFn: () => window.electronAPI.library.getAll()
  })
  const wallpaperById = useMemo(() => new Map(wallpapers.map((w) => [w.id, w])), [wallpapers])

  const { data: playbackState } = useQuery({
    queryKey: ['playlist-playback-state'],
    queryFn: () => window.electronAPI.playlist.getState()
  })

  useEffect(() => {
    return window.electronAPI.on.playlistStateChanged((state: PlaylistPlaybackState) => {
      queryClient.setQueryData(['playlist-playback-state'], state)
    })
  }, [queryClient])

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null

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
      await window.electronAPI.playlist.start(activePlaylist.id)
      queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handlePauseResume() {
    if (isThisPlaylistActive && playbackState?.isPlaying) {
      await window.electronAPI.playlist.pause()
    } else {
      await window.electronAPI.playlist.resume()
    }
    queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
  }

  async function handleStop() {
    await window.electronAPI.playlist.stop()
    queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
  }

  async function handleNext() {
    await window.electronAPI.playlist.next()
    queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
  }

  async function handlePrevious() {
    await window.electronAPI.playlist.previous()
    queryClient.invalidateQueries({ queryKey: ['playlist-playback-state'] })
  }

  const isThisPlaylistActive = playbackState?.playlistId === activePlaylist?.id
  const existingIds = useMemo(
    () => new Set(activePlaylist?.items.map((i) => i.wallpaperId) ?? []),
    [activePlaylist]
  )

  return (
    <div className="flex h-full">
      <div className="flex w-56 shrink-0 flex-col border-r border-white/5 overflow-y-auto">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            Playlists
          </span>
          <button
            onClick={() => {
              setCreating(true)
              setNewTitle('')
            }}
            title="Create playlist"
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
              placeholder="Playlist name..."
              className="flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder-gray-600"
            />
          </div>
        )}

        {playlists.length === 0 && !creating && (
          <p className="px-3 py-4 text-xs text-gray-600">
            No playlists yet. Create one to play wallpapers in sequence.
          </p>
        )}

        {playlists.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePlaylistId(p.id)}
            className={clsx(
              'group flex items-center gap-2 px-3 py-2 text-sm',
              activePlaylistId === p.id
                ? 'bg-white/5 text-white'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            )}
          >
            <ListVideo
              size={14}
              className={clsx(
                'shrink-0',
                playbackState?.playlistId === p.id ? 'text-indigo-400' : 'text-gray-600'
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

      <div className="flex flex-1 flex-col overflow-hidden">
        {!activePlaylist ? (
          <div className="flex h-full items-center justify-center text-gray-600">
            <p>Select or create a playlist to get started.</p>
          </div>
        ) : (
          <>
            <div className="border-b border-white/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100">{activePlaylist.title}</h2>
                <div className="flex items-center gap-2">
                  {isThisPlaylistActive ? (
                    <>
                      <button
                        onClick={handlePrevious}
                        title="Previous"
                        className="rounded-lg bg-white/5 p-2 text-gray-300 hover:bg-white/10"
                      >
                        <SkipBack size={14} />
                      </button>
                      <button
                        onClick={handlePauseResume}
                        title={playbackState?.isPlaying ? 'Pause' : 'Resume'}
                        className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-500"
                      >
                        {playbackState?.isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button
                        onClick={handleNext}
                        title="Next"
                        className="rounded-lg bg-white/5 p-2 text-gray-300 hover:bg-white/10"
                      >
                        <SkipForward size={14} />
                      </button>
                      <button
                        onClick={handleStop}
                        title="Stop"
                        className="rounded-lg bg-white/5 p-2 text-gray-300 hover:bg-red-500/20 hover:text-red-400"
                      >
                        <Square size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handlePlay}
                      disabled={activePlaylist.items.length === 0}
                      className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      <Play size={14} />
                      Play playlist
                    </button>
                  )}
                </div>
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <button
                    onClick={() => updateSettings({ randomize: !activePlaylist.settings.randomize })}
                    className={clsx(
                      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                      activePlaylist.settings.randomize ? 'bg-indigo-600' : 'bg-white/10'
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                        activePlaylist.settings.randomize ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                  <Shuffle size={12} />
                  Randomize
                </label>

                {!activePlaylist.settings.randomize && (
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <ArrowDownWideNarrow size={12} />
                    Sort by
                    <select
                      value={activePlaylist.settings.sortBy}
                      onChange={(e) =>
                        updateSettings({ sortBy: e.target.value as PlaylistSettings['sortBy'] })
                      }
                      className="rounded bg-white/5 px-2 py-1 text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 [&>option]:bg-[#1a1a1a]"
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-400">
                  Duration
                  <input
                    type="number"
                    min={1}
                    value={activePlaylist.settings.defaultDurationSec}
                    onChange={(e) =>
                      updateSettings({ defaultDurationSec: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-20 rounded bg-white/5 px-2 py-1 text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  sec
                </label>

                <label className="flex items-center gap-2 text-xs text-gray-400">
                  Default volume
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={activePlaylist.settings.defaultVolume}
                    onChange={(e) => updateSettings({ defaultVolume: Number(e.target.value) })}
                    className="w-24 accent-indigo-500"
                  />
                  <span className="w-8 text-gray-300">{activePlaylist.settings.defaultVolume}</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-xs text-gray-600">
                {activePlaylist.items.length} wallpaper
                {activePlaylist.items.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10"
              >
                <Plus size={12} />
                Add wallpapers
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {activePlaylist.items.length === 0 && (
                <div className="flex h-32 items-center justify-center text-sm text-gray-600">
                  This playlist is empty. Add wallpapers to get started.
                </div>
              )}
              {activePlaylist.items.map((item, index) => (
                <PlaylistItemRow
                  key={item.wallpaperId}
                  item={item}
                  wallpaper={wallpaperById.get(item.wallpaperId)}
                  index={index}
                  isPlaying={Boolean(isThisPlaylistActive && playbackState?.isPlaying)}
                  isCurrent={isThisPlaylistActive && playbackState?.currentItemId === item.wallpaperId}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onRemove={() => handleRemoveItem(item.wallpaperId)}
                  onUpdate={(patch) => handleUpdateItem(item.wallpaperId, patch)}
                  defaultDurationSec={activePlaylist.settings.defaultDurationSec}
                  defaultVolume={activePlaylist.settings.defaultVolume}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {pickerOpen && activePlaylist && (
        <WallpaperPickerModal
          excludeIds={existingIds}
          onAdd={handleAddWallpapers}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
