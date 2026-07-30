import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Loader2,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronRight,
  User,
  ExternalLink,
  Play,
  Download
} from 'lucide-react'
import WorkshopCard from './WorkshopCard'
import PreviewSizeToggle from '../common/PreviewSizeToggle'
import DetailSidebar from '../common/DetailSidebar'
import { useToast } from '../common/Toast'
import type { WorkshopQueryType } from '@shared/types'
import clsx from 'clsx'
import {
  WE_SHOW_ONLY,
  WE_TYPES,
  WE_ASSET_TYPES,
  WE_AGE_RATINGS,
  WE_RESOLUTION_GROUPS,
  WE_GENRES
} from '../../constants/weFilters'
import { usePreviewSize, previewGridStyle } from '../../hooks/usePreviewSize'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useClampedPosition } from '../../hooks/useContextMenuPosition'
import { useSubscriptionQueue } from '../../hooks/useSubscriptionQueue'
import { toggle } from '../../utils/array'
import { forEachIgnoringErrors } from '../../utils/async'
import { openWorkshopPage, openProfilePage } from '../../utils/steam'

const STORAGE_KEY = 'we-workshop-filters'
const STORAGE_VERSION = 2

interface WorkshopFilterState {
  filterMode: 'and' | 'or'
  showOnly: string[]
  types: string[]
  assetTypes: string[]
  ageRatings: string[]
  resolutions: string[]
  genres: string[]
}

const ALL_RESOLUTIONS = WE_RESOLUTION_GROUPS.flatMap((g) => g.items.map((i) => i.tag))
const ALL_AGE_RATINGS = WE_AGE_RATINGS.map((i) => i.tag)
const ALL_GENRES = WE_GENRES.map((i) => i.tag)
const ALL_TYPES = WE_TYPES.map((i) => i.tag)
const ALL_ASSET_TYPES = WE_ASSET_TYPES.map((i) => i.tag)

const DEFAULT_STATE: WorkshopFilterState = {
  filterMode: 'or',
  showOnly: [],
  types: ['Scene', 'Video', 'Web'],
  assetTypes: [],
  ageRatings: ALL_AGE_RATINGS,
  resolutions: ALL_RESOLUTIONS,
  genres: ALL_GENRES
}

function loadFilters(): WorkshopFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    if (parsed._v !== STORAGE_VERSION) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return DEFAULT_STATE
  }
}

function saveFilters(state: WorkshopFilterState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, _v: STORAGE_VERSION }))
}

function CheckItem({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-gray-400 hover:text-gray-200">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-indigo-500 cursor-pointer" />
      {label}
    </label>
  )
}

function FilterSection({
  title,
  children,
  defaultOpen = true,
  activeCount = 0,
  onAll,
  onNone
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  activeCount?: number
  onAll?: () => void
  onNone?: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1 text-left">{title}</span>
        {activeCount > 0 && (
          <span className="rounded-full bg-indigo-600/40 px-1.5 text-indigo-300">{activeCount}</span>
        )}
      </button>
      {open && (
        <div className="mt-1 pl-1 space-y-0.5">
          {(onAll || onNone) && (
            <div className="flex gap-2 pb-0.5">
              {onAll && (
                <button onClick={onAll} className="text-[10px] text-gray-600 hover:text-gray-400">all</button>
              )}
              {onNone && (
                <button onClick={onNone} className="text-[10px] text-gray-600 hover:text-gray-400">none</button>
              )}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

interface CtxMenu {
  x: number
  y: number
  ids: string[]
}

interface Marquee {
  startX: number
  startY: number
  endX: number
  endY: number
}

interface WorkshopBrowserProps {
  creatorFilter?: string | null
  onClearCreatorFilter?: () => void
  onBrowseCreator?: (creatorSteamId: string) => void
}

export default function WorkshopBrowser({
  creatorFilter = null,
  onClearCreatorFilter,
  onBrowseCreator
}: WorkshopBrowserProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { entries: subscribeEntries, enqueue: enqueueSubscribe, clear: clearSubscribeEntries } =
    useSubscriptionQueue(() => queryClient.invalidateQueries({ queryKey: ['library'] }))
  const [searchText, setSearchText] = useState('')
  const [queryType, setQueryType] = useState<WorkshopQueryType>('RankedByPublicationDate')
  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState<WorkshopFilterState>(loadFilters)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const marqueeActive = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [previewSize, setPreviewSize] = usePreviewSize()
  const [detailId, setDetailId] = useState<string | null>(null)

  useClickOutside(ctxRef, () => setCtxMenu(null), !!ctxMenu)
  const ctxPos = useClampedPosition(ctxRef, ctxMenu)

  useEffect(() => {
    saveFilters(filters)
  }, [filters])

  useEffect(() => {
    setPage(1)
  }, [searchText, queryType, filters, pageSize, creatorFilter])

  function update<K extends keyof WorkshopFilterState>(key: K, tag: string) {
    setFilters((prev) => ({ ...prev, [key]: toggle(prev[key] as string[], tag) }))
  }

  // Having every option of a category selected means no filter for that category
  const effectiveTypes = filters.types.length === ALL_TYPES.length ? [] : filters.types
  const effectiveAssetTypes = filters.assetTypes.length === ALL_ASSET_TYPES.length ? [] : filters.assetTypes
  const effectiveAgeRatings = filters.ageRatings.length === ALL_AGE_RATINGS.length ? [] : filters.ageRatings
  const effectiveResolutions = filters.resolutions.length === ALL_RESOLUTIONS.length ? [] : filters.resolutions
  const effectiveGenres = filters.genres.length === ALL_GENRES.length ? [] : filters.genres

  // AND mode: all selected tags passed to Steam as requiredTags (every tag must match)
  // OR mode: single-selected categories pass to Steam; multi-selected use client-side OR
  // showOnly and assetTypes are always AND regardless of mode
  const allSelected = [
    ...filters.showOnly,
    ...effectiveAssetTypes,
    ...effectiveTypes,
    ...effectiveAgeRatings,
    ...effectiveResolutions,
    ...effectiveGenres
  ]

  const steamTags: string[] =
    filters.filterMode === 'and'
      ? allSelected
      : [
          ...filters.showOnly,
          ...effectiveAssetTypes,
          ...(effectiveTypes.length === 1 ? effectiveTypes : []),
          ...(effectiveAgeRatings.length === 1 ? effectiveAgeRatings : []),
          ...(effectiveResolutions.length === 1 ? effectiveResolutions : []),
          ...(effectiveGenres.length === 1 ? effectiveGenres : [])
        ]

  const activeCount =
    filters.showOnly.length +
    effectiveTypes.length +
    effectiveAssetTypes.length +
    effectiveAgeRatings.length +
    effectiveResolutions.length +
    effectiveGenres.length

  function clearAll() {
    setFilters((prev) => ({ ...DEFAULT_STATE, filterMode: prev.filterMode }))
  }

  const openCtxMenu = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      e.preventDefault()
      const ids = selection.has(itemId) ? [...selection] : [itemId]
      if (!selection.has(itemId)) {
        setSelection(new Set(ids))
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, ids })
    },
    [selection]
  )

  function closeCtxMenu() {
    setCtxMenu(null)
  }

  function ctxSubscribe() {
    if (!ctxMenu) return
    enqueueSubscribe(ctxMenu.ids)
    closeCtxMenu()
  }

  async function unsubscribeIds(ids: string[]) {
    clearSubscribeEntries(ids)
    await forEachIgnoringErrors(ids, (id) => window.electronAPI.steam.unsubscribe(id))
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function ctxUnsubscribe() {
    if (!ctxMenu) return
    const ids = ctxMenu.ids
    closeCtxMenu()
    await unsubscribeIds(ids)
  }

  async function ctxVote(up: boolean) {
    if (!ctxMenu) return
    await forEachIgnoringErrors(ctxMenu.ids, (id) => window.electronAPI.steam.vote(id, up))
    if (up) queryClient.invalidateQueries({ queryKey: ['steam-voted-ids'] })
    closeCtxMenu()
  }

  function ctxOpenInSteam() {
    if (!ctxMenu) return
    for (const id of ctxMenu.ids) openWorkshopPage(id)
    closeCtxMenu()
  }

  function ctxPlay() {
    if (!ctxMenu || ctxMenu.ids.length !== 1) return
    handlePlay(ctxMenu.ids[0])
    closeCtxMenu()
  }

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useInfiniteQuery({
      queryKey: ['workshop', creatorFilter, searchText, queryType, steamTags],
      queryFn: ({ pageParam = 1 }) =>
        creatorFilter
          ? window.electronAPI.workshop.queryByCreator(creatorFilter, {
              searchText: searchText || undefined,
              queryType,
              tags: steamTags.length > 0 ? steamTags : undefined,
              page: pageParam as number
            })
          : window.electronAPI.workshop.query({
              searchText: searchText || undefined,
              queryType,
              tags: steamTags.length > 0 ? steamTags : undefined,
              page: pageParam as number
            }),
      getNextPageParam: (lastPage, allPages) => {
        const fetched = allPages.length * 50
        return fetched < lastPage.totalResults ? allPages.length + 1 : undefined
      },
      initialPageParam: 1
    })

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  )

  const { data: votedIds } = useQuery({
    queryKey: ['steam-voted-ids'],
    queryFn: () => window.electronAPI.steam.getVotedIds(),
    staleTime: Infinity
  })
  const votedSet = useMemo(() => new Set(votedIds ?? []), [votedIds])

  const { data: libraryWallpapers = [] } = useQuery({
    queryKey: ['library'],
    queryFn: () => window.electronAPI.library.getAll()
  })
  const playableSet = useMemo(
    () =>
      new Set(
        libraryWallpapers
          .filter((w) => w.localPath && !w.downloading && !w.downloadFailed)
          .map((w) => w.id)
      ),
    [libraryWallpapers]
  )

  const { data: lweStatus } = useQuery({
    queryKey: ['lwe-status'],
    queryFn: () => window.electronAPI.lwe.status()
  })

  async function handlePlay(id: string) {
    try {
      await window.electronAPI.wallpaper.apply({ wallpaperId: id })
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  function ctxBrowseCreator() {
    if (!ctxMenu || ctxMenu.ids.length !== 1) return
    const item = allItems.find((i) => i.publishedFileId === ctxMenu.ids[0])
    if (!item) return
    onBrowseCreator?.(item.creatorSteamId)
    closeCtxMenu()
  }

  // In OR mode: client-side OR filtering for multi-selected categories
  const items = useMemo(() => {
    if (filters.filterMode !== 'or') return allItems
    return allItems.filter((item) => {
      if (effectiveTypes.length > 1 && !effectiveTypes.some((t) => item.tags.includes(t)))
        return false
      if (effectiveAgeRatings.length > 1 && !effectiveAgeRatings.some((t) => item.tags.includes(t)))
        return false
      if (effectiveResolutions.length > 1 && !effectiveResolutions.some((t) => item.tags.includes(t)))
        return false
      if (effectiveGenres.length > 1 && !effectiveGenres.some((t) => item.tags.includes(t)))
        return false
      return true
    })
  }, [allItems, filters.filterMode, effectiveTypes, effectiveAgeRatings, effectiveResolutions, effectiveGenres])

  const totalFiltered = items.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  )

  // Auto-fetch more Steam API pages if needed to fill the current view
  const totalResults = data?.pages[0]?.totalResults ?? 0
  const needMore = safePage * pageSize > allItems.length && allItems.length < totalResults
  useEffect(() => {
    if (needMore && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [needMore, hasNextPage, isFetchingNextPage, fetchNextPage])

  const assetSelected = filters.types.includes('Asset') || effectiveTypes.length === 0

  // Card click handler: normal = select single, ctrl = toggle, shift = range
  const handleCardSelect = useCallback(
    (itemId: string, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setSelection((prev) => {
          const next = new Set(prev)
          if (next.has(itemId)) next.delete(itemId)
          else next.add(itemId)
          return next
        })
        setLastClickedId(itemId)
      } else if (e.shiftKey && lastClickedId) {
        const ids = paginatedItems.map((i) => i.publishedFileId)
        const from = ids.indexOf(lastClickedId)
        const to = ids.indexOf(itemId)
        if (from !== -1 && to !== -1) {
          const start = Math.min(from, to)
          const end = Math.max(from, to)
          const rangeIds = ids.slice(start, end + 1)
          setSelection((prev) => {
            const next = new Set(prev)
            for (const id of rangeIds) next.add(id)
            return next
          })
        }
      } else {
        setSelection(new Set([itemId]))
        setLastClickedId(itemId)
      }
    },
    [lastClickedId, paginatedItems]
  )

  const handleMarqueeStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-workshop-id]')) return
    if (e.button !== 0) return

    const container = gridRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left + container.scrollLeft
    const y = e.clientY - rect.top + container.scrollTop

    marqueeActive.current = true
    setMarquee({ startX: x, startY: y, endX: x, endY: y })

    if (!e.ctrlKey && !e.metaKey) {
      setSelection(new Set())
    }
  }, [])

  const handleMarqueeMove = useCallback(
    (e: React.MouseEvent) => {
      if (!marqueeActive.current || !marquee) return

      const container = gridRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left + container.scrollLeft
      const y = e.clientY - rect.top + container.scrollTop

      setMarquee((prev) => (prev ? { ...prev, endX: x, endY: y } : null))
    },
    [marquee]
  )

  const handleMarqueeEnd = useCallback(() => {
    if (!marqueeActive.current || !marquee) return
    marqueeActive.current = false

    const container = gridRef.current
    if (!container) return

    const mx1 = Math.min(marquee.startX, marquee.endX)
    const my1 = Math.min(marquee.startY, marquee.endY)
    const mx2 = Math.max(marquee.startX, marquee.endX)
    const my2 = Math.max(marquee.startY, marquee.endY)

    if (Math.abs(mx2 - mx1) < 5 && Math.abs(my2 - my1) < 5) {
      setMarquee(null)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const cards = container.querySelectorAll('[data-workshop-id]')
    const hits = new Set<string>()

    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect()
      const cx1 = cardRect.left - containerRect.left + container.scrollLeft
      const cy1 = cardRect.top - containerRect.top + container.scrollTop
      const cx2 = cx1 + cardRect.width
      const cy2 = cy1 + cardRect.height

      if (cx1 < mx2 && cx2 > mx1 && cy1 < my2 && cy2 > my1) {
        const id = card.getAttribute('data-workshop-id')
        if (id) hits.add(id)
      }
    })

    setSelection((prev) => {
      const next = new Set(prev)
      hits.forEach((id) => next.add(id))
      return next
    })

    setMarquee(null)
  }, [marquee])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelection(new Set())
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        e.preventDefault()
        setSelection(new Set(paginatedItems.map((i) => i.publishedFileId)))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paginatedItems])

  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.startX, marquee.endX),
        top: Math.min(marquee.startY, marquee.endY),
        width: Math.abs(marquee.endX - marquee.startX),
        height: Math.abs(marquee.endY - marquee.startY)
      }
    : null

  const detailItem = detailId ? allItems.find((i) => i.publishedFileId === detailId) : undefined
  const detailSubscribeState = detailId ? subscribeEntries.get(detailId)?.state : undefined
  const detailSubscribed = detailItem
    ? detailItem.isSubscribed ||
      detailSubscribeState === 'download-queued' ||
      detailSubscribeState === 'downloading' ||
      detailSubscribeState === 'done' ||
      detailSubscribeState === 'download-error'
    : false

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
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search wallpapers..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full rounded-lg bg-white/5 py-2 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={queryType}
          onChange={(e) => setQueryType(e.target.value as WorkshopQueryType)}
          className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 [&>option]:bg-[#1a1a1a] [&>option]:text-gray-200"
        >
          <option value="RankedByVote">Top Rated</option>
          <option value="RankedByPublicationDate">Newest</option>
          <option value="RankedByTrend">Trending</option>
          <option value="RankedByTotalUniqueSubscriptions">Most Subscribed</option>
          <option value="RankedByLastUpdatedDate">Recently Updated</option>
        </select>
        <PreviewSizeToggle value={previewSize} onChange={setPreviewSize} />
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
          >
            <X size={14} /> Reset
          </button>
        )}
        {selection.size > 0 && (
          <>
            <span className="text-xs text-gray-500">{selection.size} selected</span>
            <button
              onClick={() => enqueueSubscribe([...selection])}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"
            >
              <Download size={14} /> Subscribe selection
            </button>
          </>
        )}
      </div>

      {creatorFilter && (
        <div className="flex items-center gap-2 border-b border-white/5 bg-indigo-600/10 px-4 py-2 text-xs text-indigo-200">
          <User size={12} />
          <span>Showing wallpapers from this creator</span>
          <button
            onClick={() => openProfilePage(creatorFilter)}
            className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-gray-300 hover:bg-white/10"
          >
            <ExternalLink size={11} /> View Steam profile
          </button>
          <button
            onClick={() => onClearCreatorFilter?.()}
            className="ml-auto flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-gray-300 hover:bg-white/10"
          >
            <X size={11} /> Clear
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {showFilters && (
          <div className="w-52 flex-shrink-0 overflow-y-auto border-r border-white/5 bg-[#0d0d0d] px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Match</span>
              <div className="flex rounded-md overflow-hidden text-xs">
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, filterMode: 'or' }))}
                  className={clsx(
                    'px-2.5 py-1 transition-colors',
                    filters.filterMode === 'or'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/5 text-gray-400 hover:text-gray-200'
                  )}
                >
                  Any (OR)
                </button>
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, filterMode: 'and' }))}
                  className={clsx(
                    'px-2.5 py-1 transition-colors',
                    filters.filterMode === 'and'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/5 text-gray-400 hover:text-gray-200'
                  )}
                >
                  All (AND)
                </button>
              </div>
            </div>

            <FilterSection
              title="Show Only"
              defaultOpen={false}
              activeCount={filters.showOnly.length}
              onAll={() => setFilters((p) => ({ ...p, showOnly: WE_SHOW_ONLY.map((i) => i.tag) }))}
              onNone={() => setFilters((p) => ({ ...p, showOnly: [] }))}
            >
              {WE_SHOW_ONLY.map((item) => (
                <CheckItem
                  key={item.tag}
                  label={item.label}
                  checked={filters.showOnly.includes(item.tag)}
                  onChange={() => update('showOnly', item.tag)}
                />
              ))}
            </FilterSection>
            <FilterSection
              title="Type"
              activeCount={effectiveTypes.length}
              onAll={() => setFilters((p) => ({ ...p, types: ALL_TYPES }))}
              onNone={() => setFilters((p) => ({ ...p, types: [] }))}
            >
              {WE_TYPES.map((item) => (
                <CheckItem
                  key={item.tag}
                  label={item.label}
                  checked={filters.types.includes(item.tag)}
                  onChange={() => update('types', item.tag)}
                />
              ))}
            </FilterSection>
            {assetSelected && (
              <FilterSection
                title="Asset Type"
                activeCount={effectiveAssetTypes.length}
                onAll={() => setFilters((p) => ({ ...p, assetTypes: ALL_ASSET_TYPES }))}
                onNone={() => setFilters((p) => ({ ...p, assetTypes: [] }))}
              >
                {WE_ASSET_TYPES.map((item) => (
                  <CheckItem
                    key={item.tag}
                    label={item.label}
                    checked={filters.assetTypes.includes(item.tag)}
                    onChange={() => update('assetTypes', item.tag)}
                  />
                ))}
              </FilterSection>
            )}
            <FilterSection
              title="Age Rating"
              activeCount={effectiveAgeRatings.length}
              onAll={() => setFilters((p) => ({ ...p, ageRatings: ALL_AGE_RATINGS }))}
              onNone={() => setFilters((p) => ({ ...p, ageRatings: [] }))}
            >
              {WE_AGE_RATINGS.map((item) => (
                <CheckItem
                  key={item.tag}
                  label={item.label}
                  checked={filters.ageRatings.includes(item.tag)}
                  onChange={() => update('ageRatings', item.tag)}
                />
              ))}
            </FilterSection>
            <FilterSection
              title="Resolution"
              defaultOpen={false}
              activeCount={effectiveResolutions.length}
              onAll={() => setFilters((p) => ({ ...p, resolutions: ALL_RESOLUTIONS }))}
              onNone={() => setFilters((p) => ({ ...p, resolutions: [] }))}
            >
              {WE_RESOLUTION_GROUPS.map((group) => {
                const groupTags = group.items.map((i) => i.tag)
                return (
                  <div key={group.label} className="mt-2">
                    <div className="flex items-center justify-between mb-0.5 pl-0.5">
                      <p className="text-xs text-gray-600">{group.label}</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() =>
                            setFilters((p) => ({
                              ...p,
                              resolutions: [...new Set([...p.resolutions, ...groupTags])]
                            }))
                          }
                          className="text-[10px] text-gray-600 hover:text-gray-400"
                        >
                          all
                        </button>
                        <button
                          onClick={() =>
                            setFilters((p) => ({
                              ...p,
                              resolutions: p.resolutions.filter((r) => !groupTags.includes(r))
                            }))
                          }
                          className="text-[10px] text-gray-600 hover:text-gray-400"
                        >
                          none
                        </button>
                      </div>
                    </div>
                    {group.items.map((item) => (
                      <CheckItem
                        key={item.tag}
                        label={item.label}
                        checked={filters.resolutions.includes(item.tag)}
                        onChange={() => update('resolutions', item.tag)}
                      />
                    ))}
                  </div>
                )
              })}
            </FilterSection>
            <FilterSection
              title="Genre"
              defaultOpen={false}
              activeCount={effectiveGenres.length}
              onAll={() => setFilters((p) => ({ ...p, genres: ALL_GENRES }))}
              onNone={() => setFilters((p) => ({ ...p, genres: [] }))}
            >
              {WE_GENRES.map((item) => (
                <CheckItem
                  key={item.tag}
                  label={item.label}
                  checked={filters.genres.includes(item.tag)}
                  onChange={() => update('genres', item.tag)}
                />
              ))}
            </FilterSection>
          </div>
        )}

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
          {error && (
            <div className="rounded-lg bg-red-900/20 p-4 text-sm text-red-400">
              <p className="font-medium">Failed to load workshop</p>
              <p className="mt-1 opacity-75">{(error as Error).message}</p>
              {(error as Error).message.includes('Steam') && (
                <p className="mt-2 text-xs opacity-60">
                  Make sure Steam is running and Wallpaper Engine is installed. Close Wallpaper
                  Engine if it is currently running.
                </p>
              )}
            </div>
          )}
          {!isLoading && items.length === 0 && !error && (
            <div className="flex h-40 items-center justify-center text-gray-500">
              No results found
            </div>
          )}
          <div className="grid gap-4" style={previewGridStyle(previewSize)}>
            {paginatedItems.map((item) => (
              <WorkshopCard
                key={item.publishedFileId}
                item={item}
                selected={selection.has(item.publishedFileId)}
                isLiked={votedSet.has(item.publishedFileId)}
                canPlay={playableSet.has(item.publishedFileId)}
                lweInstalled={lweStatus?.installed ?? false}
                subscribeState={subscribeEntries.get(item.publishedFileId)?.state}
                downloadPercentage={subscribeEntries.get(item.publishedFileId)?.percentage}
                onSelect={(e) => handleCardSelect(item.publishedFileId, e)}
                onContextMenu={(e) => openCtxMenu(e, item.publishedFileId)}
                onLiked={() => queryClient.invalidateQueries({ queryKey: ['steam-voted-ids'] })}
                onPlay={() => handlePlay(item.publishedFileId)}
                onSubscribe={() => enqueueSubscribe([item.publishedFileId])}
                onOpenDetail={() => setDetailId(item.publishedFileId)}
              />
            ))}
          </div>
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
          {isFetchingNextPage && (
            <div className="mt-4 flex justify-center text-gray-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {totalFiltered > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded bg-[#1a1a1a] px-2 py-1 text-gray-300 outline-none [&>option]:bg-[#1a1a1a] [&>option]:text-gray-300"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded bg-white/5 px-2.5 py-1 text-gray-300 hover:bg-white/10 disabled:opacity-40"
                >
                  Prev
                </button>
                <span>
                  Page {safePage} of {totalPages} ({totalFiltered} items{totalResults > totalFiltered ? ` of ~${totalResults}` : ''})
                </span>
                <button
                  disabled={safePage >= totalPages && !hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded bg-white/5 px-2.5 py-1 text-gray-300 hover:bg-white/10 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {detailId && detailItem && (
          <DetailSidebar
            id={detailId}
            fallbackTitle={detailItem.title}
            fallbackPreviewUrl={detailItem.previewUrl}
            fallbackTags={detailItem.tags}
            fallbackAuthorSteamId={detailItem.creatorSteamId}
            isSubscribed={detailSubscribed}
            isLiked={votedSet.has(detailId)}
            canPlay={playableSet.has(detailId)}
            lweInstalled={lweStatus?.installed ?? false}
            onClose={() => setDetailId(null)}
            onSubscribe={() => enqueueSubscribe([detailId])}
            onUnsubscribe={() => unsubscribeIds([detailId])}
            onLiked={() => queryClient.invalidateQueries({ queryKey: ['steam-voted-ids'] })}
            onPlay={() => handlePlay(detailId)}
            onBrowseCreator={onBrowseCreator}
          />
        )}
      </div>

      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl text-sm"
          style={{ left: ctxPos?.x ?? ctxMenu.x, top: ctxPos?.y ?? ctxMenu.y }}
        >
          {ctxMenu.ids.length > 1 && (
            <div className="px-3 py-1 text-xs text-gray-600 border-b border-white/5 mb-1">
              {ctxMenu.ids.length} items selected
            </div>
          )}
          {ctxMenu.ids.length === 1 && playableSet.has(ctxMenu.ids[0]) && (
            <>
              <button
                onClick={ctxPlay}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
              >
                <Play size={12} /> Play wallpaper
              </button>
              <div className="my-1 border-t border-white/5" />
            </>
          )}
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
            Like
          </button>
          <button
            onClick={() => ctxVote(false)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
          >
            Dislike
          </button>
          <div className="my-1 border-t border-white/5" />
          <button
            onClick={ctxOpenInSteam}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
          >
            Open in Steam Workshop
          </button>
          {ctxMenu.ids.length === 1 && (
            <button
              onClick={ctxBrowseCreator}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
            >
              <User size={12} /> Browse wallpapers from this creator
            </button>
          )}
        </div>
      )}
    </div>
  )
}
