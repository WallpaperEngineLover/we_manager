import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  RefreshCw,
  FolderPlus,
  Folder,
  FolderOpen,
  Upload,
  Pencil,
  Trash2,
  Eraser,
  Archive,
  WifiOff,
  ShieldAlert,
  ChevronLeft
} from 'lucide-react'
import WallpaperCard from './WallpaperCard'
import PreviewSizeToggle from '../common/PreviewSizeToggle'
import DetailSidebar from '../common/DetailSidebar'
import WallpaperContextMenu from '../common/WallpaperContextMenu'
import { ContextMenu, MenuItem } from '../common/ContextMenu'
import {
  FiltersToggle,
  LoadingSpinner,
  MarqueeOverlay,
  Pagination,
  PanelToggle,
  ResetFiltersButton,
  SearchInput,
  ToolbarButton
} from '../common/GridControls'
import { CheckItem, FilterPanel, FilterSection, ResolutionFilterSection, TagFilterSection } from '../common/FilterPanel'
import { useToast } from '../common/Toast'
import type { LibraryFilters, WallpaperFolder } from '@shared/types'
import clsx from 'clsx'
import {
  WE_TYPES,
  WE_LIBRARY_AGE_RATINGS,
  ALL_RESOLUTION_TAGS,
  migrateResolutionSelection
} from '../../constants/weFilters'
import { usePreviewSize, previewGridStyle } from '../../hooks/usePreviewSize'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useVoteBorders } from '../../hooks/useVoteBorders'
import { useVotedIds } from '../../hooks/useVotes'
import { useConfig, useFolders, useLweInstalled, usePlaybackStates, usePlaylists } from '../../hooks/queries'
import { useApplyWallpaper, useSubscribe, useUnsubscribe } from '../../hooks/useWallpaperActions'
import { useSelectableGrid } from '../../hooks/useSelectableGrid'
import { toggle } from '../../utils/array'
import { isEditingText } from '../../utils/dom'
import { backupSummary, detailSidebarProps, isBackupOutdated } from '../../utils/wallpaper'

interface LibraryFilterState {
  types: string[]
  ageRatings: string[]
  genres: string[]
  resolutions: string[]
  sources: string[]
  failedOnly: boolean
  likedOnly: boolean
  unavailableOnly: boolean
  outdatedBackupOnly: boolean
}

const DEFAULT_STATE: LibraryFilterState = {
  types: [],
  ageRatings: [],
  genres: [],
  resolutions: [],
  sources: [],
  failedOnly: false,
  likedOnly: false,
  unavailableOnly: false,
  outdatedBackupOnly: false
}

function loadFilters(stored: unknown): LibraryFilterState {
  const parsed = stored as Partial<LibraryFilterState>
  return { ...DEFAULT_STATE, ...parsed, resolutions: migrateResolutionSelection(parsed.resolutions) }
}

const TYPE_MAP: Record<string, string> = {
  Scene: 'scene',
  Video: 'video',
  Web: 'web',
  Application: 'application'
}
const RATING_MAP: Record<string, string> = {
  Everyone: 'everyone',
  Questionable: 'questionable',
  Mature: 'mature',
  Uncategorized: 'uncategorized'
}
const SOURCE_MAP: Record<string, string> = {
  Workshop: 'workshop',
  Backup: 'backup'
}

interface SortState {
  sortBy: LibraryFilters['sortBy']
  sortDir: 'asc' | 'desc'
}

const DEFAULT_SORT: SortState = { sortBy: 'updatedAt', sortDir: 'desc' }

const BACKUP_FOLDER_HINT = 'Configure a backup folder in Settings first'

const LIBRARY_TYPES = WE_TYPES.filter((t) => t.tag in TYPE_MAP)
const SOURCES = Object.keys(SOURCE_MAP).map((tag) => ({ tag, label: tag }))

// genre/custom tags, too many to list without a search box
function TagsFilterSection({
  available,
  selected,
  onChange
}: {
  available: string[]
  selected: string[]
  onChange: (tags: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = available.filter((t) => t.toLowerCase().includes(search.toLowerCase()))

  return (
    <FilterSection title="Tags" defaultOpen={false} activeCount={selected.length}>
      <input
        type="text"
        placeholder="Search tags..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-1 w-full rounded bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 && <p className="py-1 text-xs text-gray-600">No tags found</p>}
        {filtered.map((tag) => (
          <CheckItem
            key={tag}
            label={tag}
            checked={selected.includes(tag)}
            onChange={() => onChange(toggle(selected, tag))}
          />
        ))}
      </div>
    </FilterSection>
  )
}

function folderRowClass(active: boolean): string {
  return clsx(
    'flex items-center gap-2 px-3 py-1.5 text-xs',
    active ? 'bg-white/5 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
  )
}

function dropWallpaperId(e: React.DragEvent): string {
  return e.dataTransfer.getData('text/wallpaper-id')
}

type BackgroundTask = 'backup-selection' | 'scan-backups' | 'check-unavailable' | 'backup-unavailable'

interface LibraryViewProps {
  onBrowseCreator?: (creatorSteamId: string) => void
}

export default function LibraryView({ onBrowseCreator }: LibraryViewProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [sort, setSort] = usePersistentState('we-library-sort', DEFAULT_SORT)
  const [filterState, setFilterState] = usePersistentState('we-library-filters', DEFAULT_STATE, loadFilters)
  const [showFilters, setShowFilters] = usePersistentState('we-library-show-filters', true, (v) => v !== false)
  const [showFolders, setShowFolders] = usePersistentState('we-library-show-folders', true, (v) => v !== false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ imported: number; skipped: number; removed: number } | null>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [previewSize, setPreviewSize] = usePreviewSize()

  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null = "All"
  const [folderMenu, setFolderMenu] = useState<{ folder: WallpaperFolder; x: number; y: number } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null)

  const votedSet = useVotedIds()
  const { enabled: voteBordersEnabled, failed: failedVotes } = useVoteBorders()
  const lweInstalled = useLweInstalled()
  const isBackupConfigured = useConfig()?.isBackupConfigured ?? false
  const { folders, refetchFolders, moveToFolder } = useFolders()
  const applyWallpaper = useApplyWallpaper()
  const subscribe = useSubscribe()
  const unsubscribe = useUnsubscribe()

  function setFilter<K extends keyof LibraryFilterState>(key: K, value: LibraryFilterState[K]) {
    setFilterState((prev) => ({ ...prev, [key]: value }))
  }

  function toggleFlag(key: 'failedOnly' | 'likedOnly' | 'unavailableOnly' | 'outdatedBackupOnly') {
    setFilterState((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const flagCount =
    (filterState.failedOnly ? 1 : 0) +
    (filterState.likedOnly ? 1 : 0) +
    (filterState.unavailableOnly ? 1 : 0) +
    (filterState.outdatedBackupOnly ? 1 : 0)
  const activeCount =
    filterState.types.length +
    filterState.ageRatings.length +
    filterState.genres.length +
    filterState.resolutions.length +
    filterState.sources.length +
    flagCount

  // Refresh the library once a background download (subscribe or redownload) settles,
  // so the downloading/downloadFailed badges stay in sync without a manual Scan.
  useEffect(() => {
    return window.electronAPI.on.downloadProgress((progress) => {
      if (progress.status === 'completed' || progress.status === 'error') {
        queryClient.invalidateQueries({ queryKey: ['library'] })
      }
    })
  }, [queryClient])

  const filters: LibraryFilters = {
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    searchText: search || undefined,
    type:
      filterState.types.length === 1
        ? (TYPE_MAP[filterState.types[0]] as LibraryFilters['type'])
        : undefined,
    contentRating:
      filterState.ageRatings.length === 1
        ? (RATING_MAP[filterState.ageRatings[0]] as LibraryFilters['contentRating'])
        : undefined
  }

  const { data: allWallpapers = [], isLoading } = useQuery({
    queryKey: ['library', filters],
    queryFn: () => window.electronAPI.library.getAll(filters)
  })

  // Client-side OR filtering for multiple types / ratings / genres
  const filtered = useMemo(() => {
    const types = filterState.types.map((t) => TYPE_MAP[t]).filter(Boolean)
    const ratings = filterState.ageRatings.map((r) => RATING_MAP[r]).filter(Boolean)
    const sources = filterState.sources.map((s) => SOURCE_MAP[s]).filter(Boolean)
    return allWallpapers.filter((w) => {
      if (filterState.types.length > 1 && !types.includes(w.type)) return false
      if (filterState.ageRatings.length > 1 && !ratings.includes(w.contentRating ?? 'uncategorized')) return false
      if (filterState.genres.length > 0 && !filterState.genres.some((g) => w.tags.includes(g))) return false
      if (filterState.resolutions.length > 0 && !filterState.resolutions.some((r) => w.resolutions?.includes(r)))
        return false
      if (filterState.sources.length > 0 && !sources.includes(w.source)) return false
      if (filterState.failedOnly && !w.downloadFailed) return false
      if (filterState.likedOnly && !votedSet.has(w.id)) return false
      if (filterState.unavailableOnly && !w.unavailable) return false
      if (filterState.outdatedBackupOnly && !isBackupOutdated(w)) return false
      return true
    })
  }, [allWallpapers, filterState, votedSet])

  const existingIds = useMemo(() => new Set(allWallpapers.map((w) => w.id)), [allWallpapers])

  const statusCounts = useMemo(
    () => ({
      failed: allWallpapers.filter((w) => w.downloadFailed).length,
      liked: allWallpapers.filter((w) => votedSet.has(w.id)).length,
      unavailable: allWallpapers.filter((w) => w.unavailable).length,
      outdatedBackup: allWallpapers.filter(isBackupOutdated).length
    }),
    [allWallpapers, votedSet]
  )

  // Removed-from-workshop items with local content that hasn't been backed up yet
  const unavailableNotBackedUp = useMemo(
    () => allWallpapers.filter((w) => w.unavailable && !w.backedUp),
    [allWallpapers]
  )

  // Set of all IDs that belong to at least one folder AND exist in the library
  const allFolderItemIds = useMemo(() => {
    const set = new Set<string>()
    for (const f of folders) {
      for (const id of f.items) {
        if (existingIds.has(id)) set.add(id)
      }
    }
    return set
  }, [folders, existingIds])

  // Real item count per folder (only items that exist in the library)
  const folderCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of folders) {
      map.set(f.id, f.items.filter((id) => existingIds.has(id)).length)
    }
    return map
  }, [folders, existingIds])

  // Unsorted items, what the "Default" folder shows
  const unsorted = useMemo(() => filtered.filter((w) => !allFolderItemIds.has(w.id)), [filtered, allFolderItemIds])

  // Folder filtering:
  // Default (null) = everything NOT inside any folder (unsorted)
  // Specific folder = only that folder's items
  const allWallpapersForView = useMemo(() => {
    if (!activeFolder) return unsorted
    const folder = folders.find((f) => f.id === activeFolder)
    if (!folder) return filtered
    const set = new Set(folder.items)
    return filtered.filter((w) => set.has(w.id))
  }, [filtered, unsorted, activeFolder, folders])

  const totalItems = allWallpapersForView.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)
  const wallpapers = useMemo(
    () => allWallpapersForView.slice((safePage - 1) * pageSize, safePage * pageSize),
    [allWallpapersForView, safePage, pageSize]
  )

  useEffect(() => { setPage(1) }, [filterState, activeFolder, search, sort, pageSize])

  const wallpaperIds = useMemo(() => wallpapers.map((w) => w.id), [wallpapers])
  const {
    selectedIds,
    clearSelection,
    selectForContextMenu,
    handleCardSelect,
    containerProps,
    marqueeRect
  } = useSelectableGrid({
    ids: wallpaperIds,
    dataAttr: 'data-wallpaper-id',
    onOpenDetail: setDetailId
  })

  const resolutionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const w of allWallpapers) {
      for (const r of w.resolutions ?? []) counts.set(r, (counts.get(r) ?? 0) + 1)
    }
    return counts
  }, [allWallpapers])

  const { data: availableTags = [] } = useQuery({
    queryKey: ['library-tags'],
    queryFn: () => window.electronAPI.library.distinctTags()
  })

  const playbackStates = usePlaybackStates()
  // the playlist "add to current" goes to, the first one playing when several screens have their own
  const currentPlaylistId =
    (playbackStates.find((s) => s.isPlaying) ?? playbackStates.find((s) => s.playlistId))?.playlistId ?? null

  const playlists = usePlaylists()
  const currentPlaylistItemIds = useMemo(() => {
    const playlist = playlists.find((p) => p.id === currentPlaylistId)
    return new Set(playlist?.items.map((item) => item.wallpaperId) ?? [])
  }, [playlists, currentPlaylistId])

  async function addToCurrentPlaylist(ids: string[]) {
    if (!currentPlaylistId || ids.length === 0) return
    await window.electronAPI.playlist.addItems(currentPlaylistId, ids)
    queryClient.invalidateQueries({ queryKey: ['playlists'] })
    showToast('Added to current playlist')
  }

  const [runningTasks, setRunningTasks] = useState<Set<BackgroundTask>>(new Set())
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [backupProgress, setBackupProgress] = useState<
    Map<string, { percentage: number; status: 'copying' | 'verifying' }>
  >(new Map())

  useEffect(() => {
    return window.electronAPI.on.backupProgress((progress) => {
      setBackupProgress((prev) => {
        const next = new Map(prev)
        if (progress.status === 'copying' || progress.status === 'verifying') {
          next.set(progress.itemId, { percentage: progress.percentage, status: progress.status })
        } else {
          next.delete(progress.itemId)
        }
        return next
      })
      if (progress.status === 'error') {
        showToast(`Backup failed: ${progress.message ?? 'verification error'}`)
      }
    })
  }, [showToast])

  // backup and availability checks report into the status line and can change any wallpaper's flags
  async function runTask(task: BackgroundTask, work: () => Promise<string>) {
    setRunningTasks((prev) => new Set(prev).add(task))
    setBackupStatus(null)
    try {
      setBackupStatus(await work())
    } finally {
      setRunningTasks((prev) => {
        const next = new Set(prev)
        next.delete(task)
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['library'] })
    }
  }

  function handleBackupSelection() {
    if (selectedIds.size === 0) return
    const toBackUp = wallpapers.filter((w) => selectedIds.has(w.id) && w.source === 'workshop')
    if (toBackUp.length === 0) {
      setBackupStatus('No workshop wallpapers selected.')
      return
    }
    void runTask('backup-selection', async () =>
      `${backupSummary(await window.electronAPI.backup.selection(toBackUp.map((w) => w.id)))}.`
    )
  }

  function handleScanBackups() {
    void runTask('scan-backups', async () => {
      const result = await window.electronAPI.backup.scan()
      const dropped = result.removed + result.unlinked
      return `Backup scan: ${result.imported} imported, ${result.linked} linked${dropped > 0 ? `, ${dropped} broken removed` : ''}${result.corrupted.length > 0 ? `, ${result.corrupted.length} corrupted folder${result.corrupted.length === 1 ? '' : 's'} skipped (${result.corrupted.join(', ')})` : ''}.`
    })
  }

  function handleCheckUnavailable() {
    void runTask('check-unavailable', async () => {
      const result = await window.electronAPI.library.checkUnavailable()
      return `Checked ${result.checked} workshop item(s): ${result.unavailable} no longer available on the workshop.`
    })
  }

  function handleBackupAllUnavailable() {
    if (unavailableNotBackedUp.length === 0) return
    void runTask('backup-unavailable', async () =>
      `${backupSummary(await window.electronAPI.backup.selection(unavailableNotBackedUp.map((w) => w.id)))}.`
    )
  }

  async function handleScan() {
    setScanning(true)
    setScanResult(null)
    const result = await window.electronAPI.library.scan()
    setScanResult(result)
    setScanning(false)
    queryClient.invalidateQueries({ queryKey: ['library'] })
    queryClient.invalidateQueries({ queryKey: ['library-tags'] })
  }

  // Folder creation uses an inline input instead of prompt()
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)

  async function handleCreateFolderSubmit() {
    if (!newFolderName.trim()) {
      setCreatingFolder(false)
      return
    }
    await window.electronAPI.folders.create(newFolderName.trim())
    setNewFolderName('')
    setCreatingFolder(false)
    refetchFolders()
  }

  async function handleImportWEConfig() {
    try {
      const filePath = await window.electronAPI.config.pickFile()
      if (!filePath) return
      const result = await window.electronAPI.config.importWE(filePath)
      refetchFolders()
      queryClient.invalidateQueries({ queryKey: ['library'] })
      setImportStatus(`Imported ${result.folders} folders and ${result.playlists} playlists.`)
    } catch (err) {
      setImportStatus(`Import failed: ${(err as Error).message}`)
    }
  }

  async function handleCleanupFolders() {
    const { removed } = await window.electronAPI.folders.cleanup()
    refetchFolders()
    setImportStatus(
      removed > 0
        ? `Cleaned up ${removed} non-existent wallpaper(s) from folders.`
        : 'All folder items are valid, nothing to clean up.'
    )
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return
    await window.electronAPI.folders.rename(id, renameValue.trim())
    setRenamingId(null)
    refetchFolders()
  }

  async function handleDeleteFolder(id: string) {
    await window.electronAPI.folders.delete(id)
    if (activeFolder === id) setActiveFolder(null)
    setFolderMenu(null)
    refetchFolders()
  }

  // dragging a selected card moves the whole selection
  function handleDrop(folderId: string, wallpaperId: string) {
    if (!wallpaperId) return
    void moveToFolder(folderId, selectedIds.has(wallpaperId) ? [...selectedIds] : [wallpaperId])
  }

  function openFolderMenu(e: React.MouseEvent, folder: WallpaperFolder) {
    e.preventDefault()
    setFolderMenu({ folder, x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    clearSelection()
  }, [activeFolder, clearSelection])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === '+' && selectedIds.size > 0 && !isEditingText()) {
        addToCurrentPlaylist([...selectedIds])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function openWallpaperCtxMenu(e: React.MouseEvent, wallpaperId: string) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, ids: selectForContextMenu(wallpaperId) })
  }

  const activeFolderTitle = activeFolder ? folders.find((f) => f.id === activeFolder)?.title : undefined
  const ctxWallpapers = ctxMenu ? wallpapers.filter((w) => ctxMenu.ids.includes(w.id)) : []
  const detailWallpaper = detailId ? wallpapers.find((w) => w.id === detailId) : undefined

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3">
        <FiltersToggle open={showFilters} activeCount={activeCount} onClick={() => setShowFilters((v) => !v)} />
        <PanelToggle icon={Folder} label="Folders" open={showFolders} onClick={() => setShowFolders((v) => !v)} />
        <SearchInput value={search} placeholder="Search library..." onChange={setSearch} />
        <select
          value={sort.sortBy ?? 'updatedAt'}
          onChange={(e) => setSort((prev) => ({ ...prev, sortBy: e.target.value as LibraryFilters['sortBy'] }))}
          className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="title">Name</option>
          <option value="updatedAt">Date Updated</option>
          <option value="createdAt">Date Added</option>
          <option value="fileSize">File Size</option>
          <option value="lastApplied">Last Applied</option>
          <option value="appliedCount">Most Applied</option>
        </select>
        <button
          onClick={() => setSort((prev) => ({ ...prev, sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc' }))}
          title={sort.sortDir === 'asc' ? 'Ascending' : 'Descending'}
          className="rounded-lg bg-white/5 px-2 py-2 text-sm text-gray-300 hover:bg-white/10"
        >
          {sort.sortDir === 'asc' ? '↑' : '↓'}
        </button>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
          <option value={200}>200 / page</option>
        </select>
        <PreviewSizeToggle value={previewSize} onChange={setPreviewSize} />
        {activeCount > 0 && <ResetFiltersButton onClick={() => setFilterState(DEFAULT_STATE)} />}
        <div className="ml-auto" />
        <ToolbarButton
          icon={<RefreshCw size={14} />}
          busy={scanning}
          disabled={scanning}
          title="Scan workshop folder"
          onClick={handleScan}
        >
          Scan
        </ToolbarButton>
        <ToolbarButton
          icon={<Archive size={14} />}
          busy={runningTasks.has('scan-backups')}
          disabled={runningTasks.has('scan-backups') || !isBackupConfigured}
          title={isBackupConfigured ? 'Scan backup folder' : BACKUP_FOLDER_HINT}
          onClick={handleScanBackups}
        >
          Scan backups
        </ToolbarButton>
        <ToolbarButton
          icon={<WifiOff size={14} />}
          busy={runningTasks.has('check-unavailable')}
          disabled={runningTasks.has('check-unavailable')}
          title="Check the workshop for wallpapers that have been removed"
          onClick={handleCheckUnavailable}
        >
          Check unavailable
        </ToolbarButton>
      </div>

      <div className="flex min-h-10 items-center gap-2 border-b border-white/5 px-4 py-1.5">
        <span className="text-xs text-gray-600">
          {selectedIds.size > 0
            ? `${selectedIds.size} selected / ${wallpapers.length} wallpapers`
            : `${wallpapers.length} wallpapers`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {unavailableNotBackedUp.length > 0 && (
            <button
              onClick={handleBackupAllUnavailable}
              disabled={runningTasks.has('backup-unavailable') || !isBackupConfigured}
              title={
                isBackupConfigured
                  ? `Back up the ${unavailableNotBackedUp.length} removed-from-workshop wallpaper(s) that don't have a backup yet (${statusCounts.unavailable - unavailableNotBackedUp.length} already do)`
                  : BACKUP_FOLDER_HINT
              }
              className="flex items-center gap-1.5 rounded-lg bg-amber-600/80 px-3 py-1.5 text-xs text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {runningTasks.has('backup-unavailable') ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ShieldAlert size={12} />
              )}
              Backup all unavailable ({unavailableNotBackedUp.length})
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              onClick={handleBackupSelection}
              disabled={runningTasks.has('backup-selection') || !isBackupConfigured}
              title={isBackupConfigured ? 'Back up selected wallpapers' : BACKUP_FOLDER_HINT}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 disabled:opacity-50"
            >
              {runningTasks.has('backup-selection') ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Archive size={12} />
              )}
              Backup selection
            </button>
          )}
        </div>
      </div>

      {scanResult && (
        <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-400">
          Scan complete: {scanResult.imported} imported{scanResult.removed > 0 ? `, ${scanResult.removed} removed` : ''}
        </div>
      )}

      {backupProgress.size > 0 && (
        <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-400">
          Backing up {backupProgress.size} wallpaper{backupProgress.size === 1 ? '' : 's'}
          {Array.from(backupProgress.values()).some((p) => p.status === 'verifying')
            ? ' (verifying copies)'
            : ''}
          ...{' '}
          {Math.round(
            Array.from(backupProgress.values()).reduce((sum, p) => sum + p.percentage, 0) /
              backupProgress.size
          )}
          % avg
        </div>
      )}

      {backupStatus && (
        <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-400">
          {backupStatus}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {showFilters && (
          <FilterPanel>
            <FilterSection title="Status" activeCount={flagCount}>
              <CheckItem
                label="Download failed"
                title="Show only wallpapers whose download failed (e.g. disk ran out of space)"
                count={statusCounts.failed}
                checked={filterState.failedOnly}
                onChange={() => toggleFlag('failedOnly')}
              />
              <CheckItem
                label="Liked"
                title="Show only wallpapers you've liked on Steam"
                count={statusCounts.liked}
                checked={filterState.likedOnly}
                onChange={() => toggleFlag('likedOnly')}
              />
              <CheckItem
                label="Unavailable"
                title={
                  unavailableNotBackedUp.length > 0
                    ? `Show only wallpapers removed from the Steam Workshop (${unavailableNotBackedUp.length} of these have no backup yet)`
                    : 'Show only wallpapers removed from the Steam Workshop'
                }
                count={statusCounts.unavailable}
                checked={filterState.unavailableOnly}
                onChange={() => toggleFlag('unavailableOnly')}
              />
              <CheckItem
                label="Outdated backup"
                title="Show only wallpapers whose backup is an older version than the one on the Steam Workshop"
                count={statusCounts.outdatedBackup}
                checked={filterState.outdatedBackupOnly}
                onChange={() => toggleFlag('outdatedBackupOnly')}
              />
            </FilterSection>
            <TagFilterSection
              title="Type"
              options={LIBRARY_TYPES}
              selected={filterState.types}
              onChange={(tags) => setFilter('types', tags)}
            />
            <TagFilterSection
              title="Age Rating"
              options={WE_LIBRARY_AGE_RATINGS}
              selected={filterState.ageRatings}
              onChange={(tags) => setFilter('ageRatings', tags)}
            />
            <TagFilterSection
              title="Source"
              options={SOURCES}
              selected={filterState.sources}
              onChange={(tags) => setFilter('sources', tags)}
            />
            <ResolutionFilterSection
              selected={filterState.resolutions}
              allTags={ALL_RESOLUTION_TAGS}
              counts={resolutionCounts}
              onChange={(resolutions) => setFilter('resolutions', resolutions)}
            />
            <TagsFilterSection
              available={availableTags}
              selected={filterState.genres}
              onChange={(tags) => setFilter('genres', tags)}
            />
          </FilterPanel>
        )}

        {showFolders && (
        <div className="flex w-48 flex-shrink-0 flex-col border-r border-white/5 overflow-y-auto">
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
              Folders
            </span>
            <div className="flex gap-1">
              <button
                onClick={handleImportWEConfig}
                title="Import from WE config.json"
                className="rounded p-0.5 text-gray-600 hover:text-gray-300"
              >
                <Upload size={12} />
              </button>
              <button
                onClick={handleCleanupFolders}
                title="Clean up folders (remove non-existent wallpapers)"
                className="rounded p-0.5 text-gray-600 hover:text-gray-300"
              >
                <Eraser size={12} />
              </button>
              <button
                onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
                title="Create folder"
                className="rounded p-0.5 text-gray-600 hover:text-gray-300"
              >
                <FolderPlus size={12} />
              </button>
            </div>
          </div>

          {importStatus && (
            <div className="px-3 py-1.5 text-[10px] text-gray-400 border-b border-white/5">
              {importStatus}
            </div>
          )}

          <button onClick={() => setActiveFolder(null)} className={folderRowClass(activeFolder === null)}>
            <Folder size={14} />
            <span className="flex-1 text-left truncate">Default</span>
            <span className="text-gray-600">{unsorted.length}</span>
          </button>

          {creatingFolder && (
            <div className="flex items-center gap-1 px-3 py-1.5">
              <FolderPlus size={14} className="shrink-0 text-gray-500" />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={handleCreateFolderSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolderSubmit()
                  if (e.key === 'Escape') setCreatingFolder(false)
                }}
                placeholder="Folder name..."
                className="flex-1 bg-transparent text-xs text-gray-200 outline-none placeholder-gray-600"
              />
            </div>
          )}

          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setActiveFolder(folder.id)}
              onContextMenu={(e) => openFolderMenu(e, folder)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(folder.id, dropWallpaperId(e))}
              className={folderRowClass(activeFolder === folder.id)}
            >
              {activeFolder === folder.id ? <FolderOpen size={14} /> : <Folder size={14} />}
              {renamingId === folder.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(folder.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(folder.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-transparent text-xs text-gray-200 outline-none"
                />
              ) : (
                <span className="flex-1 truncate text-left">{folder.title}</span>
              )}
              <span className="text-gray-600">{folderCounts.get(folder.id) ?? 0}</span>
            </button>
          ))}
        </div>
        )}

        <div {...containerProps} className="relative flex-1 overflow-y-auto p-4 select-none">
          {!showFolders && activeFolderTitle && (
            <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-400">
              <button
                onClick={() => setActiveFolder(null)}
                className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-gray-300 hover:bg-white/10"
              >
                <ChevronLeft size={12} /> Default
              </button>
              <FolderOpen size={12} className="ml-1 text-indigo-400" />
              <span className="truncate text-gray-200">{activeFolderTitle}</span>
            </div>
          )}
          {isLoading && <LoadingSpinner />}
          {!isLoading && wallpapers.length === 0 && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-gray-500">
              <p>
                {activeFolder
                  ? 'This folder is empty. Drag wallpapers here.'
                  : activeCount > 0
                    ? 'No wallpapers match your filters'
                    : 'Your library is empty'}
              </p>
              {activeCount === 0 && !activeFolder && (
                <p className="text-xs">
                  Click Scan to import wallpapers from your workshop folder
                </p>
              )}
            </div>
          )}
          {!activeFolder && folders.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 mb-4">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => setActiveFolder(folder.id)}
                  onContextMenu={(e) => openFolderMenu(e, folder)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.add('ring-2', 'ring-indigo-500')
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('ring-2', 'ring-indigo-500')
                  }}
                  onDrop={(e) => {
                    e.currentTarget.classList.remove('ring-2', 'ring-indigo-500')
                    handleDrop(folder.id, dropWallpaperId(e))
                  }}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg bg-[#1a1a1a] p-4 transition-all hover:ring-1 hover:ring-indigo-500/50"
                >
                  <Folder size={28} className="shrink-0 text-indigo-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-200">
                      {folder.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {folderCounts.get(folder.id) ?? 0} items
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4" style={previewGridStyle(previewSize)}>
            {wallpapers.map((wallpaper) => (
              <WallpaperCard
                key={wallpaper.id}
                wallpaper={wallpaper}
                selected={selectedIds.has(wallpaper.id)}
                isDetailOpen={detailId === wallpaper.id}
                lweInstalled={lweInstalled}
                isLiked={votedSet.has(wallpaper.id)}
                voteError={failedVotes[wallpaper.id]}
                showVoteBorder={voteBordersEnabled}
                currentPlaylistId={currentPlaylistId}
                isInCurrentPlaylist={currentPlaylistItemIds.has(wallpaper.id)}
                previewSize={previewSize}
                backupProgress={backupProgress.get(wallpaper.id) ?? null}
                onSelect={(e) => handleCardSelect(wallpaper.id, e)}
                onContextMenu={(e) => openWallpaperCtxMenu(e, wallpaper.id)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex justify-center">
              <Pagination page={safePage} totalPages={totalPages} onPage={setPage}>
                Page {safePage} of {totalPages} ({totalItems} items)
              </Pagination>
            </div>
          )}

          <MarqueeOverlay rect={marqueeRect} />
        </div>

        {detailId && detailWallpaper && (
          <DetailSidebar
            id={detailId}
            {...detailSidebarProps(detailWallpaper)}
            onClose={() => setDetailId(null)}
            onSubscribe={() => subscribe(detailId)}
            onUnsubscribe={() => unsubscribe([detailId])}
            onPlay={(screen) => applyWallpaper(detailId, screen)}
            onBrowseCreator={onBrowseCreator}
          />
        )}
      </div>

      {folderMenu && (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          onClose={() => setFolderMenu(null)}
          className="min-w-[140px]"
        >
          <MenuItem
            icon={Pencil}
            onClick={() => {
              setRenamingId(folderMenu.folder.id)
              setRenameValue(folderMenu.folder.title)
              setFolderMenu(null)
            }}
          >
            Rename
          </MenuItem>
          <MenuItem icon={Trash2} danger onClick={() => handleDeleteFolder(folderMenu.folder.id)}>
            Delete
          </MenuItem>
        </ContextMenu>
      )}

      {ctxMenu && (
        <WallpaperContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          ids={ctxMenu.ids}
          wallpapers={ctxWallpapers}
          onClose={() => setCtxMenu(null)}
          onBrowseCreator={onBrowseCreator}
        />
      )}
    </div>
  )
}
