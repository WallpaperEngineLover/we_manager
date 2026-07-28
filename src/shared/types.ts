export type WallpaperType = 'scene' | 'video' | 'web' | 'application'

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
  backedUp?: boolean
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
