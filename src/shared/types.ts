import type { ImageAdjustments } from './imageAdjustments'
import type { VideoSegment } from './videoTrim'
import type { DesktopEnvironment } from './desktop'

export type { ImageAdjustments } from './imageAdjustments'

export type WallpaperType = 'scene' | 'video' | 'web' | 'application'

export type XrayMode = 'normal' | 'full' | 'disabled'

/** Matches linux-wallpaperengine's --scaling choices */
export type ScalingMode = 'default' | 'stretch' | 'fit' | 'fill' | 'center'

export type WallpaperBackend =
  | 'swww'
  | 'hyprpaper'
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

export interface LedSettings {
  enabled: boolean
  server: string
  /** percent, 100 leaves the colors as they are */
  brightness: number
  boost: boolean
  reduceFps: boolean
}

/** See getSteamIdentity() */
export type SteamIdentity = 'wallpaper-engine' | 'standalone'

export interface ExtraLibrary {
  path: string
  name: string
}

export type VerifyProblem =
  | 'notInstalled'
  | 'needsUpdate'
  | 'missingFolder'
  | 'brokenProject'
  | 'missingMainFile'
  | 'missingData'
  | 'missingDependency'

export interface VerifyProgressEvent {
  done: number
  total: number
}

export interface VerifyResult {
  checked: number
  skipped: number
  damaged: string[]
}

export interface RepairResult {
  /** rechecked in the background once finished */
  started: number
  failed: number
}

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
  /** Workshop resolution tags, e.g. "Ultrawide 3440 x 1440" */
  resolutions?: string[]
  categories: string[]
  downloading?: boolean
  downloadFailed?: boolean
  fpsOverride?: number
  volumeOverride?: number
  /** xray reveal covers the whole mask instead of following the mouse */
  xrayFullReveal?: boolean
  xrayDisabled?: boolean
  /** --scaling */
  scalingMode?: ScalingMode
  /** --zoom on top of scalingMode, 1 = none */
  zoom?: number
  /** --offset, each axis in [-1, 1] */
  offsetX?: number
  offsetY?: number
  /** --disable-parallax */
  disableParallax?: boolean
  /** --expand-canvas: shows layers that stick out past the camera */
  expandCanvas?: boolean
  /** --repair-assets: loads what broken wallpapers meant, e.g. a texture named "" */
  repairAssets?: boolean
  /** --corner-color, "RRGGBB"/"RRGGBBAA" outside the wallpaper's bounds */
  cornerColor?: string
  /** WE's image filter, color options and flip (scene and video) */
  imageAdjustments?: ImageAdjustments
  /** --speed, 1 = normal */
  playbackSpeed?: number
  /** --video-segments parts, empty plays the whole video */
  videoSegments?: VideoSegment[]
  /** Old single loop range, read through videoSegmentsOf */
  videoStart?: number
  videoEnd?: number
  backedUp?: boolean
  backupDir?: string
  /** The workshop copy no longer matches the backup */
  backupOutdated?: boolean
  /** Removed from the Workshop, set by the unavailable check */
  unavailable?: boolean
  /** Set by "Verify files", cleared once it checks out */
  verifyProblem?: VerifyProblem
  /** --disable-object ids or names */
  disabledObjects?: string[]
  /** --enable-object ids or names */
  enabledObjects?: string[]
  /** --disable-effect ids or names */
  disabledEffects?: string[]
  /** --enable-effect ids or names */
  enabledEffects?: string[]
  /** --set-property name=value */
  propertyOverrides?: Record<string, string>
  /** --audio-sensitivity id=multiplier, 0 = no pulse, 1 = as authored */
  audioSensitivity?: Record<string, number>
  /** Sound object id -> volume (0-1), independent of the global volume */
  soundVolume?: Record<string, number>
  /** Extra launch arguments, changing them always restarts the engine */
  customArgs?: string
  /** Unset flags fall back to the global setting */
  engineFlags?: EngineFlags
  compat?: WallpaperCompat
  /** Scene with general.hdr on, or a PQ/HLG video. Unset until detected */
  hdr?: boolean
  /** Scene with a spatialized sound object. Unset until detected */
  hrtf?: boolean
  customPreview?: string
  useOriginalPreview?: boolean
}

export type FullscreenPauseMode = 'default' | 'off' | 'active-only'

/** "ultra" turns on HDR for scenes that ask for it */
export type PostProcessingQuality = 'enabled' | 'ultra'

export type LightingQuality = 'disabled' | 'low' | 'medium' | 'high' | 'ultra'

/** Only scenes with 3D models use it */
export type MsaaQuality = 'none' | 'x2' | 'x4' | 'x8'

/** Per axis */
export type SsaaQuality = 'none' | 'x2' | 'x3' | 'x4'

export type HwdecBackend = 'auto' | 'no' | 'vaapi' | 'vaapi-copy' | 'nvdec' | 'nvdec-copy' | 'vulkan'

/** How web wallpapers hand their frames to the engine: shared GPU buffers or a copy through memory */
export type WebFramesMode = 'auto' | 'shm' | 'dmabuf'

export type FrameLimiter = 'budget' | 'fixed'

/** auto = while the default output is headphones */
export type HrtfMode = 'auto' | 'on' | 'off'

export type TransitionMode = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'wipe-left' | 'wipe-right' | 'zoom'

/** --transition-duration in milliseconds */
export type TransitionDuration = '300' | '600' | '1000' | '1500' | '2500'

/** FPS limit on battery, off = same as plugged in */
export type BatteryFps = 'off' | 'pause' | '10' | '15' | '20' | '30'

/** Minutes without input before wallpapers pause */
export type IdlePause = 'off' | '1' | '5' | '10' | '15' | '30'

export interface EngineFlags {
  disableParticles?: boolean
  noDesktopIcons?: boolean
  disableMouse?: boolean
  disableAnimations?: boolean
  noAudioProcessing?: boolean
  fullscreenPause?: FullscreenPauseMode
  /** --pause-on-focus, WE's "Other application focused: Pause" */
  pauseOnFocus?: boolean
  /** --pause-on-maximized, wlroots only (KDE and GNOME always pause) */
  pauseOnMaximized?: boolean
  automute?: boolean
  silent?: boolean
  hdr?: boolean
  postProcessing?: PostProcessingQuality
  volumetrics?: LightingQuality
  shadows?: LightingQuality
  msaa?: MsaaQuality
  ssaa?: SsaaQuality
  hwdec?: HwdecBackend
  /** --web-frames, applies when the web wallpaper starts */
  webFrames?: WebFramesMode
  frameLimiter?: FrameLimiter
  hrtf?: HrtfMode
  transition?: TransitionMode
  transitionDuration?: TransitionDuration
  /** --fps-battery / --pause-on-battery */
  batteryFps?: BatteryFps
  /** --idle-pause */
  idlePause?: IdlePause
  /** --window sized like the first screen instead of --screen-root, global only */
  windowed?: boolean
  /** --window --window-background: that window acts as the desktop background, global only */
  windowBackground?: boolean
  /** --layer background; key kept for stored configs */
  kdeBackgroundLayer?: boolean
}

export interface EngineFlagPreset {
  id: string
  name: string
  flags: EngineFlags
  /** undefined leaves the FPS alone */
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
  hotswapCrash?: boolean
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
  outcome: string
}

/** '*' = one engine for every screen */
export type ScreenTarget = string

export type DisplayMode = 'shared' | 'per-screen'

export interface ScreenAssignment {
  screen: ScreenTarget
  wallpaperId: string
}

/** How the slots of a split screen share it, see the engine's --split-layout */
export type SplitLayout = 'aspect' | 'equal' | 'center'

export interface SplitSlot {
  wallpaperId: string
  /** this slot's --scaling, the wallpaper's own when unset */
  scalingMode?: ScalingMode
}

/** --screen-slot, per-screen display mode only */
export interface SplitScreen {
  layout: SplitLayout
  slots: SplitSlot[]
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
  screen: ScreenTarget
}

export interface LweSceneObject {
  id: string
  name: string
  type: 'image' | 'particle' | 'text' | 'sound' | 'unknown'
}

/** From --list-effects */
export interface LweSceneEffect {
  id: string
  /** Not unique across objects */
  name: string
  objectId: string
  objectName: string
  /** e.g. "Blur/Sharpen", may be empty */
  group: string
}

export interface LweFontNeed {
  kind: 'font' | 'emoji'
  family: string
  /** installed, a metric compatible clone stands in (compatible), or something else does (missing) */
  status: 'installed' | 'compatible' | 'missing'
  using: string
  objects: string[]
}

export interface UserFont {
  name: string
  size: number
}

/** From --list-audio-objects */
export interface LweAudioObject {
  objectId: string
  objectName: string
  /** e.g. "scale" or "alpha" */
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
  /** Bytes, as on the item's Steam page */
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
  screen?: ScreenTarget
  backend?: WallpaperBackend
}

// write failed, or Steam's favorites list never showed it
export interface FavoriteFailure {
  add: boolean
  message: string
  readBack: boolean
}

export interface FavoriteStatus {
  failed: Record<string, FavoriteFailure>
  // written, not yet in the favorites list
  checking: string[]
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
  items: string[]
}

export interface WallpaperEnvironment {
  displayServer: 'wayland' | 'x11' | 'unknown'
  desktopEnv: DesktopEnvironment
  availableBackends: WallpaperBackend[]
  recommendedBackend: WallpaperBackend
  linuxWallpaperEngine: LweStatus
}

/** The engine's GNOME Shell extension (GNOME Wayland only) */
export interface GnomeExtensionStatus {
  needed: boolean
  state: 'not-needed' | 'active' | 'outdated' | 'needs-relogin' | 'disabled' | 'not-installed' | 'error'
  bundled?: boolean
  bundledVersion?: string
  installedVersion?: string
  detail?: string
  /** Flatpak: manual host commands if the button fails */
  flatpakCommands?: string[]
}

export interface LweStatus {
  installed: boolean
  path?: string
  version?: string
  /** A package manager owns the binary, it can't be uninstalled here */
  managedBy?: string
}

export interface DesktopIconsStatus {
  enabled: boolean
  problem?: 'not-kde' | 'not-wayland' | 'missing-lib' | 'unavailable-distro' | 'missing-modules' | 'failed'
  detail?: string
  command?: string
}

export type LinuxDistro = 'fedora' | 'arch' | 'debian' | 'suse' | 'unknown'

/** Which prebuilt release archive fits this machine, or why none does */
export interface LwePrebuiltTarget {
  supported: boolean
  /** Release asset name */
  asset?: string
  label?: string
  reason?: string
  /** The engine comes with the app (Flatpak) */
  managed?: boolean
}

export interface LweInstallProgress {
  stage: 'installing-deps' | 'downloading' | 'cloning' | 'building' | 'installing' | 'done' | 'error'
  message: string
  percentage: number
}

export interface UpdateChecks {
  app: boolean
  engine: boolean
}

export type UpdateTarget = keyof UpdateChecks

export type AppInstallKind = 'appimage' | 'deb' | 'flatpak' | 'pacman' | 'rpm' | 'source' | 'unknown'

/** package: package manager or Nix, build: source or unknown, bundled: the Flatpak's */
export type EngineInstallKind = 'prebuilt' | 'package' | 'build' | 'bundled'

export interface AvailableUpdate {
  version: string
  /** null when unknown */
  current: string | null
  notes: string
  url: string
  publishedAt: string
}

export interface ReleaseChoice {
  tag: string
  publishedAt: string
  prerelease: boolean
}

export interface AppUpdateProgress {
  stage: 'downloading' | 'installing' | 'ready' | 'error'
  percentage: number
  /** Release tag being installed, so a notice for another version ignores it */
  version?: string
  message?: string
}

export interface UpdateStatus {
  checks: UpdateChecks | null
  checking: boolean
  checkedAt: number | null
  checked: UpdateChecks
  error: string | null
  appVersion: string
  appInstall: AppInstallKind
  app: AvailableUpdate | null
  appProgress: AppUpdateProgress | null
  engineInstall: EngineInstallKind | null
  engineManagedBy?: string
  /** Installed engine version when known (prebuilt tag, package version) */
  engineVersion: string | null
  engine: AvailableUpdate | null
  /** "Don't notify me again", kept in the config */
  dismissed: Partial<Record<UpdateTarget, string>>
  /** Closed with the X, back after the next start */
  snoozed: Partial<Record<UpdateTarget, string>>
}

export interface BackupProgressEvent {
  itemId: string
  bytesCopied: number
  bytesTotal: number
  percentage: number
  status: 'copying' | 'verifying' | 'completed' | 'error'
  message?: string
  /** Plain backup when unset */
  action?: 'backup' | 'copy' | 'move'
}

export interface PlaylistItem {
  wallpaperId: string
  /** 0-100, overrides the playlist's defaultVolume when set */
  volume?: number
  /** Overrides the playlist's defaultDurationSec when set */
  durationSec?: number
}

export interface PlaylistSettings {
  /** Reshuffled on every loop */
  randomize: boolean
  /** Used when randomize is off */
  sortBy: 'manual' | 'title' | 'createdAt'
  /** Seconds per wallpaper */
  defaultDurationSec: number
  /** Longer videos play to the end before advancing */
  finishVideos?: boolean
  /** Only Steam favorites, everything when none is */
  favoritesOnly?: boolean
  /** 0-100 */

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

/** Why wallpapers would be drawn on the CPU, shown as a notice */
export interface GraphicsWarning {
  kind: 'software' | 'flatpak-nvidia'
  /** the renderer the engine reported */
  renderer?: string
  /** flatpak-nvidia: the NVIDIA GL extension for the host's driver, when the version could be read */
  extension?: string
}
