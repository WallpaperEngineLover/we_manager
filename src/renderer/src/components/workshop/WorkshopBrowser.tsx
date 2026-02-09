import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, Loader2, SlidersHorizontal, X, ChevronDown, ChevronRight } from 'lucide-react'
import WorkshopCard from './WorkshopCard'
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

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
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

export default function WorkshopBrowser() {
  const [searchText, setSearchText] = useState('')
  const [queryType, setQueryType] = useState<WorkshopQueryType>('RankedByPublicationDate')
  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState<WorkshopFilterState>(loadFilters)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => {
    saveFilters(filters)
  }, [filters])

  // Reset to page 1 when query params change
  useEffect(() => {
    setPage(1)
  }, [searchText, queryType, filters, pageSize])

  function update<K extends keyof WorkshopFilterState>(key: K, tag: string) {
    setFilters((prev) => ({ ...prev, [key]: toggle(prev[key] as string[], tag) }))
  }

  // "all selected" means no filter — treat as if nothing is selected for that category
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

  function toggleSelect(id: string) {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openCtxMenu = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      e.preventDefault()
      const ids = selection.has(itemId) ? [...selection] : [itemId]
      setCtxMenu({ x: e.clientX, y: e.clientY, ids })
    },
    [selection]
  )

  function closeCtxMenu() {
    setCtxMenu(null)
  }

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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useInfiniteQuery({
      queryKey: ['workshop', searchText, queryType, steamTags],
      queryFn: ({ pageParam = 1 }) =>
        window.electronAPI.workshop.query({
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

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
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
            placeholder="Search wallpapers…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full rounded-lg bg-white/5 py-2 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={queryType}
          onChange={(e) => setQueryType(e.target.value as WorkshopQueryType)}
          className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="RankedByVote">Top Rated</option>
          <option value="RankedByPublicationDate">Newest</option>
          <option value="RankedByTrend">Trending</option>
          <option value="RankedByTotalUniqueSubscriptions">Most Subscribed</option>
          <option value="RankedByLastUpdatedDate">Recently Updated</option>
        </select>
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
          >
            <X size={14} /> Reset
          </button>
        )}
      </div>

      {/* Body: optional filter sidebar + content grid */}
      <div className="flex flex-1 overflow-hidden">
        {showFilters && (
          <div className="w-52 flex-shrink-0 overflow-y-auto border-r border-white/5 bg-[#0d0d0d] px-3 py-3 space-y-3">
            {/* AND / OR toggle */}
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

        <div className="flex-1 overflow-y-auto p-4">
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {paginatedItems.map((item) => (
              <WorkshopCard
                key={item.publishedFileId}
                item={item}
                selected={selection.has(item.publishedFileId)}
                onToggleSelect={() => toggleSelect(item.publishedFileId)}
                onContextMenu={(e) => openCtxMenu(e, item.publishedFileId)}
              />
            ))}
          </div>
          {isFetchingNextPage && (
            <div className="mt-4 flex justify-center text-gray-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {/* Pagination controls */}
          {totalFiltered > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded bg-white/5 px-2 py-1 text-gray-300 outline-none"
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
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCtxMenu} />
          <div
            ref={ctxRef}
            className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-xl text-sm"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            {ctxMenu.ids.length > 1 && (
              <div className="px-3 py-1 text-xs text-gray-600 border-b border-white/5 mb-1">
                {ctxMenu.ids.length} items selected
              </div>
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
              👍 Like
            </button>
            <button
              onClick={() => ctxVote(false)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
            >
              👎 Dislike
            </button>
            <div className="my-1 border-t border-white/5" />
            <button
              onClick={ctxOpenInSteam}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/5"
            >
              Open in Steam Workshop
            </button>
          </div>
        </>
      )}
    </div>
  )
}
