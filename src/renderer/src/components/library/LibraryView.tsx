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
  ThumbsDown
} from 'lucide-react'
import WallpaperCard from './WallpaperCard'
import type { LibraryFilters, WallpaperFolder } from '@shared/types'
import clsx from 'clsx'
import { WE_TYPES, WE_AGE_RATINGS } from '../../constants/weFilters'

const STORAGE_KEY = 'we-library-filters'

interface LibraryFilterState {
  types: string[]
  ageRatings: string[]
  genres: string[]
}

const DEFAULT_STATE: LibraryFilterState = { types: [], ageRatings: [], genres: [] }

const TYPE_MAP: Record<string, string> = {
  Scene: 'scene',
  Video: 'video',
  Web: 'web',
  Application: 'application'
}
const RATING_MAP: Record<string, string> = {
  Everyone: 'everyone',
  Questionable: 'questionable',
  Mature: 'mature'
}

function loadFilters(): LibraryFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
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

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

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
              placeholder="Search tags…"
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

// ── Folder context menu ──
function FolderMenu({
  x,
  y,
  onClose,
  onRename,
  onDelete
}: {
  folder: WallpaperFolder
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[140px] rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl text-sm"
        style={{ left: x, top: y }}
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
    </>
  )
}

interface Marquee {
  startX: number
  startY: number
  endX: number
  endY: number
}

export default function LibraryView() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<LibraryFilters['sortBy']>('updatedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterState, setFilterState] = useState<LibraryFilterState>(loadFilters)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{
    imported: number
    skipped: number
  } | null>(null)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Folder state
  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null = "All"
  const [folderMenu, setFolderMenu] = useState<{
    folder: WallpaperFolder
    x: number
    y: number
  } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const marqueeActive = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // Wallpaper context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    ids: string[]
    showFolderSub: boolean
  } | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filterState))
  }, [filterState])

  function updateFilter<K extends keyof LibraryFilterState>(key: K, tag: string) {
    setFilterState((prev) => ({ ...prev, [key]: toggle(prev[key], tag) }))
  }

  const activeCount =
    filterState.types.length + filterState.ageRatings.length + filterState.genres.length

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
        if (!ratings.includes(w.contentRating ?? 'everyone')) return false
      }
      if (filterState.genres.length > 0) {
        if (!filterState.genres.some((g) => w.tags.includes(g))) return false
      }
      return true
    })
  }, [allWallpapers, filterState])

  // Set of all IDs that belong to at least one folder
  const allFolderItemIds = useMemo(() => {
    const set = new Set<string>()
    for (const f of folders) {
      for (const id of f.items) set.add(id)
    }
    return set
  }, [folders])

  // Folder filtering:
  // "All" = everything NOT inside any folder (unsorted)
  // Specific folder = only that folder's items
  const allWallpapersForView = useMemo(() => {
    if (!activeFolder) {
      return filtered.filter((w) => !allFolderItemIds.has(w.id))
    }
    const folder = folders.find((f) => f.id === activeFolder)
    if (!folder) return filtered
    const set = new Set(folder.items)
    return filtered.filter((w) => set.has(w.id))
  }, [filtered, activeFolder, folders, allFolderItemIds])

  // Pagination
  const totalItems = allWallpapersForView.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)
  const wallpapers = useMemo(
    () => allWallpapersForView.slice((safePage - 1) * pageSize, safePage * pageSize),
    [allWallpapersForView, safePage, pageSize]
  )

  // Reset page when filters/folder/search/sort change
  useEffect(() => { setPage(1) }, [filterState, activeFolder, search, sortBy, sortDir, pageSize])

  // Count for "All" sidebar button: unsorted items only
  const unsortedCount = useMemo(
    () => filtered.filter((w) => !allFolderItemIds.has(w.id)).length,
    [filtered, allFolderItemIds]
  )

  const { data: availableTags = [] } = useQuery({
    queryKey: ['library-tags'],
    queryFn: () => window.electronAPI.library.distinctTags()
  })

  async function handleScan() {
    setScanning(true)
    setScanResult(null)
    const result = await window.electronAPI.library.scan()
    setScanResult(result)
    setScanning(false)
    queryClient.invalidateQueries({ queryKey: ['library'] })
    queryClient.invalidateQueries({ queryKey: ['library-tags'] })
  }

  // Create folder — inline input instead of prompt()
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

  // Drop handler: add wallpaper(s) to folder via drag
  const handleDrop = useCallback(
    async (folderId: string, wallpaperId: string) => {
      // If the dragged item is in the selection, add all selected items
      const ids = selectedIds.has(wallpaperId)
        ? Array.from(selectedIds)
        : [wallpaperId]
      await window.electronAPI.folders.addItems(folderId, ids)
      refetchFolders()
    },
    [refetchFolders, selectedIds]
  )

  // Card click handler: normal = select single, ctrl = toggle, shift = range
  const handleCardSelect = useCallback(
    (wallpaperId: string, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+click: toggle individual
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(wallpaperId)) next.delete(wallpaperId)
          else next.add(wallpaperId)
          return next
        })
        setLastClickedId(wallpaperId)
      } else if (e.shiftKey && lastClickedId) {
        // Shift+click: range select
        const ids = wallpapers.map((w) => w.id)
        const from = ids.indexOf(lastClickedId)
        const to = ids.indexOf(wallpaperId)
        if (from !== -1 && to !== -1) {
          const start = Math.min(from, to)
          const end = Math.max(from, to)
          const rangeIds = ids.slice(start, end + 1)
          setSelectedIds((prev) => {
            const next = new Set(prev)
            for (const id of rangeIds) next.add(id)
            return next
          })
        }
      } else {
        // Normal click: select single
        setSelectedIds(new Set([wallpaperId]))
        setLastClickedId(wallpaperId)
      }
    },
    [lastClickedId, wallpapers]
  )

  // Marquee selection handlers
  const handleMarqueeStart = useCallback(
    (e: React.MouseEvent) => {
      // Only start marquee when clicking on the grid background, not on a card
      if ((e.target as HTMLElement).closest('[data-wallpaper-id]')) return
      if (e.button !== 0) return

      const container = gridRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left + container.scrollLeft
      const y = e.clientY - rect.top + container.scrollTop

      marqueeActive.current = true
      setMarquee({ startX: x, startY: y, endX: x, endY: y })

      // Clear selection unless ctrl is held
      if (!e.ctrlKey && !e.metaKey) {
        setSelectedIds(new Set())
      }
    },
    []
  )

  const handleMarqueeMove = useCallback(
    (e: React.MouseEvent) => {
      if (!marqueeActive.current || !marquee) return

      const container = gridRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left + container.scrollLeft
      const y = e.clientY - rect.top + container.scrollTop

      setMarquee((prev) => prev ? { ...prev, endX: x, endY: y } : null)
    },
    [marquee]
  )

  const handleMarqueeEnd = useCallback(() => {
    if (!marqueeActive.current || !marquee) return
    marqueeActive.current = false

    const container = gridRef.current
    if (!container) return

    // Calculate marquee rectangle in container-relative coordinates
    const mx1 = Math.min(marquee.startX, marquee.endX)
    const my1 = Math.min(marquee.startY, marquee.endY)
    const mx2 = Math.max(marquee.startX, marquee.endX)
    const my2 = Math.max(marquee.startY, marquee.endY)

    // Skip if marquee is too small (just a click)
    if (Math.abs(mx2 - mx1) < 5 && Math.abs(my2 - my1) < 5) {
      setMarquee(null)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const cards = container.querySelectorAll('[data-wallpaper-id]')
    const hits = new Set<string>()

    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect()
      // Convert card rect to container-relative coordinates
      const cx1 = cardRect.left - containerRect.left + container.scrollLeft
      const cy1 = cardRect.top - containerRect.top + container.scrollTop
      const cx2 = cx1 + cardRect.width
      const cy2 = cy1 + cardRect.height

      // Check intersection
      if (cx1 < mx2 && cx2 > mx1 && cy1 < my2 && cy2 > my1) {
        const id = card.getAttribute('data-wallpaper-id')
        if (id) hits.add(id)
      }
    })

    setSelectedIds((prev) => {
      // If ctrl was held during start, merge with existing
      const next = new Set(prev)
      hits.forEach((id) => next.add(id))
      return next
    })

    setMarquee(null)
  }, [marquee])

  // Clear selection when folder changes
  useEffect(() => {
    setSelectedIds(new Set())
    setLastClickedId(null)
  }, [activeFolder])

  // Keyboard: Escape clears selection, Ctrl+A selects all
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        // Only if library grid is focused (not a text input)
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        e.preventDefault()
        setSelectedIds(new Set(wallpapers.map((w) => w.id)))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [wallpapers])

  // Compute marquee rect for rendering (in container-relative px)
  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.startX, marquee.endX),
        top: Math.min(marquee.startY, marquee.endY),
        width: Math.abs(marquee.endX - marquee.startX),
        height: Math.abs(marquee.endY - marquee.startY)
      }
    : null

  // ── Wallpaper context menu handlers ──
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

  // Get WallpaperMeta objects for context menu items
  const ctxWallpapers = useMemo(() => {
    if (!ctxMenu) return []
    const idSet = new Set(ctxMenu.ids)
    return wallpapers.filter((w) => idSet.has(w.id))
  }, [ctxMenu, wallpapers])

  async function ctxSubscribe() {
    if (!ctxMenu) return
    for (const id of ctxMenu.ids) {
      try { await window.electronAPI.steam.subscribe(id) } catch {}
    }
    closeCtxMenu()
  }

  async function ctxUnsubscribe() {
    if (!ctxMenu) return
    for (const id of ctxMenu.ids) {
      try { await window.electronAPI.steam.unsubscribe(id) } catch {}
    }
    closeCtxMenu()
  }

  async function ctxVote(up: boolean) {
    if (!ctxMenu) return
    for (const id of ctxMenu.ids) {
      try { await window.electronAPI.steam.vote(id, up) } catch {}
    }
    closeCtxMenu()
  }

  function ctxOpenInSteam() {
    if (!ctxMenu) return
    for (const id of ctxMenu.ids) {
      window.open(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`)
    }
    closeCtxMenu()
  }

  async function ctxOpenLocally() {
    if (!ctxMenu) return
    // Open the first item's local folder in the file manager
    const w = ctxWallpapers[0]
    if (w?.localPath) {
      await window.electronAPI.shell.openInFileManager(w.localPath)
    }
    closeCtxMenu()
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
    if (!ctxMenu || !activeFolder) return
    await window.electronAPI.folders.removeItems(activeFolder, ctxMenu.ids)
    refetchFolders()
    closeCtxMenu()
  }

  // Check if any of the context menu items are video type
  const ctxHasVideo = ctxWallpapers.some((w) => w.type === 'video' && w.file)

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search library…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-white/5 py-2 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={sortBy ?? 'updatedAt'}
          onChange={(e) => setSortBy(e.target.value as LibraryFilters['sortBy'])}
          className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
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
          className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
          <option value={200}>200 / page</option>
        </select>
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
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2">
        <SlidersHorizontal size={12} className="text-gray-600" />

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
          {WE_AGE_RATINGS.map((item) => (
            <Chip
              key={item.tag}
              label={item.label}
              active={filterState.ageRatings.includes(item.tag)}
              onClick={() => updateFilter('ageRatings', item.tag)}
            />
          ))}
        </div>

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

        <span className="ml-auto text-xs text-gray-600">
          {selectedIds.size > 0
            ? `${selectedIds.size} selected / ${wallpapers.length} wallpapers`
            : `${wallpapers.length} wallpapers`}
        </span>
      </div>

      {scanResult && (
        <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-400">
          Scan complete — {scanResult.imported} wallpapers imported
        </div>
      )}

      {/* Main content: folder sidebar + grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Folder sidebar */}
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

          {/* All */}
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
            <span className="flex-1 text-left truncate">All</span>
            <span className="text-gray-600">{unsortedCount}</span>
          </button>

          {/* Inline new folder input */}
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
                placeholder="Folder name…"
                className="flex-1 bg-transparent text-xs text-gray-200 outline-none placeholder-gray-600"
              />
            </div>
          )}

          {/* Folder list */}
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
              <span className="text-gray-600">{folder.items.length}</span>
            </button>
          ))}
        </div>

        {/* Card grid */}
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
                  ? 'This folder is empty — drag wallpapers here'
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
          {/* Folder cards in "All" view */}
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
                      {folder.items.length} items
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {wallpapers.map((wallpaper) => (
              <WallpaperCard
                key={wallpaper.id}
                wallpaper={wallpaper}
                selected={selectedIds.has(wallpaper.id)}
                onApplied={() =>
                  queryClient.invalidateQueries({ queryKey: ['library'] })
                }
                onSelect={(e) => handleCardSelect(wallpaper.id, e)}
                onContextMenu={(e) => openWallpaperCtxMenu(e, wallpaper.id)}
              />
            ))}
          </div>

          {/* Pagination */}
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

          {/* Marquee selection rectangle */}
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
      </div>

      {/* Folder context menu */}
      {folderMenu && (
        <FolderMenu
          folder={folderMenu.folder}
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

      {/* Wallpaper context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCtxMenu} />
          <div
            className="fixed z-50 min-w-[200px] rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl text-sm"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            {ctxMenu.ids.length > 1 && (
              <div className="px-3 py-1 text-xs text-gray-600 border-b border-white/5 mb-1">
                {ctxMenu.ids.length} items selected
              </div>
            )}

            {/* Steam actions */}
            <button
              onClick={ctxSubscribe}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
            >
              Subscribe
            </button>
            <button
              onClick={ctxUnsubscribe}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
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

            {/* File operations */}
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

            {/* Preview video - only for video type wallpapers */}
            {ctxHasVideo && (
              <button
                onClick={ctxPreviewVideo}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
              >
                <Eye size={12} /> Preview in media player
              </button>
            )}

            <div className="my-1 border-t border-white/5" />

            {/* Move to folder - with submenu */}
            <div className="relative">
              <button
                onClick={() => setCtxMenu((prev) => prev ? { ...prev, showFolderSub: !prev.showFolderSub } : null)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
              >
                <FolderInput size={12} /> Move to folder
                <ChevronRight size={12} className="ml-auto" />
              </button>
              {ctxMenu.showFolderSub && (
                <div className="absolute left-full top-0 ml-1 min-w-[160px] rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl">
                  {folders.length === 0 && (
                    <p className="px-3 py-1.5 text-xs text-gray-500">No folders yet</p>
                  )}
                  {folders.map((f) => (
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

            {/* Remove from folder - only when inside a folder */}
            {activeFolder && (
              <button
                onClick={ctxRemoveFromFolder}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-white/5"
              >
                <Trash2 size={12} /> Remove from folder
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
