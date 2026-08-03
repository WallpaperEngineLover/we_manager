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
  /** Force-disables the scene's mouse parallax effect via linux-wallpaperengine --disable-parallax */
  disableParallax?: boolean
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
  /** Property name -> override value, applied via linux-wallpaperengine --set-property name=value */
  propertyOverrides?: Record<string, string>
  /**
   * Object id -> audio-reactive pulse sensitivity multiplier, applied via linux-wallpaperengine
   * --audio-sensitivity id=multiplier. 0 locks the object (no pulse), 1 is the wallpaper's
   * original authored behavior, >1 exaggerates it. Objects with no entry here use
   * defaultAudioSensitivity from the global config instead.
   */
  audioSensitivity?: Record<string, number>
}

export interface LweSceneObject {
  id: string
  name: string
  type: 'image' | 'particle' | 'text' | 'sound' | 'unknown'
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
  type: 'slider' | 'boolean' | 'color' | 'combo' | 'text' | 'scene-texture' | 'file' | 'textinput' | 'unknown'
  text?: string
  value: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
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
  displayIndex?: number
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
  status: 'copying' | 'completed' | 'error'
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
  playlistId: string | null
  currentItemId: string | null
  currentIndex: number
  isPlaying: boolean
  order: string[]
}
