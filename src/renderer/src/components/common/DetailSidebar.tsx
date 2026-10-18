import { useState, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Star,
  ThumbsUp,
  ThumbsDown,
  Heart,
  Download,
  Play,
  Loader2,
  ExternalLink,
  MessageCircle,
  User,
  Trash2,
  Eye,
  EyeOff,
  Layers,
  ChevronDown,
  ChevronRight,
  Pin,
  Volume2,
  VolumeX,
  ToggleLeft,
  ToggleRight,
  SlidersHorizontal,
  ScanEye,
  Maximize,
  ZoomIn,
  ZoomOut,
  Move,
  Move3d,
  Expand,
  Wrench,
  Palette,
  Gauge,
  Zap,
  Music2,
  Terminal,
  Sparkles,
  CloudFog,
  HeartCrack,
  type LucideIcon
} from 'lucide-react'
import clsx from 'clsx'
import { openWorkshopPage, openProfilePage, isWorkshopId } from '../../utils/steam'
import { WE_TYPES, WE_AGE_RATINGS, canonicalResolutionTag, resolutionsFromTags } from '../../constants/weFilters'
import { formatFileSize } from '../../utils/format'
import { isRangeKey } from '../../utils/dom'
import { useDislikedIds, useVoteAction, useVotedIds } from '../../hooks/useVotes'
import { useFavoriteAction, useFavoriteIds, useItemFavoriteStatus } from '../../hooks/useFavorites'
import { useLweInstalled } from '../../hooks/queries'
import { useKeyedCommits } from '../../hooks/useKeyedCommits'
import ScreenSelect from './ScreenSelect'
import { getPreviewSrc } from '../../utils/preview'
import EngineFlagsSection from './sidebar/EngineFlagsSection'
import ImageAdjustmentsSection from './sidebar/ImageAdjustmentsSection'
import VideoTrimSection from './sidebar/VideoTrimSection'
import { videoSegmentsOf, type VideoSegment } from '@shared/videoTrim'
import CompatSection from './sidebar/CompatSection'
import ThumbnailSection from './sidebar/ThumbnailSection'
import { ShortcutRow } from './ShortcutRow'
import { useDisplayTargets, useScreenAssignments } from '../../hooks/useDisplayTargets'
import type {
  LweSceneObject,
  LweSceneEffect,
  LweProperty,
  LweAudioObject,
  WallpaperMeta,
  ScalingMode,
  ImageAdjustments,
  ScreenTarget
} from '@shared/types'
import { t, tn, formatNumber, tagLabel } from '../../i18n'
import type { MessageKey } from '@shared/i18n'

const SCALING_MODE_OPTIONS: { value: ScalingMode; label: MessageKey }[] = [
  { value: 'default', label: 'detail.scalingDefault' },
  { value: 'stretch', label: 'detail.scalingStretch' },
  { value: 'fill', label: 'detail.scalingFill' },
  { value: 'fit', label: 'detail.scalingFit' },
  { value: 'center', label: 'detail.scalingCenter' }
]

const TYPE_TAGS = new Set(WE_TYPES.map((i) => i.tag))
const AGE_TAGS = new Set(WE_AGE_RATINGS.map((i) => i.tag))

function StarRating({ upvotes, downvotes }: { upvotes: number; downvotes: number }) {
  const total = upvotes + downvotes
  if (total === 0) return <p className="text-xs text-gray-600">{t('detail.noRatings')}</p>
  const fraction = upvotes / total
  return (
    <div className="flex items-center gap-2">
      <div className="relative inline-flex">
        <div className="flex gap-0.5 text-gray-700">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={14} fill="currentColor" />
          ))}
        </div>
        <div
          className="absolute inset-0 flex gap-0.5 overflow-hidden text-yellow-400"
          style={{ width: `${fraction * 100}%` }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={14} fill="currentColor" />
          ))}
        </div>
      </div>
      <span className="text-xs text-gray-500">
        {Math.round(fraction * 100)}% ({formatNumber(total)})
      </span>
    </div>
  )
}

type ObjectState = 'default' | 'hidden' | 'forced'

function objectState(objId: string, disabled: string[], enabled: string[]): ObjectState {
  if (disabled.includes(objId)) return 'hidden'
  if (enabled.includes(objId)) return 'forced'
  return 'default'
}

function LayerRow({
  object,
  state,
  busy,
  onToggle
}: {
  object: LweSceneObject
  state: ObjectState
  busy: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      title={
        state === 'default'
          ? t('detail.layerVisible')
          : state === 'hidden'
            ? t('detail.layerHidden')
            : t('detail.forcedVisible')
      }
      className={clsx(
        'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-fg/5 disabled:opacity-40',
        state === 'hidden' ? 'text-gray-600' : 'text-gray-300'
      )}
    >
      {state === 'hidden' ? (
        <EyeOff size={12} className="shrink-0 text-gray-600" />
      ) : state === 'forced' ? (
        <Pin size={12} className="shrink-0 text-accent-400" />
      ) : (
        <Eye size={12} className="shrink-0 text-gray-500" />
      )}
      <span className={clsx('flex-1 truncate', state === 'hidden' && 'line-through')}>
        {object.name}
      </span>
      <span className="shrink-0 text-gray-600">{object.type}</span>
    </button>
  )
}

function EffectRow({
  effect,
  state,
  busy,
  onToggle
}: {
  effect: LweSceneEffect
  state: ObjectState
  busy: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      title={
        state === 'default'
          ? t('detail.effectVisible')
          : state === 'hidden'
            ? t('detail.effectDisabled')
            : t('detail.forcedVisible')
      }
      className={clsx(
        'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-fg/5 disabled:opacity-40',
        state === 'hidden' ? 'text-gray-600' : 'text-gray-300'
      )}
    >
      {state === 'hidden' ? (
        <EyeOff size={12} className="shrink-0 text-gray-600" />
      ) : state === 'forced' ? (
        <Pin size={12} className="shrink-0 text-accent-400" />
      ) : (
        <Eye size={12} className="shrink-0 text-gray-500" />
      )}
      <span className={clsx('flex-1 truncate', state === 'hidden' && 'line-through')}>
        {effect.name}
      </span>
      <span className="shrink-0 truncate text-gray-600" title={effect.objectName}>
        {t('detail.onObject', { name: effect.objectName })}
      </span>
    </button>
  )
}

// the only property types WE's customize UI shows
function PropertyRow({
  property,
  value,
  onCommit
}: {
  property: LweProperty
  value: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const label = property.text || property.name

  if (property.type === 'usershortcut') {
    return <ShortcutRow property={property} value={value} onCommit={onCommit} />
  }

  if (property.type === 'boolean') {
    const on = value === '1' || value === 'true'
    return (
      <button
        onClick={() => onCommit(on ? '0' : '1')}
        title={property.name}
        className={clsx(
          'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-fg/5',
          on ? 'text-gray-200' : 'text-gray-500'
        )}
      >
        {on ? (
          <ToggleRight size={14} className="shrink-0 text-accent-400" />
        ) : (
          <ToggleLeft size={14} className="shrink-0 text-gray-600" />
        )}
        <span className="flex-1 truncate">{label}</span>
      </button>
    )
  }

  if (property.type === 'slider') {
    const num = draft ?? (Number(value) || 0)
    return (
      <div className="px-1.5 py-1">
        <div className="mb-0.5 flex items-center justify-between text-xs text-gray-400">
          <span className="truncate" title={property.name}>
            {label}
          </span>
          <span className="text-gray-500">{num}</span>
        </div>
        <input
          type="range"
          min={property.min ?? 0}
          max={property.max ?? 100}
          step={property.step || 1}
          value={num}
          onChange={(e) => setDraft(Number(e.target.value))}
          onMouseUp={(e) => { onCommit(e.currentTarget.value); setDraft(null) }}
          onTouchEnd={(e) => { onCommit(e.currentTarget.value); setDraft(null) }}
          onKeyUp={(e) => { if (!isRangeKey(e.key)) return; onCommit(e.currentTarget.value); setDraft(null) }}
          className="w-full accent-accent-500"
        />
      </div>
    )
  }

  if (property.type === 'combo') {
    return (
      <label className="flex items-center gap-2 px-1.5 py-1 text-xs text-gray-300">
        <span className="flex-1 truncate" title={property.name}>
          {label}
        </span>
        <select
          value={value}
          onChange={(e) => onCommit(e.target.value)}
          className="rounded bg-fg/5 px-1.5 py-0.5 text-xs text-gray-300 outline-none"
        >
          {property.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return null
}

// one row per object, 0% = no pulse, 100% = as authored
function AudioObjectRow({
  objectName,
  properties,
  multiplier,
  onCommit
}: {
  objectName: string
  properties: string[]
  multiplier: number
  onCommit: (multiplier: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const percent = draft ?? Math.round(multiplier * 100)

  return (
    <div className="px-1.5 py-1">
      <div className="mb-0.5 flex items-center justify-between text-xs text-gray-400">
        <span className="truncate" title={properties.join(', ')}>
          {objectName}
        </span>
        <span className="text-gray-500">{percent === 0 ? 'locked' : `${percent}%`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={200}
        step={5}
        value={percent}
        onChange={(e) => setDraft(Number(e.target.value))}
        onMouseUp={(e) => { onCommit(Number(e.currentTarget.value) / 100); setDraft(null) }}
        onTouchEnd={(e) => { onCommit(Number(e.currentTarget.value) / 100); setDraft(null) }}
        onKeyUp={(e) => { if (!isRangeKey(e.key)) return; onCommit(Number(e.currentTarget.value) / 100); setDraft(null) }}
        className="w-full accent-accent-500"
      />
    </div>
  )
}

function SoundTrackRow({
  trackName,
  volume,
  onCommit
}: {
  trackName: string
  volume: number
  onCommit: (volume: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const value = draft ?? volume

  return (
    <div className="px-1.5 py-1">
      <div className="mb-0.5 flex items-center justify-between text-xs text-gray-400">
        <span className="truncate" title={trackName}>
          {trackName}
        </span>
        <span className="text-gray-500">{value === 0 ? 'muted' : `${Math.round(value * 100)}%`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={value}
        onChange={(e) => setDraft(Number(e.target.value))}
        onMouseUp={(e) => { onCommit(Number(e.currentTarget.value)); setDraft(null) }}
        onTouchEnd={(e) => { onCommit(Number(e.currentTarget.value)); setDraft(null) }}
        onKeyUp={(e) => { if (!isRangeKey(e.key)) return; onCommit(Number(e.currentTarget.value)); setDraft(null) }}
        className="w-full accent-accent-500"
      />
    </div>
  )
}

function SidebarButton({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-lg bg-fg/5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-fg/10"
    >
      <Icon size={12} />
      {children}
    </button>
  )
}

interface DetailSidebarProps {
  id: string
  fallbackTitle: string
  fallbackPreviewUrl?: string
  fallbackTags: string[]
  fallbackAuthorSteamId?: string
  localFileSize?: number
  isSubscribed: boolean
  canPlay: boolean
  onClose: () => void
  onSubscribe: () => void
  onUnsubscribe: () => void | Promise<void>
  onPlay: (screen?: ScreenTarget) => void | Promise<void>
  onBrowseCreator?: (steamId: string) => void
}

export default function DetailSidebar({
  id,
  fallbackTitle,
  fallbackPreviewUrl,
  fallbackTags,
  fallbackAuthorSteamId,
  localFileSize,
  isSubscribed,
  canPlay,
  onClose,
  onSubscribe,
  onUnsubscribe,
  onPlay,
  onBrowseCreator
}: DetailSidebarProps) {
  const workshopId = isWorkshopId(id)
  const queryClient = useQueryClient()
  const lweInstalled = useLweInstalled()
  const cachedLiked = useVotedIds().has(id)
  const isDisliked = useDislikedIds().has(id)
  const { vote, isLiking, isDisliking } = useVoteAction()
  const isFavorite = useFavoriteIds().has(id)
  const { setFavorite, isPending: isFavoritePending } = useFavoriteAction()
  const { failure: favoriteFailure, checking: favoriteChecking } = useItemFavoriteStatus(id)
  const favoriteAdd = favoriteFailure ? favoriteFailure.add : !isFavorite
  const [isApplying, setIsApplying] = useState(false)
  const [unsubConfirm, setUnsubConfirm] = useState(false)
  const [isUnsubscribing, setIsUnsubscribing] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [togglingObjectId, setTogglingObjectId] = useState<string | null>(null)
  const [effectsOpen, setEffectsOpen] = useState(false)
  const [togglingEffectId, setTogglingEffectId] = useState<string | null>(null)
  const [togglingFog, setTogglingFog] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const [soundTracksOpen, setSoundTracksOpen] = useState(false)

  const { data: item } = useQuery({
    queryKey: ['workshop-detail', id],
    queryFn: () => window.electronAPI.workshop.getItem(id),
    enabled: workshopId,
    staleTime: 60_000
  })

  const { data: steamVote } = useQuery({
    queryKey: ['steam-vote', id],
    queryFn: () => window.electronAPI.steam.checkVote(id),
    enabled: workshopId,
    staleTime: 60_000,
    retry: false
  })
  const isLiked = typeof steamVote === 'boolean' ? steamVote : cachedLiked

  const title = item?.title ?? fallbackTitle
  const tags = item?.tags ?? fallbackTags
  const creatorSteamId = item?.creatorSteamId ?? fallbackAuthorSteamId
  const description = item?.description

  const { data: author } = useQuery({
    queryKey: ['author-info', creatorSteamId],
    queryFn: () => window.electronAPI.steam.getAuthorInfo(creatorSteamId!),
    enabled: !!creatorSteamId,
    staleTime: Infinity
  })

  const { data: libraryMeta } = useQuery({
    queryKey: ['library', 'item', id],
    queryFn: () => window.electronAPI.library.getOne(id)
  })
  const localPath = libraryMeta?.localPath
  const previewUrl =
    libraryMeta?.customPreview && !libraryMeta.useOriginalPreview
      ? getPreviewSrc(libraryMeta)
      : (item?.previewUrl ?? fallbackPreviewUrl)
  const disabledObjects = libraryMeta?.disabledObjects ?? []
  const enabledObjects = libraryMeta?.enabledObjects ?? []
  // null (not undefined) = gone from Steam, voting would fail
  const unavailable = !!libraryMeta?.unavailable || item === null

  const { targets, perScreen } = useDisplayTargets()
  const [playScreen, setPlayScreen] = useState<ScreenTarget>('*')
  const activeScreens = useScreenAssignments()
    .filter((a) => a.wallpaperId === id)
    .map((a) => a.screen)
  const isActive = activeScreens.length > 0

  const { data: objects = [], isLoading: objectsLoading } = useQuery({
    queryKey: ['lwe-objects', localPath, libraryMeta?.updatedAt],
    queryFn: () => window.electronAPI.lwe.listObjects(localPath!),
    enabled: !!localPath && lweInstalled,
    staleTime: Infinity,
    retry: false
  })

  const { data: effects = [], isLoading: effectsLoading } = useQuery({
    queryKey: ['lwe-effects', localPath, libraryMeta?.updatedAt],
    queryFn: () => window.electronAPI.lwe.listEffects(localPath!),
    enabled: !!localPath && lweInstalled,
    staleTime: Infinity,
    retry: false
  })
  const disabledEffects = libraryMeta?.disabledEffects ?? []
  const enabledEffects = libraryMeta?.enabledEffects ?? []
  const fogObjects = objects.filter((o) => /fog/i.test(o.name))
  const fogDisabled = fogObjects.length > 0 && fogObjects.every((o) => disabledObjects.includes(o.id))

  const { data: allProperties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: ['lwe-properties', localPath, libraryMeta?.updatedAt],
    queryFn: () => window.electronAPI.lwe.listProperties(localPath!),
    enabled: !!localPath && lweInstalled,
    staleTime: Infinity,
    retry: false
  })
  const properties = allProperties.filter(
    (p) => p.type === 'boolean' || p.type === 'slider' || p.type === 'combo' || p.type === 'usershortcut'
  )
  const propertyOverrides = libraryMeta?.propertyOverrides ?? {}

  const { data: audioObjectProperties = [], isLoading: audioObjectsLoading } = useQuery({
    queryKey: ['lwe-audio-objects', localPath, libraryMeta?.updatedAt],
    queryFn: () => window.electronAPI.lwe.listAudioObjects(localPath!),
    enabled: !!localPath && lweInstalled,
    staleTime: Infinity,
    retry: false
  })
  // sensitivity is per object, which can drive several properties
  const audioObjects: { objectId: string; objectName: string; properties: string[] }[] = []
  for (const p of audioObjectProperties as LweAudioObject[]) {
    const existing = audioObjects.find((o) => o.objectId === p.objectId)
    if (existing) existing.properties.push(p.property)
    else audioObjects.push({ objectId: p.objectId, objectName: p.objectName, properties: [p.property] })
  }
  const audioSensitivity = libraryMeta?.audioSensitivity ?? {}

  const soundObjects = objects.filter((o) => o.type === 'sound')
  const soundVolume = libraryMeta?.soundVolume ?? {}

  const propertyCommits = useKeyedCommits<string>(id, propertyOverrides, (next) =>
    persistAndMaybeRelaunch({ propertyOverrides: next })
  )
  const audioCommits = useKeyedCommits<number>(id, audioSensitivity, (next) =>
    persistAndMaybeRelaunch({ audioSensitivity: next })
  )
  const soundCommits = useKeyedCommits<number>(id, soundVolume, (next) =>
    persistAndMaybeRelaunch({ soundVolume: next })
  )

  const { data: videoDuration = null } = useQuery({
    queryKey: ['video-duration', localPath],
    queryFn: () => window.electronAPI.lwe.videoDuration(localPath!, libraryMeta?.file),
    enabled: !!localPath && libraryMeta?.type === 'video',
    staleTime: Infinity,
    retry: false
  })

  // pushed live when playing, relaunched if the hotswap fails
  async function persistAndMaybeRelaunch(patch: Partial<WallpaperMeta>) {
    const updated = await window.electronAPI.library.update(id, patch)
    queryClient.setQueryData(['library', 'item', id], updated)
    queryClient.invalidateQueries({ queryKey: ['library'] })
    if (isActive) {
      // customArgs and effect overrides can't be hotswapped
      const { ok } = 'customArgs' in patch || 'disabledEffects' in patch || 'enabledEffects' in patch || 'engineFlags' in patch
        ? { ok: false }
        : await window.electronAPI.lwe.hotswapSettings({
            disabledObjects: patch.disabledObjects,
            enabledObjects: patch.enabledObjects,
            volume: patch.volumeOverride,
            xray: 'xrayFullReveal' in patch || 'xrayDisabled' in patch
              ? patch.xrayDisabled ? 'disabled' : patch.xrayFullReveal ? 'full' : 'normal'
              : undefined,
            scaling: patch.scalingMode,
            zoom: patch.zoom,
            offsetX: patch.offsetX,
            offsetY: patch.offsetY,
            disableParallax: patch.disableParallax,
            expandCanvas: patch.expandCanvas,
            repairAssets: patch.repairAssets,
            cornerColor: patch.cornerColor,
            imageAdjustments: patch.imageAdjustments,
            speed: patch.playbackSpeed,
            videoSegments: 'videoSegments' in patch ? (patch.videoSegments ?? []) : undefined,
            propertyOverrides: patch.propertyOverrides,
            audioSensitivity: patch.audioSensitivity,
            soundVolume: patch.soundVolume
          }, localPath)
      if (!ok) {
        for (const screen of activeScreens) await window.electronAPI.wallpaper.apply({ wallpaperId: id, screen })
      }
      queryClient.invalidateQueries({ queryKey: ['screen-assignments'] })
    }
  }

  // for settings that don't touch the running engine
  async function persistOnly(patch: Partial<WallpaperMeta>) {
    const updated = await window.electronAPI.library.update(id, patch)
    queryClient.setQueryData(['library', 'item', id], updated)
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  const livePreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // debounced live push while dragging, the commit on release persists it
  function previewLive(patch: {
    volume?: number
    zoom?: number
    offsetX?: number
    offsetY?: number
    speed?: number
    imageAdjustments?: ImageAdjustments
    videoSegments?: VideoSegment[]
    videoSeek?: number
  }) {
    if (!isActive) return
    if (livePreviewTimer.current) clearTimeout(livePreviewTimer.current)
    livePreviewTimer.current = setTimeout(() => {
      window.electronAPI.lwe.hotswapSettings(patch, localPath)
    }, 80)
  }

  async function toggleObject(objId: string) {
    if (togglingObjectId) return
    const disabled = new Set(disabledObjects)
    const enabled = new Set(enabledObjects)
    if (disabled.has(objId)) {
      disabled.delete(objId)
      enabled.add(objId)
    } else if (enabled.has(objId)) {
      enabled.delete(objId)
    } else {
      disabled.add(objId)
    }
    setTogglingObjectId(objId)
    try {
      await persistAndMaybeRelaunch({ disabledObjects: [...disabled], enabledObjects: [...enabled] })
    } finally {
      setTogglingObjectId(null)
    }
  }

  async function toggleFog() {
    if (togglingFog || fogObjects.length === 0) return
    const disabled = new Set(disabledObjects)
    const enabled = new Set(enabledObjects)
    for (const obj of fogObjects) {
      if (fogDisabled) {
        disabled.delete(obj.id)
      } else {
        disabled.add(obj.id)
        enabled.delete(obj.id)
      }
    }
    setTogglingFog(true)
    try {
      await persistAndMaybeRelaunch({ disabledObjects: [...disabled], enabledObjects: [...enabled] })
    } finally {
      setTogglingFog(false)
    }
  }

  async function toggleEffect(effectId: string) {
    if (togglingEffectId) return
    const disabled = new Set(disabledEffects)
    const enabled = new Set(enabledEffects)
    if (disabled.has(effectId)) {
      disabled.delete(effectId)
      enabled.add(effectId)
    } else if (enabled.has(effectId)) {
      enabled.delete(effectId)
    } else {
      disabled.add(effectId)
    }
    setTogglingEffectId(effectId)
    try {
      await persistAndMaybeRelaunch({ disabledEffects: [...disabled], enabledEffects: [...enabled] })
    } finally {
      setTogglingEffectId(null)
    }
  }

  const [volumeDraft, setVolumeDraft] = useState<number | null>(null)
  const [isCommittingVolume, setIsCommittingVolume] = useState(false)
  const volume = volumeDraft ?? libraryMeta?.volumeOverride ?? 15

  async function commitVolume(v: number) {
    setIsCommittingVolume(true)
    try {
      await persistAndMaybeRelaunch({ volumeOverride: v })
    } finally {
      setVolumeDraft(null)
      setIsCommittingVolume(false)
    }
  }

  const [isCommittingXray, setIsCommittingXray] = useState(false)
  const xrayDisabled = libraryMeta?.xrayDisabled ?? false
  const xrayFullReveal = !xrayDisabled && (libraryMeta?.xrayFullReveal ?? false)

  async function setXray(patch: Pick<WallpaperMeta, 'xrayFullReveal' | 'xrayDisabled'>) {
    if (isCommittingXray) return
    setIsCommittingXray(true)
    try {
      await persistAndMaybeRelaunch(patch)
    } finally {
      setIsCommittingXray(false)
    }
  }

  const [isCommittingScaling, setIsCommittingScaling] = useState(false)
  const scalingMode = libraryMeta?.scalingMode ?? 'default'

  async function commitScaling(mode: ScalingMode) {
    if (isCommittingScaling || mode === scalingMode) return
    setIsCommittingScaling(true)
    try {
      await persistAndMaybeRelaunch({ scalingMode: mode })
    } finally {
      setIsCommittingScaling(false)
    }
  }

  const [zoomDraft, setZoomDraft] = useState<number | null>(null)
  const [isCommittingZoom, setIsCommittingZoom] = useState(false)
  const zoomPercent = zoomDraft ?? Math.round((libraryMeta?.zoom ?? 1) * 100)

  async function commitZoom(percent: number) {
    setIsCommittingZoom(true)
    try {
      await persistAndMaybeRelaunch({ zoom: percent / 100 })
    } finally {
      setZoomDraft(null)
      setIsCommittingZoom(false)
    }
  }

  const [offsetXDraft, setOffsetXDraft] = useState<number | null>(null)
  const [offsetYDraft, setOffsetYDraft] = useState<number | null>(null)
  const [isCommittingOffset, setIsCommittingOffset] = useState(false)
  const offsetX = offsetXDraft ?? libraryMeta?.offsetX ?? 0
  const offsetY = offsetYDraft ?? libraryMeta?.offsetY ?? 0

  async function commitOffset(x: number, y: number) {
    setIsCommittingOffset(true)
    try {
      await persistAndMaybeRelaunch({ offsetX: x, offsetY: y })
    } finally {
      setOffsetXDraft(null)
      setOffsetYDraft(null)
      setIsCommittingOffset(false)
    }
  }

  const [fpsDraft, setFpsDraft] = useState<number | null>(null)
  const [isCommittingFps, setIsCommittingFps] = useState(false)
  const fps = fpsDraft ?? libraryMeta?.fpsOverride ?? null

  // fps can't be hotswapped, so this always relaunches
  async function commitFps(value: number | null) {
    setIsCommittingFps(true)
    try {
      await persistAndMaybeRelaunch({ fpsOverride: value ?? undefined })
    } finally {
      setFpsDraft(null)
      setIsCommittingFps(false)
    }
  }

  const [speedDraft, setSpeedDraft] = useState<number | null>(null)
  const [isCommittingSpeed, setIsCommittingSpeed] = useState(false)
  const speedPercent = speedDraft ?? Math.round((libraryMeta?.playbackSpeed ?? 1) * 100)

  async function commitSpeed(percent: number) {
    setIsCommittingSpeed(true)
    try {
      await persistAndMaybeRelaunch({ playbackSpeed: percent / 100 })
    } finally {
      setSpeedDraft(null)
      setIsCommittingSpeed(false)
    }
  }

  const [isCommittingCornerColor, setIsCommittingCornerColor] = useState(false)
  const cornerColor = libraryMeta?.cornerColor ?? '#000000'

  async function commitCornerColor(color: string) {
    setIsCommittingCornerColor(true)
    try {
      await persistAndMaybeRelaunch({ cornerColor: color })
    } finally {
      setIsCommittingCornerColor(false)
    }
  }

  const [isCommittingParallax, setIsCommittingParallax] = useState(false)
  const disableParallax = libraryMeta?.disableParallax ?? false

  async function toggleParallax() {
    if (isCommittingParallax) return
    setIsCommittingParallax(true)
    try {
      await persistAndMaybeRelaunch({ disableParallax: !disableParallax })
    } finally {
      setIsCommittingParallax(false)
    }
  }

  const [isCommittingExpandCanvas, setIsCommittingExpandCanvas] = useState(false)
  const expandCanvas = libraryMeta?.expandCanvas ?? false

  async function toggleExpandCanvas() {
    if (isCommittingExpandCanvas) return
    setIsCommittingExpandCanvas(true)
    try {
      await persistAndMaybeRelaunch({ expandCanvas: !expandCanvas })
    } finally {
      setIsCommittingExpandCanvas(false)
    }
  }

  const [isCommittingRepairAssets, setIsCommittingRepairAssets] = useState(false)
  const repairAssets = libraryMeta?.repairAssets ?? false

  async function toggleRepairAssets() {
    if (isCommittingRepairAssets) return
    setIsCommittingRepairAssets(true)
    try {
      await persistAndMaybeRelaunch({ repairAssets: !repairAssets })
    } finally {
      setIsCommittingRepairAssets(false)
    }
  }

  const [customArgsDraft, setCustomArgsDraft] = useState<string | null>(null)
  const [isCommittingCustomArgs, setIsCommittingCustomArgs] = useState(false)
  const customArgs = customArgsDraft ?? libraryMeta?.customArgs ?? ''

  async function commitCustomArgs(value: string) {
    if (value === (libraryMeta?.customArgs ?? '')) {
      setCustomArgsDraft(null)
      return
    }
    setIsCommittingCustomArgs(true)
    try {
      await persistAndMaybeRelaunch({ customArgs: value || undefined })
    } finally {
      setCustomArgsDraft(null)
      setIsCommittingCustomArgs(false)
    }
  }

  const typeTag = tags.find((tag) => TYPE_TAGS.has(tag))
  const ageTag = tags.find((tag) => AGE_TAGS.has(tag))
  const resolutionTags = resolutionsFromTags(tags)
  const genreTags = tags.filter(
    (tag) => tag !== typeTag && tag !== ageTag && !canonicalResolutionTag(tag)
  )
  // the on-disk size is exact, Steam's can differ

  const fileSizeLabel = formatFileSize(libraryMeta?.fileSize ?? item?.fileSize ?? localFileSize)

  function handleVote(up: boolean) {
    if (unavailable || (up && isLiked)) return
    void vote(id, up)
  }

  async function handlePlay() {
    if (!canPlay || isApplying) return
    setIsApplying(true)
    try {
      await onPlay(perScreen ? playScreen : undefined)
    } finally {
      setIsApplying(false)
    }
  }

  async function handleUnsubscribe() {
    if (!unsubConfirm) {
      setUnsubConfirm(true)
      return
    }
    setIsUnsubscribing(true)
    try {
      await onUnsubscribe()
    } finally {
      setIsUnsubscribing(false)
      setUnsubConfirm(false)
    }
  }

  return (
    <div className="flex w-80 flex-shrink-0 flex-col overflow-y-auto border-l border-fg/5 bg-pane">
      <div className="relative aspect-video shrink-0 overflow-hidden bg-sunken">
        {previewUrl ? (
          <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-600">{t('card.noPreview')}</div>
        )}
        <button
          onClick={onClose}
          title={t('common.close')}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>

        {creatorSteamId && (
          <button
            onClick={() => {
              onBrowseCreator?.(creatorSteamId)
              onClose()
            }}
            disabled={!onBrowseCreator}
            title={onBrowseCreator ? t('detail.browseCreator') : undefined}
            className="flex items-center gap-2 text-left disabled:cursor-default"
          >
            {author?.avatarUrl ? (
              <img src={author.avatarUrl} alt="" className="h-8 w-8 rounded" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded bg-fg/5 text-gray-500">
                <User size={14} />
              </div>
            )}
            <span className="text-sm text-accent-300 hover:text-accent-200">
              {author?.name ?? '...'}
            </span>
          </button>
        )}

        {item && <StarRating upvotes={item.upvotes} downvotes={item.downvotes} />}

        <div className="flex flex-wrap gap-1.5">
          {typeTag && (
            <span className="rounded bg-fg/5 px-2 py-1 text-xs text-gray-300">
              {tagLabel(typeTag)}
              {fileSizeLabel ? ` · ${fileSizeLabel}` : ''}
            </span>
          )}
          {genreTags.map((tag) => (
            <span key={tag} className="rounded bg-fg/5 px-2 py-1 text-xs text-gray-400">
              {tagLabel(tag)}
            </span>
          ))}
          {resolutionTags.map((tag) => (
            <span key={tag} className="rounded bg-fg/5 px-2 py-1 text-xs text-gray-400">
              {tagLabel(tag)}
            </span>
          ))}
          {ageTag && (
            <span className="rounded bg-fg/5 px-2 py-1 text-xs text-gray-400">{tagLabel(ageTag)}</span>
          )}
        </div>

        {description && (
          <p className="whitespace-pre-line text-xs text-gray-500">{description}</p>
        )}

        {localPath && lweInstalled && (objectsLoading || objects.length > 0) && (
          <div className="border-t border-fg/5 pt-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setLayersOpen((v) => !v)}
                className="flex flex-1 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
              >
                {layersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Layers size={12} />
                <span className="flex-1 text-left">{t('detail.layers')}</span>
                {isActive && (
                  <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                    {t('image.live')}
                  </span>
                )}
                {objectsLoading && <Loader2 size={11} className="animate-spin" />}
              </button>
              {fogObjects.length > 0 && (
                <button
                  onClick={toggleFog}
                  disabled={togglingFog}
                  title={fogDisabled ? t('detail.fogDisabled') : t('detail.fogEnabled')}
                  className={clsx(
                    'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium normal-case transition-colors disabled:opacity-40',
                    fogDisabled ? 'bg-fg/5 text-gray-500' : 'bg-fg/10 text-gray-300 hover:bg-fg/15'
                  )}
                >
                  {togglingFog ? <Loader2 size={10} className="animate-spin" /> : <CloudFog size={10} />}
                  {t('detail.fog')}
                </button>
              )}
            </div>
            {layersOpen && (
              <div className="mt-1.5 space-y-0.5">
                {objects.map((obj) => (
                  <LayerRow
                    key={obj.id}
                    object={obj}
                    state={objectState(obj.id, disabledObjects, enabledObjects)}
                    busy={togglingObjectId === obj.id}
                    onToggle={() => toggleObject(obj.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {localPath && lweInstalled && (effectsLoading || effects.length > 0) && (
          <div className="border-t border-fg/5 pt-3">
            <button
              onClick={() => setEffectsOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
            >
              {effectsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Sparkles size={12} />
              <span className="flex-1 text-left">{t('detail.effects')}</span>
              {effectsLoading && <Loader2 size={11} className="animate-spin" />}
            </button>
            {effectsOpen && (
              <div className="mt-1.5 space-y-0.5">
                {effects.map((fx) => (
                  <EffectRow
                    key={fx.id}
                    effect={fx}
                    state={objectState(fx.id, disabledEffects, enabledEffects)}
                    busy={togglingEffectId === fx.id}
                    onToggle={() => toggleEffect(fx.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-fg/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Maximize size={12} />
              <span className="flex-1 text-left">{t('detail.scaling')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingScaling && <Loader2 size={11} className="animate-spin" />}
            </div>
            <select
              value={scalingMode}
              disabled={isCommittingScaling}
              onChange={(e) => commitScaling(e.target.value as ScalingMode)}
              className="w-full rounded bg-fg/5 px-1.5 py-1 text-xs text-gray-300 outline-none disabled:opacity-50"
            >
              {SCALING_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </option>
              ))}
            </select>
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-fg/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {zoomPercent < 100 ? <ZoomOut size={12} /> : <ZoomIn size={12} />}
              <span className="flex-1 text-left">{t('detail.zoom')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingZoom && <Loader2 size={11} className="animate-spin" />}
              <span className="normal-case text-gray-400">{zoomPercent}%</span>
            </div>
            <input
              type="range"
              min={25}
              max={300}
              step={1}
              value={zoomPercent}
              disabled={isCommittingZoom}
              onChange={(e) => {
                const v = Number(e.target.value)
                setZoomDraft(v)
                previewLive({ zoom: v / 100 })
              }}
              onMouseUp={(e) => commitZoom(Number(e.currentTarget.value))}
              onTouchEnd={(e) => commitZoom(Number(e.currentTarget.value))}
              onKeyUp={(e) => isRangeKey(e.key) && commitZoom(Number(e.currentTarget.value))}
              className="w-full accent-accent-500 disabled:opacity-50"
            />
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-fg/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Move size={12} />
              <span className="flex-1 text-left">{t('detail.position')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingOffset && <Loader2 size={11} className="animate-spin" />}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-12 shrink-0 text-[10px] normal-case text-gray-500">{t('detail.leftRight')}</span>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={Math.round(offsetX * 100)}
                disabled={isCommittingOffset}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100
                  setOffsetXDraft(v)
                  previewLive({ offsetX: v, offsetY })
                }}
                onMouseUp={(e) => commitOffset(Number(e.currentTarget.value) / 100, offsetY)}
                onTouchEnd={(e) => commitOffset(Number(e.currentTarget.value) / 100, offsetY)}
                onKeyUp={(e) => isRangeKey(e.key) && commitOffset(Number(e.currentTarget.value) / 100, offsetY)}
                className="w-full accent-accent-500 disabled:opacity-50"
              />
              <span className="w-8 shrink-0 text-right text-[10px] text-gray-400">
                {Math.round(offsetX * 100)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="w-12 shrink-0 text-[10px] normal-case text-gray-500">{t('detail.upDown')}</span>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={Math.round(offsetY * 100)}
                disabled={isCommittingOffset}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100
                  setOffsetYDraft(v)
                  previewLive({ offsetX, offsetY: v })
                }}
                onMouseUp={(e) => commitOffset(offsetX, Number(e.currentTarget.value) / 100)}
                onTouchEnd={(e) => commitOffset(offsetX, Number(e.currentTarget.value) / 100)}
                onKeyUp={(e) => isRangeKey(e.key) && commitOffset(offsetX, Number(e.currentTarget.value) / 100)}
                className="w-full accent-accent-500 disabled:opacity-50"
              />
              <span className="w-8 shrink-0 text-right text-[10px] text-gray-400">
                {Math.round(offsetY * 100)}
              </span>
            </div>
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-fg/5 pt-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Zap size={12} />
              <span className="flex-1 text-left">{t('detail.fpsLimit')}</span>
              {isCommittingFps && <Loader2 size={11} className="animate-spin" />}
              <input
                type="number"
                min={1}
                max={240}
                step={1}
                placeholder={t('library.fpsDefault')}
                value={fps ?? ''}
                disabled={isCommittingFps}
                onChange={(e) => setFpsDraft(e.target.value === '' ? null : Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                onBlur={(e) => {
                  const raw = e.currentTarget.value.trim()
                  if (raw === '') {
                    commitFps(null)
                    return
                  }
                  const parsed = Number(raw)
                  commitFps(Number.isFinite(parsed) ? Math.min(240, Math.max(1, parsed)) : fps)
                }}
                title={t('detail.fpsHint')}
                className="w-14 rounded bg-fg/5 px-1 py-0.5 text-right normal-case text-gray-400 outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-fg/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Gauge size={12} />
              <span className="flex-1 text-left">{t('detail.playbackSpeed')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingSpeed && <Loader2 size={11} className="animate-spin" />}
              <input
                type="number"
                min={10}
                max={200}
                step={5}
                value={speedPercent}
                disabled={isCommittingSpeed}
                onChange={(e) => setSpeedDraft(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                onBlur={(e) => {
                  const raw = Number(e.currentTarget.value)
                  const clamped = Number.isFinite(raw) ? Math.min(200, Math.max(10, raw)) : speedPercent
                  commitSpeed(clamped)
                }}
                title={t('detail.speedInputHint')}
                className="w-12 rounded bg-fg/5 px-1 py-0.5 text-right normal-case text-gray-400 outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-50"
              />
              <span className="normal-case text-gray-400">%</span>
            </div>
            <input
              type="range"
              min={10}
              max={200}
              step={5}
              value={speedPercent}
              disabled={isCommittingSpeed}
              onChange={(e) => {
                const v = Number(e.target.value)
                setSpeedDraft(v)
                previewLive({ speed: v / 100 })
              }}
              onMouseUp={(e) => commitSpeed(Number(e.currentTarget.value))}
              onTouchEnd={(e) => commitSpeed(Number(e.currentTarget.value))}
              onKeyUp={(e) => isRangeKey(e.key) && commitSpeed(Number(e.currentTarget.value))}
              title={t('detail.speedHint')}
              className="w-full accent-accent-500 disabled:opacity-50"
            />
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type === 'video' && (
          <VideoTrimSection
            segments={videoSegmentsOf(libraryMeta)}
            duration={videoDuration}
            live={isActive}
            onCommit={(segments) =>
              persistAndMaybeRelaunch({ videoSegments: segments, videoStart: undefined, videoEnd: undefined })
            }
            onPreview={(segments, seek) => previewLive({ videoSegments: segments, videoSeek: seek })}
          />
        )}

        {localPath && lweInstalled && (libraryMeta?.type === 'scene' || libraryMeta?.type === 'video') && (
          <ImageAdjustmentsSection
            adjustments={libraryMeta.imageAdjustments}
            live={isActive}
            onCommit={(imageAdjustments) => persistAndMaybeRelaunch({ imageAdjustments })}
            onPreview={(imageAdjustments) => previewLive({ imageAdjustments })}
          />
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-fg/5 pt-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Palette size={12} />
              <span className="flex-1 text-left">{t('detail.cornerColor')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingCornerColor && <Loader2 size={11} className="animate-spin" />}
              <input
                type="color"
                value={cornerColor}
                disabled={isCommittingCornerColor}
                onChange={(e) => commitCornerColor(e.target.value)}
                title={t('detail.cornerColorHint')}
                className="h-5 w-8 shrink-0 cursor-pointer rounded border border-fg/10 bg-transparent p-0 disabled:opacity-50"
              />
            </label>
          </div>
        )}

        {localPath && lweInstalled && (libraryMeta?.type === 'video' || libraryMeta?.type === 'scene') && (
          <div className="border-t border-fg/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
              <span className="flex-1 text-left">{t('playlist.volume')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              <span className="normal-case text-gray-400">{Math.round((volume / 128) * 100)}%</span>
            </div>
            {libraryMeta?.type === 'scene' && (
              <p className="mb-1.5 text-[11px] text-gray-600">
                {t('detail.volumeHint')}
              </p>
            )}
            <input
              type="range"
              min={0}
              max={128}
              value={volume}
              disabled={isCommittingVolume}
              onChange={(e) => {
                const v = Number(e.target.value)
                setVolumeDraft(v)
                previewLive({ volume: v })
              }}
              onMouseUp={(e) => commitVolume(Number(e.currentTarget.value))}
              onTouchEnd={(e) => commitVolume(Number(e.currentTarget.value))}
              onKeyUp={(e) => isRangeKey(e.key) && commitVolume(Number(e.currentTarget.value))}
              className="w-full accent-accent-500 disabled:opacity-50"
            />
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type === 'scene' && (
          <div className="border-t border-fg/5 pt-3">
            <button
              onClick={() => setXray({ xrayFullReveal: !xrayFullReveal, xrayDisabled: false })}
              disabled={isCommittingXray}
              title={t('detail.fullXrayHint')}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 disabled:opacity-40"
            >
              <ScanEye size={12} />
              <span className="flex-1 text-left">{t('detail.fullXray')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingXray ? (
                <Loader2 size={14} className="animate-spin text-gray-500" />
              ) : xrayFullReveal ? (
                <ToggleRight size={14} className="text-accent-400" />
              ) : (
                <ToggleLeft size={14} className="text-gray-600" />
              )}
            </button>
            <button
              onClick={() => setXray({ xrayDisabled: !xrayDisabled, xrayFullReveal: false })}
              disabled={isCommittingXray}
              title={t('detail.disableXrayHint')}
              className="mt-1.5 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 disabled:opacity-40"
            >
              <EyeOff size={12} />
              <span className="flex-1 text-left">{t('detail.disableXray')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingXray ? (
                <Loader2 size={14} className="animate-spin text-gray-500" />
              ) : xrayDisabled ? (
                <ToggleRight size={14} className="text-accent-400" />
              ) : (
                <ToggleLeft size={14} className="text-gray-600" />
              )}
            </button>
            <button
              onClick={toggleParallax}
              disabled={isCommittingParallax}
              title={t('detail.disableParallaxHint')}
              className="mt-1.5 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 disabled:opacity-40"
            >
              <Move3d size={12} />
              <span className="flex-1 text-left">{t('detail.disableParallax')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingParallax ? (
                <Loader2 size={14} className="animate-spin text-gray-500" />
              ) : disableParallax ? (
                <ToggleRight size={14} className="text-accent-400" />
              ) : (
                <ToggleLeft size={14} className="text-gray-600" />
              )}
            </button>
            <button
              onClick={toggleExpandCanvas}
              disabled={isCommittingExpandCanvas}
              title={t('detail.showFullImageHint')}
              className="mt-1.5 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 disabled:opacity-40"
            >
              <Expand size={12} />
              <span className="flex-1 text-left">{t('detail.showFullImage')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingExpandCanvas ? (
                <Loader2 size={14} className="animate-spin text-gray-500" />
              ) : expandCanvas ? (
                <ToggleRight size={14} className="text-accent-400" />
              ) : (
                <ToggleLeft size={14} className="text-gray-600" />
              )}
            </button>
            <button
              onClick={toggleRepairAssets}
              disabled={isCommittingRepairAssets}
              title={t('detail.repairAssetsTitle')}
              className="mt-1.5 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 disabled:opacity-40"
            >
              <Wrench size={12} />
              <span className="flex-1 text-left">{t('detail.repairAssets')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {isCommittingRepairAssets ? (
                <Loader2 size={14} className="animate-spin text-gray-500" />
              ) : repairAssets ? (
                <ToggleRight size={14} className="text-accent-400" />
              ) : (
                <ToggleLeft size={14} className="text-gray-600" />
              )}
            </button>
            <p className="mt-0.5 text-[11px] text-gray-600">
              {t('detail.repairAssetsHint')}
            </p>
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-fg/5 pt-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Terminal size={12} />
              <span className="flex-1 text-left">{t('detail.customArgs')}</span>
              {isCommittingCustomArgs && <Loader2 size={11} className="animate-spin" />}
            </label>
            <p className="mb-1.5 text-[11px] text-gray-600">
              {tn('detail.customArgsHint', { example: <code className="text-gray-500">--render-debug skip-effect=726</code> })}
            </p>
            <input
              type="text"
              spellCheck={false}
              value={customArgs}
              disabled={isCommittingCustomArgs}
              onChange={(e) => setCustomArgsDraft(e.target.value)}
              onBlur={(e) => commitCustomArgs(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              placeholder="--render-debug skip-effect=726"
              className="w-full rounded border border-fg/10 bg-black/30 px-2 py-1 text-xs text-gray-200 placeholder:text-gray-600 focus:border-accent-500/50 focus:outline-none disabled:opacity-50"
            />
          </div>
        )}

        {localPath && lweInstalled && (propertiesLoading || properties.length > 0) && (
          <div className="border-t border-fg/5 pt-3">
            <button
              onClick={() => setPropertiesOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
            >
              {propertiesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <SlidersHorizontal size={12} />
              <span className="flex-1 text-left">{t('detail.properties')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {propertiesLoading && <Loader2 size={11} className="animate-spin" />}
            </button>
            {propertiesOpen && (
              <div className="mt-1.5 space-y-0.5">
                {properties.map((prop) => (
                  <PropertyRow
                    key={prop.name}
                    property={prop}
                    value={propertyCommits.values[prop.name] ?? prop.value}
                    onCommit={(value) => propertyCommits.commit(prop.name, value)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {localPath && lweInstalled && (audioObjectsLoading || audioObjects.length > 0) && (
          <div className="border-t border-fg/5 pt-3">
            <button
              onClick={() => setAudioOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
            >
              {audioOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Music2 size={12} />
              <span className="flex-1 text-left">{t('detail.audioReactivity')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {audioObjectsLoading && <Loader2 size={11} className="animate-spin" />}
            </button>
            {audioOpen && (
              <div className="mt-1.5 space-y-0.5">
                {audioObjects.map((obj) => (
                  <AudioObjectRow
                    key={obj.objectId}
                    objectName={obj.objectName}
                    properties={obj.properties}
                    multiplier={audioCommits.values[obj.objectId] ?? 1}
                    onCommit={(multiplier) => audioCommits.commit(obj.objectId, multiplier)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {localPath && lweInstalled && (objectsLoading || soundObjects.length > 0) && (
          <div className="border-t border-fg/5 pt-3">
            <button
              onClick={() => setSoundTracksOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
            >
              {soundTracksOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Volume2 size={12} />
              <span className="flex-1 text-left">{t('detail.soundTracks')}</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  {t('image.live')}
                </span>
              )}
              {objectsLoading && <Loader2 size={11} className="animate-spin" />}
            </button>
            {soundTracksOpen && (
              <div className="mt-1.5 space-y-0.5">
                {soundObjects.map((obj) => (
                  <SoundTrackRow
                    key={obj.id}
                    trackName={obj.name}
                    volume={soundCommits.values[obj.id] ?? 0}
                    onCommit={(level) => soundCommits.commit(obj.id, level)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {libraryMeta && (
          <>
            {lweInstalled && localPath && (
              <EngineFlagsSection
                flags={libraryMeta.engineFlags}
                onChange={persistAndMaybeRelaunch}
              />
            )}
            <CompatSection
              wallpaper={libraryMeta}
              canTest={lweInstalled && !!localPath}
              onChange={(compat) => persistOnly({ compat })}
              onTest={() => window.electronAPI.wallpaper.testLaunch(id, perScreen ? playScreen : undefined)}
            />
            <ThumbnailSection
              wallpaper={libraryMeta}
              canGenerate={lweInstalled && !!localPath && libraryMeta.type !== 'application'}
              onUpdated={(updated) => {
                queryClient.setQueryData(['library', 'item', id], updated)
                queryClient.invalidateQueries({ queryKey: ['library'] })
              }}
            />
          </>
        )}

        <div className="flex flex-col gap-1.5 border-t border-fg/5 pt-3">
          <div className="flex gap-1.5">
            <button
              onClick={() => handleVote(true)}
              disabled={isLiked || isLiking || isDisliking || unavailable}
              title={unavailable ? t('vote.unavailable') : undefined}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs transition-colors disabled:cursor-not-allowed',
                unavailable
                  ? 'bg-fg/5 text-gray-600 opacity-50'
                  : isLiked
                    ? 'bg-green-600/30 text-green-300'
                    : 'bg-fg/5 text-gray-300 hover:bg-fg/10'
              )}
            >
              {isLiking ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
              {isLiked ? t('vote.liked') : t('vote.like')}
            </button>
            <button
              onClick={() => handleVote(false)}
              disabled={isLiking || isDisliking || unavailable || (isDisliked && !isLiked)}
              title={unavailable ? t('vote.unavailable') : undefined}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs transition-colors disabled:cursor-not-allowed',
                unavailable
                  ? 'bg-fg/5 text-gray-600 opacity-50'
                  : isDisliked && !isLiked
                    ? 'bg-red-600/25 text-red-300'
                    : 'bg-fg/5 text-gray-300 hover:bg-fg/10'
              )}
            >
              {isDisliking ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
              {isDisliked && !isLiked ? t('borders.disliked') : t('vote.dislike')}
            </button>
            {workshopId && (
              <button
                onClick={() => setFavorite(id, favoriteAdd)}
                disabled={isFavoritePending || (unavailable && favoriteAdd)}
                title={
                  favoriteFailure
                    ? t('detail.tryAgain')
                    : isFavorite
                      ? t('favorite.inFavorites')
                      : t('favorite.addToSteam')
                }
                aria-pressed={isFavorite}
                className={clsx(
                  'flex w-9 items-center justify-center rounded-lg py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  favoriteFailure
                    ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                    : isFavorite
                      ? 'bg-pink-500/20 text-pink-300 hover:bg-pink-500/30'
                      : 'bg-fg/5 text-gray-300 hover:bg-fg/10'
                )}
              >
                {isFavoritePending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : favoriteFailure ? (
                  <HeartCrack size={12} />
                ) : (
                  <Heart size={12} fill={isFavorite ? 'currentColor' : 'none'} />
                )}
              </button>
            )}
          </div>
          {workshopId && favoriteFailure && (
            <p className="flex items-start gap-1.5 text-xs text-red-300">
              <HeartCrack size={12} className="mt-0.5 shrink-0" />
              <span>
                {favoriteFailure.message}.{' '}
                <button
                  onClick={() => setFavorite(id, favoriteFailure.add)}
                  disabled={isFavoritePending || (unavailable && favoriteFailure.add)}
                  className="underline underline-offset-2 hover:text-red-200 disabled:opacity-50"
                >
                  {t('detail.tryAgain')}
                </button>
              </span>
            </p>
          )}
          {workshopId && favoriteChecking && !favoriteFailure && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 size={11} className="animate-spin" />
              {t('detail.favoriteChecking')}
            </p>
          )}

          {canPlay && perScreen && (
            <ScreenSelect targets={targets} value={playScreen} onChange={setPlayScreen} title={t('playlist.whichScreen')} />
          )}
          {canPlay && (
            <button
              onClick={handlePlay}
              disabled={isApplying || !lweInstalled}
              title={lweInstalled ? undefined : t('play.installFirst')}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-accent-600 py-1.5 text-xs text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {t('play.wallpaper')}
            </button>
          )}

          {isSubscribed ? (
            <button
              onClick={handleUnsubscribe}
              disabled={isUnsubscribing}
              className={clsx(
                'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs transition-colors',
                unsubConfirm
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-fg/5 text-gray-300 hover:bg-red-500/20 hover:text-red-400'
              )}
            >
              {isUnsubscribing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              {unsubConfirm ? t('detail.clickToConfirm') : t('subscribe.unsubscribe')}
            </button>
          ) : (
            <SidebarButton icon={Download} onClick={onSubscribe}>
              {t('subscribe.subscribe')}
            </SidebarButton>
          )}

          {workshopId && (
            <>
              <SidebarButton icon={MessageCircle} onClick={() => window.electronAPI.steam.openWorkshopItem(id)}>
                {t('detail.comment')}
              </SidebarButton>
              <SidebarButton icon={ExternalLink} onClick={() => openWorkshopPage(id)}>
                {t('menu.openWorkshop')}
              </SidebarButton>
            </>
          )}

          {creatorSteamId && (
            <SidebarButton icon={User} onClick={() => openProfilePage(creatorSteamId)}>
              {t('detail.viewProfile')}
            </SidebarButton>
          )}
        </div>
      </div>
    </div>
  )
}
