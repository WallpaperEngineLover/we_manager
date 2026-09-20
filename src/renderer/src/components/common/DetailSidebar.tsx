import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Star,
  ThumbsUp,
  ThumbsDown,
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
  Palette,
  Gauge,
  Zap,
  Music2,
  Terminal,
  Sparkles,
  CloudFog
} from 'lucide-react'
import clsx from 'clsx'
import { openWorkshopPage, openProfilePage, isWorkshopId } from '../../utils/steam'
import { WE_TYPES, WE_AGE_RATINGS, WE_RESOLUTION_GROUPS } from '../../constants/weFilters'
import { formatFileSize } from '../../utils/format'
import { useToast } from './Toast'
import type {
  LweSceneObject,
  LweSceneEffect,
  LweProperty,
  LweAudioObject,
  WallpaperMeta,
  ScalingMode
} from '@shared/types'

const SCALING_MODE_OPTIONS: { value: ScalingMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'fill', label: 'Fill (crop to fit)' },
  { value: 'fit', label: 'Fit (letterbox)' },
  { value: 'center', label: 'Center (native size)' }
]

const TYPE_TAGS = new Set(WE_TYPES.map((i) => i.tag))
const AGE_TAGS = new Set(WE_AGE_RATINGS.map((i) => i.tag))
const RESOLUTION_TAGS = new Set(WE_RESOLUTION_GROUPS.flatMap((g) => g.items.map((i) => i.tag)))

function StarRating({ upvotes, downvotes }: { upvotes: number; downvotes: number }) {
  const total = upvotes + downvotes
  if (total === 0) return <p className="text-xs text-gray-600">No ratings yet</p>
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
        {Math.round(fraction * 100)}% ({total.toLocaleString()})
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
          ? 'Visible (default) - click to hide'
          : state === 'hidden'
            ? 'Hidden - click to force visible'
            : 'Forced visible - click to reset to default'
      }
      className={clsx(
        'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-white/5 disabled:opacity-40',
        state === 'hidden' ? 'text-gray-600' : 'text-gray-300'
      )}
    >
      {state === 'hidden' ? (
        <EyeOff size={12} className="shrink-0 text-gray-600" />
      ) : state === 'forced' ? (
        <Pin size={12} className="shrink-0 text-indigo-400" />
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
          ? 'Visible (default) - click to disable'
          : state === 'hidden'
            ? 'Disabled - click to force visible'
            : 'Forced visible - click to reset to default'
      }
      className={clsx(
        'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-white/5 disabled:opacity-40',
        state === 'hidden' ? 'text-gray-600' : 'text-gray-300'
      )}
    >
      {state === 'hidden' ? (
        <EyeOff size={12} className="shrink-0 text-gray-600" />
      ) : state === 'forced' ? (
        <Pin size={12} className="shrink-0 text-indigo-400" />
      ) : (
        <Eye size={12} className="shrink-0 text-gray-500" />
      )}
      <span className={clsx('flex-1 truncate', state === 'hidden' && 'line-through')}>
        {effect.name}
      </span>
      <span className="shrink-0 truncate text-gray-600" title={effect.objectName}>
        on {effect.objectName}
      </span>
    </button>
  )
}

// Only booleans/sliders/combos are user-facing toggles in the WE customize UI - color/
// text/file/scene-texture/textinput properties are left out of the sidebar entirely.
function PropertyRow({
  property,
  value,
  busy,
  onCommit
}: {
  property: LweProperty
  value: string
  busy: boolean
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const label = property.text || property.name

  if (property.type === 'boolean') {
    const on = value === '1' || value === 'true'
    return (
      <button
        onClick={() => onCommit(on ? '0' : '1')}
        disabled={busy}
        title={property.name}
        className={clsx(
          'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-white/5 disabled:opacity-40',
          on ? 'text-gray-200' : 'text-gray-500'
        )}
      >
        {on ? (
          <ToggleRight size={14} className="shrink-0 text-indigo-400" />
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
          disabled={busy}
          onChange={(e) => setDraft(Number(e.target.value))}
          onMouseUp={(e) => { onCommit(e.currentTarget.value); setDraft(null) }}
          onTouchEnd={(e) => { onCommit(e.currentTarget.value); setDraft(null) }}
          onKeyUp={(e) => { onCommit(e.currentTarget.value); setDraft(null) }}
          className="w-full accent-indigo-500 disabled:opacity-50"
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
          disabled={busy}
          onChange={(e) => onCommit(e.target.value)}
          className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-gray-300 outline-none disabled:opacity-50 [&>option]:bg-[#1a1a1a]"
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

// One row per unique object id detected as audio-reactive (an object can drive more than one
// property, e.g. both scale and alpha, from the same sensitivity control - properties is just
// shown as a hint). 0% locks the object (no pulse), 100% is the wallpaper's authored behavior,
// up to 200% exaggerates it.
function AudioObjectRow({
  objectName,
  properties,
  multiplier,
  busy,
  onCommit
}: {
  objectName: string
  properties: string[]
  multiplier: number
  busy: boolean
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
        disabled={busy}
        onChange={(e) => setDraft(Number(e.target.value))}
        onMouseUp={(e) => { onCommit(Number(e.currentTarget.value) / 100); setDraft(null) }}
        onTouchEnd={(e) => { onCommit(Number(e.currentTarget.value) / 100); setDraft(null) }}
        onKeyUp={(e) => { onCommit(Number(e.currentTarget.value) / 100); setDraft(null) }}
        className="w-full accent-indigo-500 disabled:opacity-50"
      />
    </div>
  )
}

// One row per Sound object (e.g. an alternate music track) - volume is independent per track, so
// muting all but one (or blending several) is just a matter of where each slider sits, applied
// live without a wallpaper reload.
function SoundTrackRow({
  trackName,
  volume,
  busy,
  onCommit
}: {
  trackName: string
  volume: number
  busy: boolean
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
        disabled={busy}
        onChange={(e) => setDraft(Number(e.target.value))}
        onMouseUp={(e) => { onCommit(Number(e.currentTarget.value)); setDraft(null) }}
        onTouchEnd={(e) => { onCommit(Number(e.currentTarget.value)); setDraft(null) }}
        onKeyUp={(e) => { onCommit(Number(e.currentTarget.value)); setDraft(null) }}
        className="w-full accent-indigo-500 disabled:opacity-50"
      />
    </div>
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
  isLiked: boolean
  canPlay: boolean
  lweInstalled: boolean
  onClose: () => void
  onSubscribe: () => void
  onUnsubscribe: () => void | Promise<void>
  onLiked: () => void
  onPlay: () => void | Promise<void>
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
  isLiked,
  canPlay,
  lweInstalled,
  onClose,
  onSubscribe,
  onUnsubscribe,
  onLiked,
  onPlay,
  onBrowseCreator
}: DetailSidebarProps) {
  const workshopId = isWorkshopId(id)
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [isLiking, setIsLiking] = useState(false)
  const [isDisliking, setIsDisliking] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [unsubConfirm, setUnsubConfirm] = useState(false)
  const [isUnsubscribing, setIsUnsubscribing] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [togglingObjectId, setTogglingObjectId] = useState<string | null>(null)
  const [effectsOpen, setEffectsOpen] = useState(false)
  const [togglingEffectId, setTogglingEffectId] = useState<string | null>(null)
  const [togglingFog, setTogglingFog] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [committingProperty, setCommittingProperty] = useState<string | null>(null)
  const [audioOpen, setAudioOpen] = useState(false)
  const [committingAudioObjectId, setCommittingAudioObjectId] = useState<string | null>(null)
  const [soundTracksOpen, setSoundTracksOpen] = useState(false)
  const [committingSoundObjectId, setCommittingSoundObjectId] = useState<string | null>(null)

  const { data: item } = useQuery({
    queryKey: ['workshop-detail', id],
    queryFn: () => window.electronAPI.workshop.getItem(id),
    enabled: workshopId,
    staleTime: 60_000
  })

  const title = item?.title ?? fallbackTitle
  const previewUrl = item?.previewUrl ?? fallbackPreviewUrl
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
    queryKey: ['library-item', id],
    queryFn: () => window.electronAPI.library.getOne(id)
  })
  const localPath = libraryMeta?.localPath
  const disabledObjects = libraryMeta?.disabledObjects ?? []
  const enabledObjects = libraryMeta?.enabledObjects ?? []
  // item resolves to exactly null (not undefined) once a workshop lookup confirms the id no
  // longer exists on Steam - voting on it would just fail, so treat it like the library's own
  // "unavailable" flag and grey out the vote buttons below.
  const unavailable = !!libraryMeta?.unavailable || item === null

  const { data: activeWallpaper } = useQuery({
    queryKey: ['active-wallpaper'],
    queryFn: () => window.electronAPI.wallpaper.getActive(),
    staleTime: 5_000
  })
  const isActive = activeWallpaper?.id === id

  const { data: objects = [], isLoading: objectsLoading } = useQuery({
    queryKey: ['lwe-objects', localPath],
    queryFn: () => window.electronAPI.lwe.listObjects(localPath!),
    enabled: !!localPath && lweInstalled,
    staleTime: Infinity,
    retry: false
  })

  const { data: effects = [], isLoading: effectsLoading } = useQuery({
    queryKey: ['lwe-effects', localPath],
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
    queryKey: ['lwe-properties', localPath],
    queryFn: () => window.electronAPI.lwe.listProperties(localPath!),
    enabled: !!localPath && lweInstalled,
    staleTime: Infinity,
    retry: false
  })
  // Only these types have an actual editable control in the WE customize UI
  const properties = allProperties.filter(
    (p) => p.type === 'boolean' || p.type === 'slider' || p.type === 'combo'
  )
  const propertyOverrides = libraryMeta?.propertyOverrides ?? {}

  const { data: audioObjectProperties = [], isLoading: audioObjectsLoading } = useQuery({
    queryKey: ['lwe-audio-objects', localPath],
    queryFn: () => window.electronAPI.lwe.listAudioObjects(localPath!),
    enabled: !!localPath && lweInstalled,
    staleTime: Infinity,
    retry: false
  })
  // An object can drive more than one audio-reactive property (e.g. scale and alpha) - the
  // sensitivity control is per-object, so group by objectId and show one row per object.
  const audioObjects: { objectId: string; objectName: string; properties: string[] }[] = []
  for (const p of audioObjectProperties as LweAudioObject[]) {
    const existing = audioObjects.find((o) => o.objectId === p.objectId)
    if (existing) existing.properties.push(p.property)
    else audioObjects.push({ objectId: p.objectId, objectName: p.objectName, properties: [p.property] })
  }
  const audioSensitivity = libraryMeta?.audioSensitivity ?? {}

  // Sound objects (e.g. alternate music tracks) are already in the objects list fetched for the
  // Layers section above - no separate query needed, just filter by type.
  const soundObjects = objects.filter((o) => o.type === 'sound')
  const soundVolume = libraryMeta?.soundVolume ?? {}

  // Persists a settings patch and, if this wallpaper is currently playing, pushes it live via
  // the control-file hotswap (no process restart). Falls back to a full stop+relaunch if the
  // push fails, e.g. an older linux-wallpaperengine build without the extended protocol.
  async function persistAndMaybeRelaunch(patch: Partial<WallpaperMeta>) {
    const updated = await window.electronAPI.library.update(id, patch)
    queryClient.setQueryData(['library-item', id], updated)
    queryClient.invalidateQueries({ queryKey: ['library'] })
    if (isActive) {
      // customArgs and effect overrides have no hotswap control-file key, so they always force a restart
      const { ok } = 'customArgs' in patch || 'disabledEffects' in patch || 'enabledEffects' in patch
        ? { ok: false }
        : await window.electronAPI.lwe.hotswapSettings({
            disabledObjects: patch.disabledObjects,
            enabledObjects: patch.enabledObjects,
            volume: patch.volumeOverride,
            xray: patch.xrayFullReveal,
            scaling: patch.scalingMode,
            zoom: patch.zoom,
            offsetX: patch.offsetX,
            offsetY: patch.offsetY,
            disableParallax: patch.disableParallax,
            cornerColor: patch.cornerColor,
            speed: patch.playbackSpeed,
            propertyOverrides: patch.propertyOverrides,
            audioSensitivity: patch.audioSensitivity,
            soundVolume: patch.soundVolume
          })
      if (!ok) {
        await window.electronAPI.lwe.stop()
        await window.electronAPI.wallpaper.apply({ wallpaperId: id })
      }
      queryClient.invalidateQueries({ queryKey: ['active-wallpaper'] })
    }
  }

  const livePreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pushes a value live while a slider is being dragged, debounced so a fast drag doesn't flood
  // the control-file/SIGUSR1 channel. Doesn't touch the library store - mouseup/touchend/keyup
  // still do that persisted commit, which also re-pushes the final value.
  function previewLive(patch: {
    volume?: number
    zoom?: number
    offsetX?: number
    offsetY?: number
    speed?: number
  }) {
    if (!isActive) return
    if (livePreviewTimer.current) clearTimeout(livePreviewTimer.current)
    livePreviewTimer.current = setTimeout(() => {
      window.electronAPI.lwe.hotswapSettings(patch)
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

  async function commitProperty(name: string, value: string) {
    if (committingProperty) return
    setCommittingProperty(name)
    try {
      await persistAndMaybeRelaunch({ propertyOverrides: { ...propertyOverrides, [name]: value } })
    } finally {
      setCommittingProperty(null)
    }
  }

  async function commitAudioSensitivity(objectId: string, multiplier: number) {
    if (committingAudioObjectId) return
    setCommittingAudioObjectId(objectId)
    try {
      await persistAndMaybeRelaunch({ audioSensitivity: { ...audioSensitivity, [objectId]: multiplier } })
    } finally {
      setCommittingAudioObjectId(null)
    }
  }

  async function commitSoundVolume(objectId: string, volume: number) {
    if (committingSoundObjectId) return
    setCommittingSoundObjectId(objectId)
    try {
      await persistAndMaybeRelaunch({ soundVolume: { ...soundVolume, [objectId]: volume } })
    } finally {
      setCommittingSoundObjectId(null)
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
  const xrayFullReveal = libraryMeta?.xrayFullReveal ?? false

  async function toggleXray() {
    if (isCommittingXray) return
    setIsCommittingXray(true)
    try {
      await persistAndMaybeRelaunch({ xrayFullReveal: !xrayFullReveal })
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

  // fps isn't part of hotswapSettings' payload, so persistAndMaybeRelaunch's hotswap push is
  // always a no-op for this patch and it falls through to its stop+relaunch fallback - correct
  // here, since the FPS cap is baked into the render loop and can't be changed live.
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

  const typeTag = tags.find((t) => TYPE_TAGS.has(t))
  const ageTag = tags.find((t) => AGE_TAGS.has(t))
  const resolutionTags = tags.filter((t) => RESOLUTION_TAGS.has(t))
  const genreTags = tags.filter(
    (t) => t !== typeTag && t !== ageTag && !resolutionTags.includes(t)
  )
  // Prefer the real on-disk size for an already-downloaded item over Steam's reported upload
  // size (item.fileSize) - they can differ once extracted, and the local number is exact.
  const fileSizeLabel = formatFileSize(libraryMeta?.fileSize ?? item?.fileSize ?? localFileSize)

  async function handleLike() {
    if (isLiked || isLiking || unavailable) return
    setIsLiking(true)
    try {
      const { confirmed } = await window.electronAPI.steam.vote(id, true)
      if (confirmed) {
        onLiked()
      } else {
        showToast('Could not confirm the like on Steam - try again')
      }
    } catch (err) {
      showToast((err as Error).message)
    } finally {
      setIsLiking(false)
    }
  }

  async function handleDislike() {
    if (isDisliking || unavailable) return
    setIsDisliking(true)
    try {
      const { confirmed } = await window.electronAPI.steam.vote(id, false)
      if (!confirmed) showToast('Could not confirm the dislike on Steam - try again')
    } catch (err) {
      showToast((err as Error).message)
    } finally {
      setIsDisliking(false)
    }
  }

  async function handlePlay() {
    if (!canPlay || isApplying) return
    setIsApplying(true)
    try {
      await onPlay()
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
    <div className="flex w-80 flex-shrink-0 flex-col overflow-y-auto border-l border-white/5 bg-[#0d0d0d]">
      <div className="relative aspect-video shrink-0 overflow-hidden bg-[#111]">
        {previewUrl ? (
          <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-600">No preview</div>
        )}
        <button
          onClick={onClose}
          title="Close"
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
            title={onBrowseCreator ? "Browse this creator's wallpapers" : undefined}
            className="flex items-center gap-2 text-left disabled:cursor-default"
          >
            {author?.avatarUrl ? (
              <img src={author.avatarUrl} alt="" className="h-8 w-8 rounded" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded bg-white/5 text-gray-500">
                <User size={14} />
              </div>
            )}
            <span className="text-sm text-indigo-300 hover:text-indigo-200">
              {author?.name ?? '...'}
            </span>
          </button>
        )}

        {item && <StarRating upvotes={item.upvotes} downvotes={item.downvotes} />}

        <div className="flex flex-wrap gap-1.5">
          {typeTag && (
            <span className="rounded bg-white/5 px-2 py-1 text-xs text-gray-300">
              {typeTag}
              {fileSizeLabel ? ` · ${fileSizeLabel}` : ''}
            </span>
          )}
          {genreTags.map((tag) => (
            <span key={tag} className="rounded bg-white/5 px-2 py-1 text-xs text-gray-400">
              {tag}
            </span>
          ))}
          {resolutionTags.map((tag) => (
            <span key={tag} className="rounded bg-white/5 px-2 py-1 text-xs text-gray-400">
              {tag}
            </span>
          ))}
          {ageTag && (
            <span className="rounded bg-white/5 px-2 py-1 text-xs text-gray-400">{ageTag}</span>
          )}
        </div>

        {description && (
          <p className="whitespace-pre-line text-xs text-gray-500">{description}</p>
        )}

        {localPath && lweInstalled && (objectsLoading || objects.length > 0) && (
          <div className="border-t border-white/5 pt-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setLayersOpen((v) => !v)}
                className="flex flex-1 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
              >
                {layersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Layers size={12} />
                <span className="flex-1 text-left">Layers</span>
                {isActive && (
                  <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                    live
                  </span>
                )}
                {objectsLoading && <Loader2 size={11} className="animate-spin" />}
              </button>
              {fogObjects.length > 0 && (
                <button
                  onClick={toggleFog}
                  disabled={togglingFog}
                  title={fogDisabled ? 'Fog disabled - click to re-enable' : 'Click to disable fog'}
                  className={clsx(
                    'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium normal-case transition-colors disabled:opacity-40',
                    fogDisabled ? 'bg-white/5 text-gray-500' : 'bg-white/10 text-gray-300 hover:bg-white/15'
                  )}
                >
                  {togglingFog ? <Loader2 size={10} className="animate-spin" /> : <CloudFog size={10} />}
                  Fog
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
          <div className="border-t border-white/5 pt-3">
            <button
              onClick={() => setEffectsOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
            >
              {effectsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Sparkles size={12} />
              <span className="flex-1 text-left">Effects</span>
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
          <div className="border-t border-white/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Maximize size={12} />
              <span className="flex-1 text-left">Scaling</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
                </span>
              )}
              {isCommittingScaling && <Loader2 size={11} className="animate-spin" />}
            </div>
            <select
              value={scalingMode}
              disabled={isCommittingScaling}
              onChange={(e) => commitScaling(e.target.value as ScalingMode)}
              className="w-full rounded bg-white/5 px-1.5 py-1 text-xs text-gray-300 outline-none disabled:opacity-50 [&>option]:bg-[#1a1a1a]"
            >
              {SCALING_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-white/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {zoomPercent < 100 ? <ZoomOut size={12} /> : <ZoomIn size={12} />}
              <span className="flex-1 text-left">Zoom</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
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
              onKeyUp={(e) => commitZoom(Number(e.currentTarget.value))}
              className="w-full accent-indigo-500 disabled:opacity-50"
            />
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-white/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Move size={12} />
              <span className="flex-1 text-left">Position</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
                </span>
              )}
              {isCommittingOffset && <Loader2 size={11} className="animate-spin" />}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-12 shrink-0 text-[10px] normal-case text-gray-500">Left/Right</span>
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
                onKeyUp={(e) => commitOffset(Number(e.currentTarget.value) / 100, offsetY)}
                className="w-full accent-indigo-500 disabled:opacity-50"
              />
              <span className="w-8 shrink-0 text-right text-[10px] text-gray-400">
                {Math.round(offsetX * 100)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="w-12 shrink-0 text-[10px] normal-case text-gray-500">Up/Down</span>
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
                onKeyUp={(e) => commitOffset(offsetX, Number(e.currentTarget.value) / 100)}
                className="w-full accent-indigo-500 disabled:opacity-50"
              />
              <span className="w-8 shrink-0 text-right text-[10px] text-gray-400">
                {Math.round(offsetY * 100)}
              </span>
            </div>
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-white/5 pt-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Zap size={12} />
              <span className="flex-1 text-left">FPS limit</span>
              {isCommittingFps && <Loader2 size={11} className="animate-spin" />}
              <input
                type="number"
                min={1}
                max={240}
                step={1}
                placeholder="default"
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
                title="Overrides the app-wide default FPS for this wallpaper only - changes require a relaunch, not live. Empty = use the default."
                className="w-14 rounded bg-white/5 px-1 py-0.5 text-right normal-case text-gray-400 outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-white/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Gauge size={12} />
              <span className="flex-1 text-left">Playback speed</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
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
                title="Type an exact speed percentage - applies on Enter or clicking away"
                className="w-12 rounded bg-white/5 px-1 py-0.5 text-right normal-case text-gray-400 outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
              onKeyUp={(e) => commitSpeed(Number(e.currentTarget.value))}
              title="Slows down or speeds up particles, animated effects and scripts (100% = normal speed)"
              className="w-full accent-indigo-500 disabled:opacity-50"
            />
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-white/5 pt-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Palette size={12} />
              <span className="flex-1 text-left">Corner color</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
                </span>
              )}
              {isCommittingCornerColor && <Loader2 size={11} className="animate-spin" />}
              <input
                type="color"
                value={cornerColor}
                disabled={isCommittingCornerColor}
                onChange={(e) => commitCornerColor(e.target.value)}
                title="Color shown outside the wallpaper's bounds (letterboxing / zoomed-out scaling)"
                className="h-5 w-8 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0 disabled:opacity-50"
              />
            </label>
          </div>
        )}

        {localPath && lweInstalled && (libraryMeta?.type === 'video' || libraryMeta?.type === 'scene') && (
          <div className="border-t border-white/5 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
              <span className="flex-1 text-left">Volume</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
                </span>
              )}
              <span className="normal-case text-gray-400">{Math.round((volume / 128) * 100)}%</span>
            </div>
            {libraryMeta?.type === 'scene' && (
              <p className="mb-1.5 text-[11px] text-gray-600">
                Controls this scene's sound objects. Overridden while Settings &rarr; Ambient
                wallpaper volume is set.
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
              onKeyUp={(e) => commitVolume(Number(e.currentTarget.value))}
              className="w-full accent-indigo-500 disabled:opacity-50"
            />
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type === 'scene' && (
          <div className="border-t border-white/5 pt-3">
            <button
              onClick={toggleXray}
              disabled={isCommittingXray}
              title="Force the xray effect's reveal spot to cover the whole scene instead of following the mouse"
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 disabled:opacity-40"
            >
              <ScanEye size={12} />
              <span className="flex-1 text-left">Full x-ray</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
                </span>
              )}
              {isCommittingXray ? (
                <Loader2 size={14} className="animate-spin text-gray-500" />
              ) : xrayFullReveal ? (
                <ToggleRight size={14} className="text-indigo-400" />
              ) : (
                <ToggleLeft size={14} className="text-gray-600" />
              )}
            </button>
            <button
              onClick={toggleParallax}
              disabled={isCommittingParallax}
              title="Force-disable the mouse parallax effect on this wallpaper's layers"
              className="mt-1.5 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 disabled:opacity-40"
            >
              <Move3d size={12} />
              <span className="flex-1 text-left">Disable parallax</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
                </span>
              )}
              {isCommittingParallax ? (
                <Loader2 size={14} className="animate-spin text-gray-500" />
              ) : disableParallax ? (
                <ToggleRight size={14} className="text-indigo-400" />
              ) : (
                <ToggleLeft size={14} className="text-gray-600" />
              )}
            </button>
          </div>
        )}

        {localPath && lweInstalled && libraryMeta?.type && libraryMeta.type !== 'application' && (
          <div className="border-t border-white/5 pt-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Terminal size={12} />
              <span className="flex-1 text-left">Custom launch arguments</span>
              {isCommittingCustomArgs && <Loader2 size={11} className="animate-spin" />}
            </label>
            <p className="mb-1.5 text-[11px] text-gray-600">
              Extra linux-wallpaperengine flags for this wallpaper only, e.g.{' '}
              <code className="text-gray-500">--render-debug skip-effect=726</code>. Applying a
              change always restarts the wallpaper if it's playing.
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
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-gray-200 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none disabled:opacity-50"
            />
          </div>
        )}

        {localPath && lweInstalled && (propertiesLoading || properties.length > 0) && (
          <div className="border-t border-white/5 pt-3">
            <button
              onClick={() => setPropertiesOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
            >
              {propertiesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <SlidersHorizontal size={12} />
              <span className="flex-1 text-left">Properties</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
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
                    value={propertyOverrides[prop.name] ?? prop.value}
                    busy={committingProperty === prop.name}
                    onCommit={(value) => commitProperty(prop.name, value)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {localPath && lweInstalled && (audioObjectsLoading || audioObjects.length > 0) && (
          <div className="border-t border-white/5 pt-3">
            <button
              onClick={() => setAudioOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
            >
              {audioOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Music2 size={12} />
              <span className="flex-1 text-left">Audio Reactivity</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
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
                    multiplier={audioSensitivity[obj.objectId] ?? 1}
                    busy={committingAudioObjectId === obj.objectId}
                    onCommit={(multiplier) => commitAudioSensitivity(obj.objectId, multiplier)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {localPath && lweInstalled && (objectsLoading || soundObjects.length > 0) && (
          <div className="border-t border-white/5 pt-3">
            <button
              onClick={() => setSoundTracksOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
            >
              {soundTracksOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Volume2 size={12} />
              <span className="flex-1 text-left">Sound Tracks</span>
              {isActive && (
                <span className="rounded-full bg-green-600/30 px-1.5 normal-case text-green-300">
                  live
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
                    volume={soundVolume[obj.id] ?? 0}
                    busy={committingSoundObjectId === obj.id}
                    onCommit={(volume) => commitSoundVolume(obj.id, volume)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
          <div className="flex gap-1.5">
            <button
              onClick={handleLike}
              disabled={isLiked || isLiking || unavailable}
              title={unavailable ? 'Removed from the Steam Workshop - voting is no longer possible' : undefined}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs transition-colors disabled:cursor-not-allowed',
                unavailable
                  ? 'bg-white/5 text-gray-600 opacity-50'
                  : isLiked
                    ? 'bg-green-600/30 text-green-300'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
              )}
            >
              {isLiking ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
              {isLiked ? 'Liked' : 'Like'}
            </button>
            <button
              onClick={handleDislike}
              disabled={isDisliking || unavailable}
              title={unavailable ? 'Removed from the Steam Workshop - voting is no longer possible' : undefined}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs transition-colors disabled:cursor-not-allowed',
                unavailable ? 'bg-white/5 text-gray-600 opacity-50' : 'bg-white/5 text-gray-300 hover:bg-white/10'
              )}
            >
              {isDisliking ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
              Dislike
            </button>
          </div>

          {canPlay && (
            <button
              onClick={handlePlay}
              disabled={isApplying || !lweInstalled}
              title={lweInstalled ? undefined : 'Install linux-wallpaperengine in Settings first'}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-1.5 text-xs text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Play wallpaper
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
                  : 'bg-white/5 text-gray-300 hover:bg-red-500/20 hover:text-red-400'
              )}
            >
              {isUnsubscribing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              {unsubConfirm ? 'Click again to confirm' : 'Unsubscribe'}
            </button>
          ) : (
            <button
              onClick={onSubscribe}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10"
            >
              <Download size={12} />
              Subscribe
            </button>
          )}

          {workshopId && (
            <>
              <button
                onClick={() => window.electronAPI.steam.openWorkshopItem(id)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10"
              >
                <MessageCircle size={12} />
                Comment
              </button>
              <button
                onClick={() => openWorkshopPage(id)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10"
              >
                <ExternalLink size={12} />
                Open in Steam Workshop
              </button>
            </>
          )}

          {creatorSteamId && (
            <button
              onClick={() => openProfilePage(creatorSteamId)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10"
            >
              <User size={12} />
              View creator's Steam profile
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
