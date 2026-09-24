export type WallpaperType = 'scene' | 'video' | 'web' | 'application'

/** Matches linux-wallpaperengine's --scaling choices */
export type ScalingMode = 'default' | 'stretch' | 'fit' | 'fill' | 'center'

export type WallpaperBackend =
  | 'swww'
  | 'swaybg'
  | 'feh'
  | 'xwallpaper'
  | 'gsettings'
  | 'qdbus'
  | 'windows'
  | 'macos'
  | 'auto'

export type WorkshopQueryType =
  | 'RankedByVote'
  | 'RankedByPublicationDate'
  | 'RankedByTrend'
  | 'RankedByTotalUniqueSubscriptions'
  | 'RankedByTextSearch'
  | 'RankedByLastUpdatedDate'

export type ContentRating = 'everyone' | 'questionable' | 'mature' | 'uncategorized'

/** How this process identifies itself to Steam - see config.service.ts getSteamIdentity(). */
export type SteamIdentity = 'wallpaper-engine' | 'standalone'

export interface WallpaperMeta {
  id: string
  title: string
  description?: string
  type: WallpaperType
  contentRating?: ContentRating
  previewUrl?: string
  previewLocal?: string
  localPath?: string
  file?: string
  fileSize?: number
  createdAt: number
  updatedAt: number
  subscribed: boolean
  appliedCount: number
  lastAppliedAt?: number
  authorSteamId?: string
  authorName?: string
  source: 'workshop' | 'local' | 'backup'
  tags: string[]
  /** Steam Workshop resolution tags ("1920 x 1080", "Ultrawide 3440 x 1440", ...), from the live item */
  resolutions?: string[]
  categories: string[]
  downloading?: boolean
  downloadFailed?: boolean
  fpsOverride?: number
  volumeOverride?: number
  /** Forces the "xray" scene effect's reveal spot to cover the whole masked area instead of following the mouse */
  xrayFullReveal?: boolean
  /** How the wallpaper is scaled to fit the screen, applied via linux-wallpaperengine --scaling */
  scalingMode?: ScalingMode
  /** Manual zoom layered on top of scalingMode via linux-wallpaperengine --zoom (1 = no extra zoom) */
  zoom?: number
  /** Re-centers the crop window, each axis in [-1, 1] (0 = centered), via linux-wallpaperengine --offset */
  offsetX?: number
  offsetY?: number
  /** Force-disables the scene's mouse parallax effect via linux-wallpaperengine --disable-parallax */
  disableParallax?: boolean
  /**
   * Grows the scene's render canvas so layers that stick out past the camera (a tall picture only
   * meant to be revealed by parallax) show in full, via linux-wallpaperengine --expand-canvas
   */
  expandCanvas?: boolean
  /**
   * Color shown outside the wallpaper's bounds (Center/Fit letterboxing, zoomed-out scaling) as a
   * "RRGGBB"/"RRGGBBAA" hex string, applied via linux-wallpaperengine --corner-color. Default: black.
   */
  cornerColor?: string
  /**
   * Global playback speed multiplier for animations/particles/effects, applied via
   * linux-wallpaperengine --speed (1 = normal speed, less than 1 = slower)
   */
  playbackSpeed?: number
  backedUp?: boolean
  /** Set by a "check unavailable" scan: true if the item has been removed from the Steam Workshop */
  unavailable?: boolean
  /** Object/layer ids or names to force-hide via linux-wallpaperengine --disable-object */
  disabledObjects?: string[]
  /** Object/layer ids or names to force-show via linux-wallpaperengine --enable-object */
  enabledObjects?: string[]
  /** Effect ids or editor names to force-hide via linux-wallpaperengine --disable-effect */
  disabledEffects?: string[]
  /** Effect ids or editor names to force-show via linux-wallpaperengine --enable-effect */
  enabledEffects?: string[]
  /** Property name -> override value, applied via linux-wallpaperengine --set-property name=value */
  propertyOverrides?: Record<string, string>
  /**
   * Object id -> audio-reactive pulse sensitivity multiplier, applied via linux-wallpaperengine
   * --audio-sensitivity id=multiplier. 0 locks the object (no pulse), 1 is the wallpaper's
   * original authored behavior, >1 exaggerates it. Objects with no entry here use
   * defaultAudioSensitivity from the global config instead.
   */
  audioSensitivity?: Record<string, number>
  /**
   * Sound object id -> volume (0-1), applied live via linux-wallpaperengine's sound-volume
   * hotswap. Independent of the global volume - lets a wallpaper with several alternate music
   * tracks (each its own Sound object) play only one.
   */
  soundVolume?: Record<string, number>
  /**
   * Extra linux-wallpaperengine arguments appended verbatim to the launch, e.g. `--render-debug skip-effect=726`.
   * Launch-time only, so changing this always restarts the process.
   */
  customArgs?: string
  /** Launch-only engine flags, each one unset here falls back to the global setting */
  engineFlags?: EngineFlags
  compat?: WallpaperCompat
  /** Thumbnail made by the app (a screenshot of the running wallpaper, or an image the user picked) */
  customPreview?: string
  /** Show the Workshop/project preview even though a custom one exists */
  useOriginalPreview?: boolean
}

export type FullscreenPauseMode = 'default' | 'off' | 'active-only'

/** linux-wallpaperengine flags that only take effect on a fresh launch */
export interface EngineFlags {
  disableParticles?: boolean
  disableMouse?: boolean
  disableAnimations?: boolean
  noAudioProcessing?: boolean
  fullscreenPause?: FullscreenPauseMode
  automute?: boolean
  silent?: boolean
}

export interface EngineFlagPreset {
  id: string
  name: string
  flags: EngineFlags
  /** Applied as the default FPS (globally) or the FPS override (per wallpaper); undefined leaves it alone */
  fps?: number | null
  builtIn?: boolean
}

export type CrashPhase = 'launch' | 'hotswap' | 'runtime'

export interface WallpaperCrash {
  at: number
  phase: CrashPhase
  screen: string
  log: string[]
}

export interface WallpaperCompat {
  /** The engine died right after this wallpaper was hot-swapped in */
  hotswapCrash?: boolean
  /** Outcome of the last fresh launch that was watched for a crash */
  freshLaunch?: 'ok' | 'crash'
  runtimeCrashes?: number
  lastCrash?: WallpaperCrash
  note?: string
}

export type CompatStatus = 'ok' | 'crashes' | 'hotswap-only' | 'hotswap-untested' | 'unstable'

export interface CrashEvent {
  wallpaperId: string
  title: string
  screen: string
  phase: CrashPhase
  /** What the app did about it, for the toast */
  outcome: string
}

/** '*' is the one engine process covering every screen */
export type ScreenTarget = string

export type DisplayMode = 'shared' | 'per-screen'

export interface ScreenAssignment {
  screen: ScreenTarget
  wallpaperId: string
}

export type ScheduleAction =
  | { type: 'wallpaper'; wallpaperId: string }
  | { type: 'playlist'; playlistId: string }
  | { type: 'stop' }

export type ScheduleTrigger =
  | { type: 'time'; time: string; days: number[] }
  | { type: 'theme'; theme: 'dark' | 'light' }

export interface ScheduleRule {
  id: string
  name: string
  enabled: boolean
  trigger: ScheduleTrigger
  action: ScheduleAction
  /** Screen name in per-screen mode, '*' for every screen */
  screen: ScreenTarget
}

export interface LweSceneObject {
  id: string
  name: string
  type: 'image' | 'particle' | 'text' | 'sound' | 'unknown'
}

/** One effect (bloom, blur, glow, etc) attached to an object, as reported by --list-effects */
export interface LweSceneEffect {
  id: string
  /** Effect's name for the editor, e.g. "Bloom" - not necessarily unique across objects */
  name: string
  objectId: string
  objectName: string
  /** The effect asset's own category, e.g. "Blur/Sharpen" - empty if the wallpaper doesn't set one */
  group: string
}

/** One audio-reactive script property on a scene object, as reported by --list-audio-objects */
export interface LweAudioObject {
  objectId: string
  objectName: string
  /** The scripted property driving the pulse, e.g. "scale" or "alpha" */
  property: string
  minvalue: number
  maxvalue: number
  frequency: number
  smoothing: number
}

export interface LweProperty {
  name: string
  type:
    | 'slider'
    | 'boolean'
    | 'color'
    | 'combo'
    | 'text'
    | 'scene-texture'
    | 'file'
    | 'textinput'
    | 'usershortcut'
    | 'unknown'
  text?: string
  value: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
}

export interface DesktopApplication {
  name: string
  file: string
}

export interface WorkshopAuthorInfo {
  steamId: string
  name: string
  avatarUrl: string
}

export interface WorkshopItem {
  publishedFileId: string
  title: string
  description: string
  previewUrl: string
  creatorSteamId: string
  tags: string[]
  timeCreated: number
  timeUpdated: number
  subscriptions: number
  upvotes: number
  downvotes: number
  isSubscribed: boolean
  /** Size in bytes as reported by the Steam Workshop (same figure shown on the item's Steam page); undefined if unavailable. */
  fileSize?: number
}

export interface WorkshopQueryParams {
  appId?: number
  searchText?: string
  tags?: string[]
  excludedTags?: string[]
  queryType?: WorkshopQueryType
  page?: number
}

export interface WorkshopQueryResult {
  items: WorkshopItem[]
  page: number
  totalResults: number
}

export interface CreatorWorkshopQueryParams {
  searchText?: string
  tags?: string[]
  excludedTags?: string[]
  queryType?: WorkshopQueryType
  page?: number
}

export interface ApplyWallpaperOptions {
  wallpaperId: string
  /** Per-screen mode only: a screen name, or '*' for every screen */
  screen?: ScreenTarget
  backend?: WallpaperBackend
}

export interface DownloadProgressEvent {
  itemId: string
  bytesDownloaded: number
  bytesTotal: number
  percentage: number
  status: 'downloading' | 'completed' | 'error'
}

export interface LibraryFilters {
  tags?: string[]
  categories?: string[]
  type?: WallpaperType
  contentRating?: ContentRating
  searchText?: string
  sortBy?: 'title' | 'createdAt' | 'updatedAt' | 'lastApplied' | 'appliedCount' | 'fileSize'
  sortDir?: 'asc' | 'desc'
}

export interface WallpaperFolder {
  id: string
  title: string
  items: string[] // workshop IDs
}

export interface WallpaperEnvironment {
  displayServer: 'wayland' | 'x11' | 'unknown'
  desktopEnv: 'gnome' | 'kde' | 'hyprland' | 'sway' | 'other'
  availableBackends: WallpaperBackend[]
  recommendedBackend: WallpaperBackend
  linuxWallpaperEngine: LweStatus
}

export interface LweStatus {
  installed: boolean
  path?: string
  version?: string
}

export type LinuxDistro = 'fedora' | 'arch' | 'debian' | 'unknown'

export interface LweInstallProgress {
  stage: 'installing-deps' | 'cloning' | 'building' | 'installing' | 'done' | 'error'
  message: string
  percentage: number
}

export interface BackupProgressEvent {
  itemId: string
  bytesCopied: number
  bytesTotal: number
  percentage: number
  status: 'copying' | 'verifying' | 'completed' | 'error'
  message?: string
}

export interface PlaylistItem {
  wallpaperId: string
  /** 0-100, overrides the playlist's defaultVolume when set */
  volume?: number
  /** Overrides the playlist's defaultDurationSec when set */
  durationSec?: number
}

export interface PlaylistSettings {
  /** Shuffle playback order; reshuffled every time the playlist loops back to the start */
  randomize: boolean
  /** Base ordering when randomize is off; 'manual' respects PlaylistItem[] order */
  sortBy: 'manual' | 'title' | 'createdAt'
  /** How long each wallpaper plays before advancing, in seconds */
  defaultDurationSec: number
  /** Video wallpapers longer than their duration play to the end once before advancing */
  finishVideos?: boolean
  /** 0-100, used for items without a per-item volume override */
  defaultVolume: number
}

export interface Playlist {
  id: string
  title: string
  items: PlaylistItem[]
  settings: PlaylistSettings
  createdAt: number
  updatedAt: number
}

export interface PlaylistPlaybackState {
  screen: ScreenTarget
  playlistId: string | null
  currentItemId: string | null
  currentIndex: number
  isPlaying: boolean
  order: string[]
}
