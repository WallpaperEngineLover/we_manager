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

export type ContentRating = 'everyone' | 'questionable' | 'mature'

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
  source: 'workshop' | 'local'
  tags: string[]
  categories: string[]
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
}
