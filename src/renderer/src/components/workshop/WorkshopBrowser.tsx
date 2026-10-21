import { useState, useEffect, useMemo, useRef } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, User, ExternalLink, Play, Download, EyeOff, Eye } from 'lucide-react'
import WorkshopCard from './WorkshopCard'
import PreviewSizeToggle from '../common/PreviewSizeToggle'
import DetailSidebar from '../common/DetailSidebar'
import {
  ContextMenu,
  FolderMenuItems,
  MenuItem,
  MenuSelectionCount,
  MenuSeparator,
  VoteMenuItems,
  FavoriteMenuItems
} from '../common/ContextMenu'
import {
  FiltersToggle,
  LoadingSpinner,
  MarqueeOverlay,
  Pagination,
  ResetFiltersButton,
  SearchInput
} from '../common/GridControls'
import { CheckGroup, CheckItem, FilterPanel, FilterSection, ResolutionFilterSection, TagFilterSection } from '../common/FilterPanel'
import type { WorkshopQueryType } from '@shared/types'
import clsx from 'clsx'
import {
  WE_SHOW_ONLY,
  WE_TYPES,
  WE_ASSET_TYPES,
  WE_AGE_RATINGS,
  WE_GENRES,
  ALL_RESOLUTION_TAGS,
  migrateResolutionSelection
} from '../../constants/weFilters'
import { usePreviewSize, previewGridStyle } from '../../hooks/usePreviewSize'
import { loadPageSize, usePersistentState, useSessionState } from '../../hooks/usePersistentState'
import { useCardBorders, useCardSteamState } from '../../hooks/useCardBorders'
import { useBatchVote, useDislikedIds, useVotedIds } from '../../hooks/useVotes'
import { useBatchFavorite, useFavoriteIds } from '../../hooks/useFavorites'
import { useAllWallpapers, useFolders, useLweInstalled } from '../../hooks/queries'
import { useApplyWallpaper, useUnsubscribe } from '../../hooks/useWallpaperActions'
import { useSelectableGrid } from '../../hooks/useSelectableGrid'
import { isSubscribedState, useSubscriptionQueue } from '../../hooks/useSubscriptionQueue'
import { openWorkshopPage, openProfilePage } from '../../utils/steam'
import { isPlayable } from '../../utils/wallpaper'
import { matchesSearchTerms, parseSearchQuery } from '../../utils/searchQuery'
import { formatFileSize } from '../../utils/format'
import { t } from '../../i18n'

const STORAGE_KEY = 'we-workshop-filters'
const QUERY_TYPES: WorkshopQueryType[] = [
  'RankedByVote',
  'RankedByPublicationDate',
  'RankedByTrend',
  'RankedByTotalUniqueSubscriptions',
  'RankedByLastUpdatedDate'
]
const STORAGE_VERSION = 2

const ALL_TAGS = {
  types: WE_TYPES.map((i) => i.tag),
  assetTypes: WE_ASSET_TYPES.map((i) => i.tag),
  ageRatings: WE_AGE_RATINGS.map((i) => i.tag),
  resolutions: ALL_RESOLUTION_TAGS,
  genres: WE_GENRES.map((i) => i.tag)
}
type TagCategory = keyof typeof ALL_TAGS
const TAG_CATEGORIES = Object.keys(ALL_TAGS) as TagCategory[]
// showOnly and assetTypes always AND, these follow the Match setting
const OR_CATEGORIES: TagCategory[] = ['types', 'ageRatings', 'resolutions', 'genres']

interface WorkshopFilterState extends Record<TagCategory, string[]> {
  _v: typeof STORAGE_VERSION
  filterMode: 'and' | 'or'
  showOnly: string[]
  notDownloaded: boolean
  notLiked: boolean
  notDisliked: boolean
  notFavorited: boolean
  sizeFilterMode: 'none' | 'lt' | 'gt'
  sizeFilterMb: number
}

const DEFAULT_STATE: WorkshopFilterState = {
  _v: STORAGE_VERSION,
  filterMode: 'or',
  showOnly: [],
  types: ['Scene', 'Video', 'Web'],
  assetTypes: [],
  ageRatings: ALL_TAGS.ageRatings,
  resolutions: ALL_RESOLUTION_TAGS,
  genres: ALL_TAGS.genres,
  notDownloaded: false,
  notLiked: false,
  notDisliked: false,
  notFavorited: false,
  sizeFilterMode: 'none',
  sizeFilterMb: 100
}

function loadFilters(stored: unknown): WorkshopFilterState {
  const parsed = stored as Partial<WorkshopFilterState>
  if (parsed['_v'] !== STORAGE_VERSION) return DEFAULT_STATE
  const state = { ...DEFAULT_STATE, ...parsed }
  if ('resolutions' in parsed) state.resolutions = migrateResolutionSelection(parsed.resolutions)
  return state
}

// every option selected = no filter
function effectiveTags(filters: WorkshopFilterState): Record<TagCategory, string[]> {
  const result = {} as Record<TagCategory, string[]>
  for (const key of TAG_CATEGORIES) {
    result[key] = filters[key].length === ALL_TAGS[key].length ? [] : filters[key]
  }
  return result
}

interface DownloadSize {
  label: string
  title: string
}

interface CtxMenu {
  x: number
  y: number
  ids: string[]
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
  const { entries: subscribeEntries, enqueue: enqueueSubscribe, clear: clearSubscribeEntries } =
    useSubscriptionQueue(() => queryClient.invalidateQueries({ queryKey: ['library'] }))
  const [searchText, setSearchText] = useSessionState(`we-workshop-search:${creatorFilter ?? ''}`, '')
  const searchQuery = useMemo(() => parseSearchQuery(searchText), [searchText])
  const steamSearchText = searchQuery.steamText
  const [queryType, setQueryType] = usePersistentState<WorkshopQueryType>(
    'we-workshop-sort',
    'RankedByPublicationDate',
    (v) => (typeof v === 'string' && QUERY_TYPES.includes(v as WorkshopQueryType) ? (v as WorkshopQueryType) : 'RankedByPublicationDate')
  )
  const [showFilters, setShowFilters] = usePersistentState('we-workshop-show-filters', true, (v) => v !== false)
  const [filters, setFilters] = usePersistentState(STORAGE_KEY, DEFAULT_STATE, loadFilters)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [page, setPage] = useSessionState(`we-workshop-page:${creatorFilter ?? ''}`, 1)
  const [pageSize, setPageSize] = usePersistentState('we-workshop-page-size', 50, loadPageSize)
  const [previewSize, setPreviewSize] = usePreviewSize()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = usePersistentState('we-workshop-show-ignored', false, (v) => v === true)

  const votedSet = useVotedIds()
  const dislikedSet = useDislikedIds()
  const batchVote = useBatchVote()
  const favoriteSet = useFavoriteIds()
  const batchFavorite = useBatchFavorite()
  const steamStateOf = useCardSteamState()
  const cardBorders = useCardBorders()
  const lweInstalled = useLweInstalled()
  const applyWallpaper = useApplyWallpaper()
  const unsubscribe = useUnsubscribe()
  const { moveToFolder, removeFromFolders, menuState } = useFolders()

  // only a real change resets to page 1, not remounting
  const pageResetKey = JSON.stringify([searchText, queryType, filters, pageSize, creatorFilter])
  const lastPageResetKey = useRef(pageResetKey)
  useEffect(() => {
    if (lastPageResetKey.current === pageResetKey) return
    lastPageResetKey.current = pageResetKey
    setPage(1)
  }, [pageResetKey, setPage])

  function setFilter<K extends keyof WorkshopFilterState>(key: K, value: WorkshopFilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const effective = useMemo(() => effectiveTags(filters), [filters])

  // AND: all tags go to Steam. OR: multi-selected categories are filtered here
  const steamTags: string[] = [
    ...filters.showOnly,
    ...effective.assetTypes,
    ...OR_CATEGORIES.flatMap((key) =>
      filters.filterMode === 'and' || effective[key].length === 1 ? effective[key] : []
    )
  ]

  const statusFilterCount = [filters.notDownloaded, filters.notLiked, filters.notDisliked, filters.notFavorited].filter(
    Boolean
  ).length
  const activeCount =
    filters.showOnly.length +
    TAG_CATEGORIES.reduce((sum, key) => sum + effective[key].length, 0) +
    statusFilterCount +
    (filters.sizeFilterMode !== 'none' ? 1 : 0)

  function clearAll() {
    setFilters((prev) => ({ ...DEFAULT_STATE, filterMode: prev.filterMode }))
  }

  async function unsubscribeIds(ids: string[]) {
    clearSubscribeEntries(ids)
    await unsubscribe(ids)
  }

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useInfiniteQuery({
    queryKey: ['workshop', creatorFilter, steamSearchText, queryType, steamTags],
    queryFn: ({ pageParam = 1 }) => {
      const params = {
        searchText: steamSearchText || undefined,
        queryType,
        tags: steamTags.length > 0 ? steamTags : undefined,
        page: pageParam as number
      }
      return creatorFilter
        ? window.electronAPI.workshop.queryByCreator(creatorFilter, params)
        : window.electronAPI.workshop.query(params)
    },
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.length * 50
      return fetched < lastPage.totalResults ? allPages.length + 1 : undefined
    },
    initialPageParam: 1
  })

  const allItems = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const itemById = useMemo(() => new Map(allItems.map((i) => [i.publishedFileId, i])), [allItems])

  const libraryWallpapers = useAllWallpapers()
  const playableSet = useMemo(
    () => new Set(libraryWallpapers.filter(isPlayable).map((w) => w.id)),
    [libraryWallpapers]
  )
  const libraryIdSet = useMemo(() => new Set(libraryWallpapers.map((w) => w.id)), [libraryWallpapers])

  const { data: ignoredCreators = [] } = useQuery({
    queryKey: ['ignored-creators'],
    queryFn: () => window.electronAPI.config.get().then((cfg) => cfg.ignoredCreators)
  })
  const ignoredCreatorSet = useMemo(() => new Set(ignoredCreators), [ignoredCreators])

  // skips subscribed, queued and library items, sizes can be missing
  function downloadSize(ids: string[]): DownloadSize | null {
    let bytes = 0
    let count = 0
    let unknown = 0
    for (const id of ids) {
      const item = itemById.get(id)
      if (item?.isSubscribed || libraryIdSet.has(id) || subscribeEntries.has(id)) continue
      count++
      if (item?.fileSize) bytes += item.fileSize
      else unknown++
    }
    if (count === 0) return null
    const size = formatFileSize(bytes)
    if (!size) return { label: t('workshop.sizeUnknown'), title: t('workshop.toDownloadNoSize', { count }) }
    const label = unknown > 0 ? `${size}+` : size
    let title = t('workshop.toDownload', { count, size })
    if (unknown > 0) title += ' ' + t('workshop.withoutSize', { count: unknown })
    if (count < ids.length) title += ', ' + t('workshop.alreadyQueued', { count: ids.length - count })
    return { label, title }
  }

  async function toggleIgnoreCreator(creatorSteamId: string) {
    if (ignoredCreatorSet.has(creatorSteamId)) {
      await window.electronAPI.config.unignoreCreator(creatorSteamId)
    } else {
      await window.electronAPI.config.ignoreCreator(creatorSteamId)
    }
    queryClient.invalidateQueries({ queryKey: ['ignored-creators'] })
  }

  const tagFiltered = useMemo(() => {
    const sizeThresholdBytes = filters.sizeFilterMb * 1024 * 1024

    return allItems.filter((item) => {
      if (
        filters.filterMode === 'or' &&
        !OR_CATEGORIES.every((key) => effective[key].length <= 1 || effective[key].some((tag) => item.tags.includes(tag)))
      )
        return false
      if (filters.notDownloaded && playableSet.has(item.publishedFileId)) return false
      if (filters.notLiked && votedSet.has(item.publishedFileId)) return false
      if (filters.notDisliked && dislikedSet.has(item.publishedFileId)) return false
      if (filters.notFavorited && favoriteSet.has(item.publishedFileId)) return false
      if (filters.sizeFilterMode !== 'none') {
        if (item.fileSize == null) return false
        if (filters.sizeFilterMode === 'lt' && item.fileSize >= sizeThresholdBytes) return false
        if (filters.sizeFilterMode === 'gt' && item.fileSize <= sizeThresholdBytes) return false
      }
      if (
        (searchQuery.requiredTerms.length > 0 || searchQuery.excludeTerms.length > 0) &&
        !matchesSearchTerms(`${item.title} ${item.description} ${item.tags.join(' ')}`, searchQuery)
      )
        return false
      return true
    })
  }, [allItems, searchQuery, filters, effective, playableSet, votedSet, dislikedSet, favoriteSet])

  // pages keep ignored items so they don't shift, "Show ignored" puts them at the end
  const totalFiltered = tagFiltered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const safePage = Math.min(page, totalPages)
  const rawPageItems = useMemo(
    () => tagFiltered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [tagFiltered, safePage, pageSize]
  )
  const pageShownItems = useMemo(
    () => rawPageItems.filter((item) => !ignoredCreatorSet.has(item.creatorSteamId)),
    [rawPageItems, ignoredCreatorSet]
  )
  const pageIgnoredItems = useMemo(
    () => rawPageItems.filter((item) => ignoredCreatorSet.has(item.creatorSteamId)),
    [rawPageItems, ignoredCreatorSet]
  )
  const paginatedItems = useMemo(
    () => (showIgnored ? [...pageShownItems, ...pageIgnoredItems] : pageShownItems),
    [showIgnored, pageShownItems, pageIgnoredItems]
  )

  const paginatedIds = useMemo(() => paginatedItems.map((i) => i.publishedFileId), [paginatedItems])
  const {
    selectedIds: selection,
    selectForContextMenu,
    handleCardSelect,
    containerProps,
    marqueeRect
  } = useSelectableGrid({
    ids: paginatedIds,
    dataAttr: 'data-workshop-id',
    onOpenDetail: setDetailId
  })

  const firstPage = useRef(page)
  useEffect(() => {
    if (firstPage.current === page) return
    firstPage.current = page
    containerProps.ref.current?.scrollTo({ top: 0 })
  }, [page, containerProps.ref])
  const selectionSize = selection.size > 0 ? downloadSize([...selection]) : null

  function openCtxMenu(e: React.MouseEvent, itemId: string) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, ids: selectForContextMenu(itemId) })
  }

  // fetch more pages until the filtered count fills the view
  const totalResults = data?.pages[0]?.totalResults ?? 0
  const needMore = totalFiltered < page * pageSize && allItems.length < totalResults
  useEffect(() => {
    if (needMore && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [needMore, hasNextPage, isFetchingNextPage, fetchNextPage])

  const assetSelected = filters.types.includes('Asset') || effective.types.length === 0

  const detailItem = detailId ? itemById.get(detailId) : undefined

  function run(action: () => unknown) {
    return () => {
      setCtxMenu(null)
      void action()
    }
  }

  function renderCtxMenu(menu: CtxMenu) {
    const single = menu.ids.length === 1 ? itemById.get(menu.ids[0]) : undefined
    const libraryIds = menu.ids.filter((id) => libraryIdSet.has(id))
    const { hasFolder, moveTargets } = menuState(menu.ids)
    const menuSize = downloadSize(menu.ids)

    return (
      <ContextMenu x={menu.x} y={menu.y} onClose={() => setCtxMenu(null)} className="min-w-[180px]">
        <MenuSelectionCount count={menu.ids.length} />
        {single && playableSet.has(single.publishedFileId) && (
          <>
            <MenuItem icon={Play} onClick={run(() => applyWallpaper(single.publishedFileId))}>
              {t('play.wallpaper')}
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuItem onClick={run(() => enqueueSubscribe(menu.ids))}>
          <span title={menuSize?.title}>
            {t('subscribe.subscribe')}{menuSize && <span className="ml-1.5 text-xs text-gray-500">{menuSize.label}</span>}
          </span>
        </MenuItem>
        <MenuItem onClick={run(() => unsubscribeIds(menu.ids))}>{t('subscribe.unsubscribe')}</MenuItem>
        <MenuSeparator />
        <VoteMenuItems onVote={(up) => run(() => batchVote(menu.ids, up))()} />
        <FavoriteMenuItems
          ids={menu.ids}
          favorites={favoriteSet}
          onFavorite={(ids, add) => run(() => batchFavorite(ids, add))()}
        />
        <MenuSeparator />
        <MenuItem icon={ExternalLink} onClick={run(() => menu.ids.forEach(openWorkshopPage))}>
          {t('menu.openWorkshop')}
        </MenuItem>
        {single && (
          <MenuItem icon={User} onClick={run(() => onBrowseCreator?.(single.creatorSteamId))}>
            {t('menu.browseCreator')}
          </MenuItem>
        )}
        {libraryIds.length > 0 && (
          <>
            <MenuSeparator />
            <FolderMenuItems
              moveTargets={moveTargets}
              hasFolder={hasFolder}
              onMove={(folderId) => run(() => moveToFolder(folderId, libraryIds))()}
              onRemove={run(() => removeFromFolders(menu.ids))}
            />
          </>
        )}
        {single && (
          <MenuItem
            icon={ignoredCreatorSet.has(single.creatorSteamId) ? Eye : EyeOff}
            onClick={run(() => toggleIgnoreCreator(single.creatorSteamId))}
          >
            {ignoredCreatorSet.has(single.creatorSteamId) ? t('creator.unignore') : t('creator.ignore')}
          </MenuItem>
        )}
      </ContextMenu>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-fg/5 px-4 py-3">
        <FiltersToggle open={showFilters} activeCount={activeCount} onClick={() => setShowFilters((v) => !v)} />
        <SearchInput
          value={searchText}
          placeholder={t('workshop.searchPlaceholder')}
          title={t('workshop.searchHint')}
          onChange={setSearchText}
        />
        <select
          value={queryType}
          onChange={(e) => setQueryType(e.target.value as WorkshopQueryType)}
          className="rounded-lg bg-card px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
        >
          <option value="RankedByVote">{t('workshop.sortTop')}</option>
          <option value="RankedByPublicationDate">{t('workshop.sortNewest')}</option>
          <option value="RankedByTrend">{t('workshop.sortTrending')}</option>
          <option value="RankedByTotalUniqueSubscriptions">{t('workshop.sortSubscribed')}</option>
          <option value="RankedByLastUpdatedDate">{t('workshop.sortUpdated')}</option>
        </select>
        <PreviewSizeToggle value={previewSize} onChange={setPreviewSize} />
        {activeCount > 0 && <ResetFiltersButton onClick={clearAll} />}
        {selection.size > 0 && (
          <>
            <span className="text-xs text-gray-500">{t('picker.selected', { count: selection.size })}</span>
            <button
              onClick={() => enqueueSubscribe([...selection])}
              title={selectionSize?.title ?? t('workshop.allQueued')}
              className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm text-white hover:bg-accent-500"
            >
              <Download size={14} /> {t('workshop.subscribeSelection')}
              {selectionSize && <span className="text-accent-200">({selectionSize.label})</span>}
            </button>
          </>
        )}
      </div>

      {creatorFilter && (
        <div className="flex items-center gap-2 border-b border-fg/5 bg-accent-600/10 px-4 py-2 text-xs text-accent-200">
          <User size={12} />
          <span>{t('workshop.creatorFilter')}</span>
          <button
            onClick={() => openProfilePage(creatorFilter)}
            className="flex items-center gap-1 rounded bg-fg/5 px-2 py-1 text-gray-300 hover:bg-fg/10"
          >
            <ExternalLink size={11} /> {t('workshop.viewProfile')}
          </button>
          <button
            onClick={() => onClearCreatorFilter?.()}
            className="ml-auto flex items-center gap-1 rounded bg-fg/5 px-2 py-1 text-gray-300 hover:bg-fg/10"
          >
            <X size={11} /> {t('common.clear')}
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {showFilters && (
          <FilterPanel>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('filters.match')}</span>
              <div className="flex rounded-md overflow-hidden text-xs">
                {(['or', 'and'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFilter('filterMode', mode)}
                    className={clsx(
                      'px-2.5 py-1 transition-colors',
                      filters.filterMode === mode
                        ? 'bg-accent-600 text-white'
                        : 'bg-fg/5 text-gray-400 hover:text-gray-200'
                    )}
                  >
                    {mode === 'or' ? t('filters.matchAny') : t('filters.matchAll')}
                  </button>
                ))}
              </div>
            </div>

            <FilterSection
              title={t('filters.status')}
              activeCount={statusFilterCount}
            >
              <CheckItem
                label={t('filters.notDownloaded')}
                checked={filters.notDownloaded}
                onChange={() => setFilter('notDownloaded', !filters.notDownloaded)}
              />
              <CheckItem
                label={t('filters.notRated')}
                title={t('filters.notRatedHint')}
                checked={filters.notLiked && filters.notDisliked}
                indeterminate={filters.notLiked !== filters.notDisliked}
                onChange={() => {
                  const on = !(filters.notLiked && filters.notDisliked)
                  setFilters((prev) => ({ ...prev, notLiked: on, notDisliked: on }))
                }}
              />
              <CheckGroup>
                <CheckItem
                  nested
                  label={t('filters.notLiked')}
                  checked={filters.notLiked}
                  onChange={() => setFilter('notLiked', !filters.notLiked)}
                />
                <CheckItem
                  nested
                  label={t('filters.notDisliked')}
                  checked={filters.notDisliked}
                  onChange={() => setFilter('notDisliked', !filters.notDisliked)}
                />
              </CheckGroup>
              <CheckItem
                label={t('filters.notFavorited')}
                checked={filters.notFavorited}
                onChange={() => setFilter('notFavorited', !filters.notFavorited)}
              />
            </FilterSection>
            <FilterSection title={t('filters.fileSize')} activeCount={filters.sizeFilterMode !== 'none' ? 1 : 0}>
              <select
                value={filters.sizeFilterMode}
                onChange={(e) => setFilter('sizeFilterMode', e.target.value as WorkshopFilterState['sizeFilterMode'])}
                className="w-full rounded bg-card px-1.5 py-1 text-xs text-gray-300 outline-none"
              >
                <option value="none">{t('filters.anySize')}</option>
                <option value="lt">{t('filters.lessThan')}</option>
                <option value="gt">{t('filters.moreThan')}</option>
              </select>
              {filters.sizeFilterMode !== 'none' && (
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={filters.sizeFilterMb}
                    onChange={(e) => setFilter('sizeFilterMb', Math.max(0, Number(e.target.value) || 0))}
                    className="w-16 rounded bg-card px-1.5 py-1 text-xs text-gray-300 outline-none focus:ring-1 focus:ring-accent-500"
                  />
                  <span className="text-xs text-gray-500">MB</span>
                </div>
              )}
            </FilterSection>
            <TagFilterSection
              title={t('filters.showOnly')}
              defaultOpen={false}
              options={WE_SHOW_ONLY}
              selected={filters.showOnly}
              activeCount={filters.showOnly.length}
              onChange={(tags) => setFilter('showOnly', tags)}
            />
            <TagFilterSection
              title={t('filters.type')}
              options={WE_TYPES}
              selected={filters.types}
              activeCount={effective.types.length}
              onChange={(tags) => setFilter('types', tags)}
            />
            {assetSelected && (
              <TagFilterSection
                title={t('filters.assetType')}
                options={WE_ASSET_TYPES}
                selected={filters.assetTypes}
                activeCount={effective.assetTypes.length}
                onChange={(tags) => setFilter('assetTypes', tags)}
              />
            )}
            <TagFilterSection
              title={t('filters.ageRating')}
              options={WE_AGE_RATINGS}
              selected={filters.ageRatings}
              activeCount={effective.ageRatings.length}
              onChange={(tags) => setFilter('ageRatings', tags)}
            />
            <ResolutionFilterSection
              selected={filters.resolutions}
              allTags={ALL_RESOLUTION_TAGS}
              activeCount={effective.resolutions.length}
              onChange={(tags) => setFilter('resolutions', tags)}
            />
            <TagFilterSection
              title={t('filters.genre')}
              defaultOpen={false}
              options={WE_GENRES}
              selected={filters.genres}
              activeCount={effective.genres.length}
              onChange={(tags) => setFilter('genres', tags)}
            />
          </FilterPanel>
        )}

        <div {...containerProps} className="relative flex-1 overflow-y-auto p-4 select-none">
          {isLoading && <LoadingSpinner />}
          {error && (
            <div className="rounded-lg bg-red-900/20 p-4 text-sm text-red-400">
              <p className="font-medium">{t('workshop.loadFailed')}</p>
              <p className="mt-1 opacity-75">{(error as Error).message}</p>
              {(error as Error).message.includes('Steam') && (
                <p className="mt-2 text-xs opacity-60">
                  {t('workshop.loadFailedHint')}
                </p>
              )}
            </div>
          )}
          {!isLoading && tagFiltered.length === 0 && !error && (
            <div className="flex h-40 items-center justify-center text-gray-500">
              {t('workshop.noResults')}
            </div>
          )}
          <div className="grid gap-4" style={previewGridStyle(previewSize)}>
            {paginatedItems.map((item) => (
              <WorkshopCard
                key={item.publishedFileId}
                item={item}
                selected={selection.has(item.publishedFileId)}
                isDetailOpen={detailId === item.publishedFileId}
                ignored={ignoredCreatorSet.has(item.creatorSteamId)}
                steam={steamStateOf(item.publishedFileId)}
                borders={cardBorders}
                canPlay={playableSet.has(item.publishedFileId)}
                lweInstalled={lweInstalled}
                subscribeState={subscribeEntries.get(item.publishedFileId)?.state}
                downloadPercentage={subscribeEntries.get(item.publishedFileId)?.percentage}
                onSelect={(e) => handleCardSelect(item.publishedFileId, e)}
                onContextMenu={(e) => openCtxMenu(e, item.publishedFileId)}
                onPlay={() => applyWallpaper(item.publishedFileId)}
                onSubscribe={() => enqueueSubscribe([item.publishedFileId])}
              />
            ))}
          </div>
          <MarqueeOverlay rect={marqueeRect} />
          {isFetchingNextPage && (
            <div className="mt-4 flex justify-center text-gray-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {pageIgnoredItems.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-2 border-t border-fg/5 pt-3 text-xs text-gray-500">
              <span>
                {t('workshop.ignoredOnPage', { count: pageIgnoredItems.length })}
              </span>
              <button
                onClick={() => setShowIgnored((v) => !v)}
                className="rounded bg-fg/5 px-2 py-1 text-gray-300 hover:bg-fg/10"
              >
                {showIgnored ? t('workshop.hideIgnored') : t('workshop.showIgnored')}
              </button>
            </div>
          )}
          {totalFiltered > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-fg/5 pt-3">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{t('pagination.perPage')}</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded bg-card px-2 py-1 text-gray-300 outline-none"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
              <Pagination
                page={safePage}
                totalPages={totalPages}
                canNext={safePage < totalPages || !!hasNextPage}
                onPage={setPage}
              >
                {t('pagination.page', { page: safePage, total: totalPages })}{' '}
                {totalResults > totalFiltered
                  ? t('pagination.itemsOfAbout', { count: totalFiltered, total: totalResults })
                  : t('pagination.items', { count: totalFiltered })}
              </Pagination>
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
            isSubscribed={detailItem.isSubscribed || isSubscribedState(subscribeEntries.get(detailId)?.state)}
            canPlay={playableSet.has(detailId)}
            onClose={() => setDetailId(null)}
            onSubscribe={() => enqueueSubscribe([detailId])}
            onUnsubscribe={() => unsubscribeIds([detailId])}
            onPlay={(screen) => applyWallpaper(detailId, screen)}
            onBrowseCreator={onBrowseCreator}
          />
        )}
      </div>

      {ctxMenu && renderCtxMenu(ctxMenu)}
    </div>
  )
}
