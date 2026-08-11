import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Folder,
  FolderOpen,
  Upload,
  Pencil,
  Trash2,
  ExternalLink,
  FolderInput,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Eraser,
  Archive,
  AlertTriangle,
  Heart,
  User,
  WifiOff,
  ShieldAlert
} from 'lucide-react'
import WallpaperCard from './WallpaperCard'
import PreviewSizeToggle from '../common/PreviewSizeToggle'
import DetailSidebar from '../common/DetailSidebar'
import { useToast } from '../common/Toast'
import type { LibraryFilters, WallpaperFolder, LweStatus } from '@shared/types'
import clsx from 'clsx'
import { WE_TYPES, WE_LIBRARY_AGE_RATINGS } from '../../constants/weFilters'
import { usePreviewSize, previewGridStyle } from '../../hooks/usePreviewSize'
import { useSelectableGrid } from '../../hooks/useSelectableGrid'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useClampedPosition, useFlipSide } from '../../hooks/useContextMenuPosition'
import { toggle } from '../../utils/array'
import { forEachIgnoringErrors } from '../../utils/async'
import { openWorkshopPage, isWorkshopId } from '../../utils/steam'
import { getPreviewSrc } from '../../utils/preview'

const STORAGE_KEY = 'we-library-filters'

interface LibraryFilterState {
  types: string[]
  ageRatings: string[]
  genres: string[]
  sources: string[]
  failedOnly: boolean
  likedOnly: boolean
  unavailableOnly: boolean
}

const DEFAULT_STATE: LibraryFilterState = {
  types: [],
  ageRatings: [],
  genres: [],
  sources: [],
  failedOnly: false,
  likedOnly: false,
  unavailableOnly: false
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

function loadFilters(): LibraryFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

const SORT_STORAGE_KEY = 'we-library-sort'

interface SortState {
  sortBy: LibraryFilters['sortBy']
  sortDir: 'asc' | 'desc'
}

const DEFAULT_SORT: SortState = { sortBy: 'updatedAt', sortDir: 'desc' }

function loadSort(): SortState {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    return raw ? { ...DEFAULT_SORT, ...JSON.parse(raw) } : DEFAULT_SORT
  } catch {
    return DEFAULT_SORT
  }
}

function Chip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-indigo-600 text-white'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
      )}
    >
      {label}
    </button>
  )
}

function TagDropdown({
  available,
  selected,
  onChange
}: {
  available: string[]
  selected: string[]
  onChange: (tags: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false))

  const filtered = available.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  )

  function toggleTag(tag: string) {
    onChange(
      selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors',
          selected.length > 0
            ? 'bg-indigo-600 text-white'
            : 'bg-white/5 text-gray-300 hover:bg-white/10'
        )}
      >
        Tags
        {selected.length > 0 && (
          <span className="rounded-full bg-white/20 px-1.5">{selected.length}</span>
        )}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-500">No tags found</p>
            )}
            {filtered.map((tag) => (
              <label
                key={tag}
                className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(tag)}
                  onChange={() => toggleTag(tag)}
                  className="accent-indigo-500"
                />
                <span className="text-xs text-gray-300">{tag}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FolderMenu({
  x,
  y,
  onClose,
  onRename,
  onDelete
}: {
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, onClose)
  const pos = useClampedPosition(ref, { x, y })

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[140px] rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl text-sm"
      style={{ left: pos?.x ?? x, top: pos?.y ?? y }}
    >
      <button
        onClick={onRename}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
      >
        <Pencil size={12} /> Rename
      </button>
      <button
        onClick={onDelete}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-white/5"
      >
        <Trash2 size={12} /> Delete
      </button>
    </div>
  )
}

interface LibraryViewProps {
  onBrowseCreator?: (creatorSteamId: string) => void
}

export default function LibraryView({ onBrowseCreator }: LibraryViewProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<LibraryFilters['sortBy']>(() => loadSort().sortBy)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => loadSort().sortDir)
  const [filterState, setFilterState] = useState<LibraryFilterState>(loadFilters)
  const [showFilters, setShowFilters] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{
    imported: number
    skipped: number
    removed: number
  } | null>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [previewSize, setPreviewSize] = usePreviewSize()

  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null = "All"
  const [folderMenu, setFolderMenu] = useState<{
    folder: WallpaperFolder
    x: number
    y: number
  } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    ids: string[]
    showFolderSub: boolean
  } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)
  const folderSubRef = useRef<HTMLDivElement>(null)

  useClickOutside(ctxMenuRef, () => setCtxMenu(null), !!ctxMenu)
  const ctxPos = useClampedPosition(ctxMenuRef, ctxMenu)
  const folderSubSide = useFlipSide(folderSubRef, !!ctxMenu?.showFolderSub)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filterState))
  }, [filterState])

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ sortBy, sortDir }))
  }, [sortBy, sortDir])

  function updateFilter<K extends 'types' | 'ageRatings' | 'genres' | 'sources'>(key: K, tag: string) {
    setFilterState((prev) => ({ ...prev, [key]: toggle(prev[key], tag) }))
  }

  function toggleFailedOnly() {
    setFilterState((prev) => ({ ...prev, failedOnly: !prev.failedOnly }))
  }

  function toggleLikedOnly() {
    setFilterState((prev) => ({ ...prev, likedOnly: !prev.likedOnly }))
  }

  function toggleUnavailableOnly() {
    setFilterState((prev) => ({ ...prev, unavailableOnly: !prev.unavailableOnly }))
  }

  const activeCount =
    filterState.types.length +
    filterState.ageRatings.length +
    filterState.genres.length +
    filterState.sources.length +
    (filterState.failedOnly ? 1 : 0) +
    (filterState.likedOnly ? 1 : 0) +
    (filterState.unavailableOnly ? 1 : 0)

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
    sortBy,
    sortDir,
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

  const { data: folders = [], refetch: refetchFolders } = useQuery({
    queryKey: ['folders'],
    queryFn: () => window.electronAPI.folders.getAll()
  })

  const { data: votedIds } = useQuery({
    queryKey: ['steam-voted-ids'],
    queryFn: () => window.electronAPI.steam.getVotedIds(),
    staleTime: Infinity
  })
  const votedSet = useMemo(() => new Set(votedIds ?? []), [votedIds])

  // Client-side OR filtering for multiple types / ratings / genres
  const filtered = useMemo(() => {
    return allWallpapers.filter((w) => {
      if (filterState.types.length > 1) {
        const types = filterState.types.map((t) => TYPE_MAP[t]).filter(Boolean)
        if (!types.includes(w.type)) return false
      }
      if (filterState.ageRatings.length > 1) {
        const ratings = filterState.ageRatings
          .map((r) => RATING_MAP[r])
          .filter(Boolean)
        if (!ratings.includes(w.contentRating ?? 'uncategorized')) return false
      }
      if (filterState.genres.length > 0) {
        if (!filterState.genres.some((g) => w.tags.includes(g))) return false
      }
      if (filterState.sources.length > 0) {
        const sources = filterState.sources.map((s) => SOURCE_MAP[s]).filter(Boolean)
        if (!sources.includes(w.source)) return false
      }
      if (filterState.failedOnly && !w.downloadFailed) return false
      if (filterState.likedOnly && !votedSet.has(w.id)) return false
      if (filterState.unavailableOnly && !w.unavailable) return false
      return true
    })
  }, [allWallpapers, filterState, votedSet])

  const existingIds = useMemo(
    () => new Set(allWallpapers.map((w) => w.id)),
    [allWallpapers]
  )

  const failedCount = useMemo(
    () => allWallpapers.filter((w) => w.downloadFailed).length,
    [allWallpapers]
  )

  const unavailableCount = useMemo(
    () => allWallpapers.filter((w) => w.unavailable).length,
    [allWallpapers]
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

  // Each wallpaper lives in at most one folder; map wallpaper id -> its folder id
  const folderOfItem = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of folders) {
      for (const id of f.items) map.set(id, f.id)
    }
    return map
  }, [folders])

  // Real item count per folder (only items that exist in the library)
  const folderCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of folders) {
      map.set(f.id, f.items.filter((id) => existingIds.has(id)).length)
    }
    return map
  }, [folders, existingIds])

  // Folder filtering:
  // Default (null) = everything NOT inside any folder (unsorted)
  // Specific folder = only that folder's items (wallpapers can be in multiple folders)
  const allWallpapersForView = useMemo(() => {
    if (!activeFolder) {
      return filtered.filter((w) => !allFolderItemIds.has(w.id))
    }
    const folder = folders.find((f) => f.id === activeFolder)
    if (!folder) return filtered
    const set = new Set(folder.items)
    return filtered.filter((w) => set.has(w.id))
  }, [filtered, activeFolder, folders, allFolderItemIds])

  const totalItems = allWallpapersForView.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)
  const wallpapers = useMemo(
    () => allWallpapersForView.slice((safePage - 1) * pageSize, safePage * pageSize),
    [allWallpapersForView, safePage, pageSize]
  )

  useEffect(() => { setPage(1) }, [filterState, activeFolder, search, sortBy, sortDir, pageSize])

  const wallpaperIds = useMemo(() => wallpapers.map((w) => w.id), [wallpapers])
  const {
    selectedIds,
    setSelectedIds,
    setLastClickedId,
    gridRef,
    handleCardSelect,
    handleMarqueeStart,
    handleMarqueeMove,
    handleMarqueeEnd,
    marqueeRect
  } = useSelectableGrid({
    ids: wallpaperIds,
    dataAttr: 'data-wallpaper-id',
    onOpenDetail: setDetailId
  })

  // Count for "All" sidebar button: unsorted items only
  const unsortedCount = useMemo(
    () => filtered.filter((w) => !allFolderItemIds.has(w.id)).length,
    [filtered, allFolderItemIds]
  )

  const { data: availableTags = [] } = useQuery({
    queryKey: ['library-tags'],
    queryFn: () => window.electronAPI.library.distinctTags()
  })

  const { data: lweStatus } = useQuery({
    queryKey: ['lwe-status'],
    queryFn: () => window.electronAPI.lwe.status()
  })

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => window.electronAPI.config.get()
  })
  const isBackupConfigured = config?.isBackupConfigured ?? false

  const { data: playbackState } = useQuery({
    queryKey: ['playlist-playback-state'],
    queryFn: () => window.electronAPI.playlist.getState()
  })
  const currentPlaylistId = playbackState?.playlistId ?? null

  useEffect(() => {
    return window.electronAPI.on.playlistStateChanged((state) => {
      queryClient.setQueryData(['playlist-playback-state'], state)
    })
  }, [queryClient])

  const { data: playlists } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => window.electronAPI.playlist.getAll()
  })
  const currentPlaylistItemIds = useMemo(() => {
    const playlist = playlists?.find((p) => p.id === currentPlaylistId)
    return new Set(playlist?.items.map((item) => item.wallpaperId) ?? [])
  }, [playlists, currentPlaylistId])

  const { showToast } = useToast()

  async function addToCurrentPlaylist(wallpaperIds: string[]) {
    if (!currentPlaylistId || wallpaperIds.length === 0) return
    await window.electronAPI.playlist.addItems(currentPlaylistId, wallpaperIds)
    queryClient.invalidateQueries({ queryKey: ['playlists'] })
    showToast('Added to current playlist')
  }

  const [backingUpSelection, setBackingUpSelection] = useState(false)
  const [backupScanning, setBackupScanning] = useState(false)
  const [backupStatus, setBackupStatus] = useState<string | null>(null)

  async function handleBackupSelection() {
    if (selectedIds.size === 0) return
    setBackingUpSelection(true)
    setBackupStatus(null)
    try {
      const result = await window.electronAPI.backup.selection(Array.from(selectedIds))
      setBackupStatus(
        `Backed up ${result.backedUp}${result.unsubscribed > 0 ? ` (${result.unsubscribed} unsubscribed)` : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}.`
      )
    } finally {
      setBackingUpSelection(false)
      queryClient.invalidateQueries({ queryKey: ['library'] })
    }
  }

  async function handleScanBackups() {
    setBackupScanning(true)
    setBackupStatus(null)
    try {
      const result = await window.electronAPI.backup.scan()
      setBackupStatus(`Backup scan: ${result.imported} imported, ${result.linked} linked.`)
    } finally {
      setBackupScanning(false)
      queryClient.invalidateQueries({ queryKey: ['library'] })
    }
  }

  const [checkingUnavailable, setCheckingUnavailable] = useState(false)
  const [backingUpUnavailable, setBackingUpUnavailable] = useState(false)

  async function handleCheckUnavailable() {
    setCheckingUnavailable(true)
    setBackupStatus(null)
    try {
      const result = await window.electronAPI.library.checkUnavailable()
      setBackupStatus(
        `Checked ${result.checked} workshop item(s): ${result.unavailable} no longer available on the workshop.`
      )
    } finally {
      setCheckingUnavailable(false)
      queryClient.invalidateQueries({ queryKey: ['library'] })
    }
  }

  async function handleBackupAllUnavailable() {
    if (unavailableNotBackedUp.length === 0) return
    setBackingUpUnavailable(true)
    setBackupStatus(null)
    try {
      const result = await window.electronAPI.backup.selection(
        unavailableNotBackedUp.map((w) => w.id)
      )
      setBackupStatus(
        `Backed up ${result.backedUp}${result.unsubscribed > 0 ? ` (${result.unsubscribed} unsubscribed)` : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}.`
      )
    } finally {
      setBackingUpUnavailable(false)
      queryClient.invalidateQueries({ queryKey: ['library'] })
    }
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
      setImportStatus(
        `Imported ${result.folders} folders and ${result.playlists} playlists.`
      )
    } catch (err) {
      setImportStatus(`Import failed: ${(err as Error).message}`)
    }
  }

  const [importStatus, setImportStatus] = useState<string | null>(null)

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

  const handleDrop = useCallback(
    async (folderId: string, wallpaperId: string) => {
      const ids = selectedIds.has(wallpaperId)
        ? Array.from(selectedIds)
        : [wallpaperId]
      await window.electronAPI.folders.addItems(folderId, ids)
      refetchFolders()
    },
    [refetchFolders, selectedIds]
  )

  useEffect(() => {
    setSelectedIds(new Set())
    setLastClickedId(null)
  }, [activeFolder])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === '+' && selectedIds.size > 0) {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        addToCurrentPlaylist(Array.from(selectedIds))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, currentPlaylistId])

  const openWallpaperCtxMenu = useCallback(
    (e: React.MouseEvent, wallpaperId: string) => {
      e.preventDefault()
      const ids = selectedIds.has(wallpaperId) ? Array.from(selectedIds) : [wallpaperId]
      // Also select the right-clicked item if not already selected
      if (!selectedIds.has(wallpaperId)) {
        setSelectedIds(new Set(ids))
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, ids, showFolderSub: false })
    },
    [selectedIds]
  )

  function closeCtxMenu() {
    setCtxMenu(null)
  }

  const ctxWallpapers = useMemo(() => {
    if (!ctxMenu) return []
    const idSet = new Set(ctxMenu.ids)
    return wallpapers.filter((w) => idSet.has(w.id))
  }, [ctxMenu, wallpapers])

  async function unsubscribeIds(ids: string[]) {
    await forEachIgnoringErrors(ids, (id) => window.electronAPI.steam.unsubscribe(id))
    queryClient.invalidateQueries({ queryKey: ['library'] })
    refetchFolders()
  }

  async function ctxUnsubscribe() {
    if (!ctxMenu) return
    const ids = ctxMenu.ids
    closeCtxMenu()
    await unsubscribeIds(ids)
  }

  async function handleApplyDetail(id: string) {
    try {
      await window.electronAPI.wallpaper.apply({ wallpaperId: id })
      queryClient.invalidateQueries({ queryKey: ['library'] })
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  async function ctxVote(up: boolean) {
    if (!ctxMenu) return
    await forEachIgnoringErrors(ctxMenu.ids, (id) => window.electronAPI.steam.vote(id, up))
    queryClient.invalidateQueries({ queryKey: ['steam-voted-ids'] })
    closeCtxMenu()
  }

  function ctxOpenInSteam() {
    if (!ctxMenu) return
    for (const id of ctxMenu.ids) openWorkshopPage(id)
    closeCtxMenu()
  }

  async function ctxBrowseCreator() {
    const wallpaper = ctxWallpapers[0]
    if (!wallpaper) return
    closeCtxMenu()
    let creatorSteamId = wallpaper.authorSteamId
    if (!creatorSteamId && isWorkshopId(wallpaper.id)) {
      try {
        const item = await window.electronAPI.workshop.getItem(wallpaper.id)
        creatorSteamId = item?.creatorSteamId
      } catch {
        creatorSteamId = undefined
      }
    }
    if (creatorSteamId) {
      onBrowseCreator?.(creatorSteamId)
    } else {
      showToast('Could not find creator info for this wallpaper')
    }
  }

  async function ctxBackup() {
    if (!ctxMenu) return
    closeCtxMenu()
    if (ctxMenu.ids.length === 1) {
      await window.electronAPI.backup.item(ctxMenu.ids[0])
    } else {
      await window.electronAPI.backup.selection(ctxMenu.ids)
    }
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function ctxOpenLocally() {
    if (!ctxMenu) return
    const paths = ctxWallpapers.filter((w) => w.localPath).map((w) => w.localPath!)
    closeCtxMenu()
    if (paths.length > 0) {
      await window.electronAPI.shell.openPaths(paths)
    }
  }

  async function ctxPreviewVideo() {
    if (!ctxMenu) return
    const w = ctxWallpapers[0]
    if (w?.localPath && w.file) {
      const videoPath = w.localPath + '/' + w.file
      await window.electronAPI.shell.openWithDefault(videoPath)
    }
    closeCtxMenu()
  }

  async function ctxMoveToFolder(folderId: string) {
    if (!ctxMenu) return
    await window.electronAPI.folders.addItems(folderId, ctxMenu.ids)
    refetchFolders()
    closeCtxMenu()
  }

  async function ctxRemoveFromFolder() {
    if (!ctxMenu) return
    // Each wallpaper lives in at most one folder, so pull it out of whichever one it's in
    for (const folder of folders) {
      const overlap = ctxMenu.ids.filter((id) => folder.items.includes(id))
      if (overlap.length > 0) {
        await window.electronAPI.folders.removeItems(folder.id, overlap)
      }
    }
    refetchFolders()
    closeCtxMenu()
  }

  const ctxHasVideo = ctxWallpapers.some((w) => w.type === 'video' && w.file)
  const ctxHasBackupable = ctxWallpapers.some((w) => w.source === 'workshop')
  const ctxCanBrowseCreator =
    ctxWallpapers.length === 1 &&
    ctxWallpapers[0]?.source !== 'local' &&
    (!!ctxWallpapers[0]?.authorSteamId || isWorkshopId(ctxWallpapers[0]?.id ?? ''))

  const ctxCurrentFolderIds = ctxMenu
    ? new Set(ctxMenu.ids.map((id) => folderOfItem.get(id)).filter((id): id is string => !!id))
    : new Set<string>()
  const ctxHasFolder = ctxCurrentFolderIds.size > 0
  // Only offer folders the selection isn't already fully inside as move targets
  const ctxMoveTargets = folders.filter(
    (f) => !(ctxCurrentFolderIds.size === 1 && ctxCurrentFolderIds.has(f.id))
  )

  const detailWallpaper = detailId ? wallpapers.find((w) => w.id === detailId) : undefined

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
            showFilters || activeCount > 0
              ? 'bg-indigo-600 text-white'
              : 'bg-white/5 text-gray-300 hover:bg-white/10'
          )}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 text-xs">{activeCount}</span>
          )}
        </button>
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search library..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-white/5 py-2 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={sortBy ?? 'updatedAt'}
          onChange={(e) => setSortBy(e.target.value as LibraryFilters['sortBy'])}
          className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 [&>option]:bg-[#1a1a1a] [&>option]:text-gray-200"
        >
          <option value="title">Name</option>
          <option value="updatedAt">Date Updated</option>
          <option value="createdAt">Date Added</option>
          <option value="fileSize">File Size</option>
          <option value="lastApplied">Last Applied</option>
          <option value="appliedCount">Most Applied</option>
        </select>
        <button
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          className="rounded-lg bg-white/5 px-2 py-2 text-sm text-gray-300 hover:bg-white/10"
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 [&>option]:bg-[#1a1a1a] [&>option]:text-gray-200"
        >
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
          <option value={200}>200 / page</option>
        </select>
        <PreviewSizeToggle value={previewSize} onChange={setPreviewSize} />
        <button
          onClick={handleScan}
          disabled={scanning}
          title="Scan workshop folder"
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Scan
        </button>
        <button
          onClick={handleScanBackups}
          disabled={backupScanning || !isBackupConfigured}
          title={isBackupConfigured ? 'Scan backup folder' : 'Configure a backup folder in Settings first'}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
        >
          {backupScanning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Archive size={14} />
          )}
          Scan backups
        </button>
        <button
          onClick={handleCheckUnavailable}
          disabled={checkingUnavailable}
          title="Check the workshop for wallpapers that have been removed"
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
        >
          {checkingUnavailable ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <WifiOff size={14} />
          )}
          Check unavailable
        </button>
      </div>

      {showFilters && (
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2">
        <div className="flex gap-0.5">
          {WE_TYPES.filter((t) =>
            ['Scene', 'Video', 'Web', 'Application'].includes(t.tag)
          ).map((item) => (
            <Chip
              key={item.tag}
              label={item.label}
              active={filterState.types.includes(item.tag)}
              onClick={() => updateFilter('types', item.tag)}
            />
          ))}
        </div>

        <div className="h-3 w-px bg-white/10" />

        <div className="flex gap-0.5">
          {WE_LIBRARY_AGE_RATINGS.map((item) => (
            <Chip
              key={item.tag}
              label={item.label}
              active={filterState.ageRatings.includes(item.tag)}
              onClick={() => updateFilter('ageRatings', item.tag)}
            />
          ))}
        </div>

        <div className="h-3 w-px bg-white/10" />

        <div className="flex gap-0.5">
          {Object.keys(SOURCE_MAP).map((label) => (
            <Chip
              key={label}
              label={label}
              active={filterState.sources.includes(label)}
              onClick={() => updateFilter('sources', label)}
            />
          ))}
        </div>

        <div className="h-3 w-px bg-white/10" />

        <button
          onClick={toggleFailedOnly}
          title="Show only wallpapers whose download failed (e.g. disk ran out of space)"
          className={clsx(
            'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            filterState.failedOnly
              ? 'bg-red-600 text-white'
              : failedCount > 0
                ? 'text-red-400 hover:bg-white/5'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          )}
        >
          <AlertTriangle size={12} />
          Failed
          {failedCount > 0 && (
            <span className="rounded-full bg-black/30 px-1.5">{failedCount}</span>
          )}
        </button>

        <button
          onClick={toggleLikedOnly}
          title="Show only wallpapers you've liked on Steam"
          className={clsx(
            'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            filterState.likedOnly
              ? 'bg-pink-600 text-white'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          )}
        >
          <Heart size={12} />
          Liked
        </button>

        <button
          onClick={toggleUnavailableOnly}
          title={
            unavailableNotBackedUp.length > 0
              ? `Show only wallpapers removed from the Steam Workshop (${unavailableNotBackedUp.length} of these have no backup yet)`
              : 'Show only wallpapers removed from the Steam Workshop'
          }
          className={clsx(
            'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            filterState.unavailableOnly
              ? 'bg-amber-600 text-white'
              : unavailableCount > 0
                ? 'text-amber-400 hover:bg-white/5'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          )}
        >
          <WifiOff size={12} />
          Unavailable
          {unavailableCount > 0 && (
            <span className="rounded-full bg-black/30 px-1.5">{unavailableCount}</span>
          )}
        </button>

        <div className="h-3 w-px bg-white/10" />

        <TagDropdown
          available={availableTags}
          selected={filterState.genres}
          onChange={(tags) => setFilterState((prev) => ({ ...prev, genres: tags }))}
        />

        {activeCount > 0 && (
          <button
            onClick={() => setFilterState(DEFAULT_STATE)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-300"
          >
            <X size={12} /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {unavailableNotBackedUp.length > 0 && (
            <button
              onClick={handleBackupAllUnavailable}
              disabled={backingUpUnavailable || !isBackupConfigured}
              title={
                isBackupConfigured
                  ? `Back up the ${unavailableNotBackedUp.length} removed-from-workshop wallpaper(s) that don't have a backup yet (${unavailableCount - unavailableNotBackedUp.length} already do)`
                  : 'Configure a backup folder in Settings first'
              }
              className="flex items-center gap-1.5 rounded-lg bg-amber-600/80 px-3 py-1.5 text-xs text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {backingUpUnavailable ? (
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
              disabled={backingUpSelection || !isBackupConfigured}
              title={isBackupConfigured ? 'Back up selected wallpapers' : 'Configure a backup folder in Settings first'}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 disabled:opacity-50"
            >
              {backingUpSelection ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Archive size={12} />
              )}
              Backup selection
            </button>
          )}

          <span className="text-xs text-gray-600">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected / ${wallpapers.length} wallpapers`
              : `${wallpapers.length} wallpapers`}
          </span>
        </div>
      </div>
      )}

      {scanResult && (
        <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-400">
          Scan complete: {scanResult.imported} imported{scanResult.removed > 0 ? `, ${scanResult.removed} removed` : ''}
        </div>
      )}

      {backupStatus && (
        <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-400">
          {backupStatus}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-48 flex-col border-r border-white/5 overflow-y-auto">
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

          <button
            onClick={() => setActiveFolder(null)}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 text-xs',
              activeFolder === null
                ? 'bg-white/5 text-white'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            )}
          >
            <Folder size={14} />
            <span className="flex-1 text-left truncate">Default</span>
            <span className="text-gray-600">{unsortedCount}</span>
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
              onContextMenu={(e) => {
                e.preventDefault()
                setFolderMenu({ folder, x: e.clientX, y: e.clientY })
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const wid = e.dataTransfer.getData('text/wallpaper-id')
                if (wid) handleDrop(folder.id, wid)
              }}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 text-xs',
                activeFolder === folder.id
                  ? 'bg-white/5 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              )}
            >
              {activeFolder === folder.id ? (
                <FolderOpen size={14} />
              ) : (
                <Folder size={14} />
              )}
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

        <div
          ref={gridRef}
          className="relative flex-1 overflow-y-auto p-4 select-none"
          onMouseDown={handleMarqueeStart}
          onMouseMove={handleMarqueeMove}
          onMouseUp={handleMarqueeEnd}
          onMouseLeave={handleMarqueeEnd}
        >
          {isLoading && (
            <div className="flex h-40 items-center justify-center text-gray-500">
              <Loader2 size={24} className="animate-spin" />
            </div>
          )}
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
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setFolderMenu({ folder, x: e.clientX, y: e.clientY })
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.add('ring-2', 'ring-indigo-500')
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('ring-2', 'ring-indigo-500')
                  }}
                  onDrop={(e) => {
                    e.currentTarget.classList.remove('ring-2', 'ring-indigo-500')
                    const wid = e.dataTransfer.getData('text/wallpaper-id')
                    if (wid) handleDrop(folder.id, wid)
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
                lweInstalled={lweStatus?.installed ?? false}
                isLiked={votedSet.has(wallpaper.id)}
                currentPlaylistId={currentPlaylistId}
                isInCurrentPlaylist={currentPlaylistItemIds.has(wallpaper.id)}
                previewSize={previewSize}
                onApplied={() =>
                  queryClient.invalidateQueries({ queryKey: ['library'] })
                }
                onAddedToPlaylist={() =>
                  queryClient.invalidateQueries({ queryKey: ['playlists'] })
                }
                onLiked={() => {
                  queryClient.setQueryData<string[]>(['steam-voted-ids'], (old) =>
                    old ? [...old, wallpaper.id] : [wallpaper.id]
                  )
                }}
                onUnsubscribed={() => {
                  queryClient.invalidateQueries({ queryKey: ['library'] })
                  refetchFolders()
                }}
                onRedownloaded={() =>
                  queryClient.invalidateQueries({ queryKey: ['library'] })
                }
                onSelect={(e) => handleCardSelect(wallpaper.id, e)}
                onContextMenu={(e) => openWallpaperCtxMenu(e, wallpaper.id)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-xs text-gray-500">
                Page {safePage} of {totalPages} ({totalItems} items)
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}

          {marqueeRect && marqueeRect.width > 3 && marqueeRect.height > 3 && (
            <div
              className="pointer-events-none absolute z-20 border border-indigo-500 bg-indigo-500/15"
              style={{
                left: marqueeRect.left,
                top: marqueeRect.top,
                width: marqueeRect.width,
                height: marqueeRect.height
              }}
            />
          )}
        </div>

        {detailId && detailWallpaper && (
          <DetailSidebar
            id={detailId}
            fallbackTitle={detailWallpaper.title}
            fallbackPreviewUrl={getPreviewSrc(detailWallpaper)}
            fallbackTags={detailWallpaper.tags}
            fallbackAuthorSteamId={detailWallpaper.authorSteamId}
            localFileSize={detailWallpaper.fileSize}
            isSubscribed={detailWallpaper.subscribed}
            isLiked={votedSet.has(detailId)}
            canPlay={
              !!detailWallpaper.localPath &&
              !detailWallpaper.downloading &&
              !detailWallpaper.downloadFailed
            }
            lweInstalled={lweStatus?.installed ?? false}
            onClose={() => setDetailId(null)}
            onSubscribe={async () => {
              await window.electronAPI.steam.subscribe(detailId)
              queryClient.invalidateQueries({ queryKey: ['library'] })
            }}
            onUnsubscribe={() => unsubscribeIds([detailId])}
            onLiked={() => {
              queryClient.setQueryData<string[]>(['steam-voted-ids'], (old) =>
                old ? [...old, detailId] : [detailId]
              )
            }}
            onPlay={() => handleApplyDetail(detailId)}
            onBrowseCreator={onBrowseCreator}
          />
        )}
      </div>

      {folderMenu && (
        <FolderMenu
          x={folderMenu.x}
          y={folderMenu.y}
          onClose={() => setFolderMenu(null)}
          onRename={() => {
            setRenamingId(folderMenu.folder.id)
            setRenameValue(folderMenu.folder.title)
            setFolderMenu(null)
          }}
          onDelete={() => handleDeleteFolder(folderMenu.folder.id)}
        />
      )}

      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-50 min-w-[200px] rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl text-sm"
          style={{ left: ctxPos?.x ?? ctxMenu.x, top: ctxPos?.y ?? ctxMenu.y }}
        >
          {ctxMenu.ids.length > 1 && (
            <div className="px-3 py-1 text-xs text-gray-600 border-b border-white/5 mb-1">
              {ctxMenu.ids.length} items selected
            </div>
          )}

          {ctxHasBackupable && isBackupConfigured && (
            <button
              onClick={ctxBackup}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
            >
              <Archive size={12} /> Backup
            </button>
          )}

          <button
            onClick={ctxUnsubscribe}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-white/5"
          >
            Unsubscribe
          </button>

          <div className="my-1 border-t border-white/5" />

          <button
            onClick={() => ctxVote(true)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
          >
            <ThumbsUp size={12} /> Like
          </button>
          <button
            onClick={() => ctxVote(false)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
          >
            <ThumbsDown size={12} /> Dislike
          </button>

          <div className="my-1 border-t border-white/5" />

          <button
            onClick={ctxOpenInSteam}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
          >
            <ExternalLink size={12} /> Open in Steam Workshop
          </button>
          <button
            onClick={ctxOpenLocally}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
          >
            <FolderOpen size={12} /> Open wallpaper locally
          </button>

          {ctxHasVideo && (
            <button
              onClick={ctxPreviewVideo}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
            >
              <Eye size={12} /> Preview in media player
            </button>
          )}

          {ctxCanBrowseCreator && (
            <button
              onClick={ctxBrowseCreator}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
            >
              <User size={12} /> Browse wallpapers from this creator
            </button>
          )}

          <div className="my-1 border-t border-white/5" />

          <div className="relative">
            <button
              onClick={() => setCtxMenu((prev) => prev ? { ...prev, showFolderSub: !prev.showFolderSub } : null)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
            >
              <FolderInput size={12} /> Move to folder
              <ChevronRight size={12} className="ml-auto" />
            </button>
            {ctxMenu.showFolderSub && (
              <div
                ref={folderSubRef}
                className={clsx(
                  'absolute top-0 min-w-[160px] rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl',
                  folderSubSide === 'left' ? 'right-full mr-1' : 'left-full ml-1'
                )}
              >
                {ctxMoveTargets.length === 0 && (
                  <div className="px-3 py-1.5 text-gray-500">No other folders</div>
                )}
                {ctxMoveTargets.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => ctxMoveToFolder(f.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
                  >
                    <Folder size={12} /> {f.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {ctxHasFolder && (
            <button
              onClick={ctxRemoveFromFolder}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-white/5"
            >
              <Trash2 size={12} /> Remove from folder
            </button>
          )}
        </div>
      )}
    </div>
  )
}
