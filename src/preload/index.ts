import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'
import type {
  WorkshopQueryParams,
  WorkshopQueryResult,
  WorkshopItem,
  CreatorWorkshopQueryParams,
  WallpaperMeta,
  WallpaperFolder,
  LibraryFilters,
  WorkshopAuthorInfo,
  ApplyWallpaperOptions,
  DownloadProgressEvent,
  WallpaperEnvironment,
  LweStatus,
  LweInstallProgress,
  LinuxDistro,
  LweSceneObject,
  LweProperty,
  LweAudioObject,
  LweSceneEffect,
  DesktopApplication,
  BackupProgressEvent,
  Playlist,
  PlaylistSettings,
  PlaylistPlaybackState,
  SteamIdentity,
  EngineFlags,
  EngineFlagPreset,
  DisplayMode,
  ScreenTarget,
  ScreenAssignment,
  ScheduleRule,
  CrashEvent
} from '../shared/types'

const api = {
  workshop: {
    query: (params: WorkshopQueryParams): Promise<WorkshopQueryResult> =>
      ipcRenderer.invoke(IpcChannels.WORKSHOP_QUERY, params),
    getItem: (publishedFileId: string): Promise<WorkshopItem | null> =>
      ipcRenderer.invoke(IpcChannels.WORKSHOP_GET_ITEM, publishedFileId),
    queryByCreator: (
      creatorSteamId: string,
      params?: CreatorWorkshopQueryParams
    ): Promise<WorkshopQueryResult> =>
      ipcRenderer.invoke(IpcChannels.WORKSHOP_QUERY_BY_CREATOR, creatorSteamId, params)
  },

  steam: {
    isRunning: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.STEAM_IS_RUNNING),
    subscribe: (itemId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.STEAM_SUBSCRIBE, itemId),
    unsubscribe: (itemId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.STEAM_UNSUBSCRIBE, itemId),
    redownload: (itemId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.STEAM_REDOWNLOAD, itemId),
    getSubscribedItems: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.STEAM_GET_SUBSCRIBED),
    downloadInfo: (itemId: string): Promise<DownloadProgressEvent | null> =>
      ipcRenderer.invoke(IpcChannels.STEAM_DOWNLOAD_INFO, itemId),
    itemState: (itemId: string): Promise<number> =>
      ipcRenderer.invoke(IpcChannels.STEAM_ITEM_STATE, itemId),
    vote: (itemId: string, voteUp: boolean): Promise<{ ok: boolean; confirmed: boolean }> =>
      ipcRenderer.invoke(IpcChannels.STEAM_VOTE, itemId, voteUp),
    openWorkshopItem: (itemId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.STEAM_OPEN_WORKSHOP, itemId),
    getVotedIds: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.STEAM_GET_VOTED_IDS),
    getFailedVotes: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke(IpcChannels.STEAM_GET_FAILED_VOTES),
    checkVote: (itemId: string): Promise<boolean | null> =>
      ipcRenderer.invoke(IpcChannels.STEAM_CHECK_VOTE, itemId),
    getAuthorInfo: (steamId: string): Promise<WorkshopAuthorInfo | null> =>
      ipcRenderer.invoke(IpcChannels.STEAM_GET_AUTHOR_INFO, steamId)
  },

  library: {
    getAll: (filters?: LibraryFilters): Promise<WallpaperMeta[]> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_GET_ALL, filters),
    getOne: (id: string): Promise<WallpaperMeta | null> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_GET_ONE, id),
    update: (id: string, patch: Partial<WallpaperMeta>): Promise<WallpaperMeta | null> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_UPDATE, id, patch),
    delete: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_DELETE, id),
    addTag: (id: string, tag: string): Promise<WallpaperMeta | null> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_ADD_TAG, id, tag),
    removeTag: (id: string, tag: string): Promise<WallpaperMeta | null> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_REMOVE_TAG, id, tag),
    getTags: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.LIBRARY_GET_TAGS),
    search: (query: string): Promise<WallpaperMeta[]> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_SEARCH, query),
    scan: (): Promise<{ imported: number; skipped: number; removed: number }> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_SCAN),
    distinctTags: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_DISTINCT_TAGS),
    resetFpsOverrides: (): Promise<{ count: number }> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_RESET_FPS_OVERRIDES),
    checkUnavailable: (): Promise<{ checked: number; unavailable: number; changed: boolean }> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_CHECK_UNAVAILABLE)
  },

  config: {
    get: (): Promise<{
      workshopPath: string | null
      defaultWorkshopPath: string
      isConfigured: boolean
      defaultFps: number | null
      recommendedFpsEnabled: boolean
      recommendedWebFpsEnabled: boolean
      lweRepoUrl: string | null
      lweRepoBranch: string | null
      lweCmakeArgs: string | null
      defaultLweRepoUrl: string
      backupPath: string | null
      isBackupConfigured: boolean
      autoUnsubscribeAfterBackup: boolean
      trayEnabled: boolean
      autostartSupported: boolean
      autostartEnabled: boolean
      autostartMinimized: boolean
      autostartPlaylistId: string | null
      killLweOnQuit: boolean
      voteBorders: boolean
      audioScreen: string | null
      ambientVolume: number | null
      defaultAudioSensitivity: number
      disablePuppetAnimation: boolean
      disableAnimations: boolean
      steamIdentity: SteamIdentity
      ignoredCreators: string[]
      engineFlags: EngineFlags
      engineFlagPresets: EngineFlagPreset[]
      displayMode: DisplayMode
    }> => ipcRenderer.invoke(IpcChannels.CONFIG_GET),
    setEngineFlags: (flags: EngineFlags): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_ENGINE_FLAGS, flags),
    setEnginePresets: (presets: EngineFlagPreset[]): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_ENGINE_PRESETS, presets),
    setDisplayMode: (mode: DisplayMode): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_DISPLAY_MODE, mode),
    setWorkshopPath: (p: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_WORKSHOP_PATH, p),
    setDefaultFps: (fps: number | null): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_DEFAULT_FPS, fps),
    setRecommendedFpsEnabled: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_RECOMMENDED_FPS, enabled),
    setRecommendedWebFpsEnabled: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_RECOMMENDED_WEB_FPS, enabled),
    setLweRepo: (url: string | null, branch: string | null): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_LWE_REPO, url, branch),
    setLweCmakeArgs: (args: string | null): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_LWE_CMAKE_ARGS, args),
    setBackupPath: (p: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_BACKUP_PATH, p),
    setAutoUnsubscribeAfterBackup: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_AUTO_UNSUBSCRIBE, enabled),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_PICK_FOLDER),
    pickFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_PICK_FILE),
    importWE: (sourcePath: string): Promise<{ folders: number; playlists: number; configPath: string }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_IMPORT_WE, sourcePath),
    createFresh: (): Promise<{ configPath: string }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_CREATE_FRESH),
    setTrayEnabled: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_TRAY_ENABLED, enabled),
    setKillLweOnQuit: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_KILL_LWE_ON_QUIT, enabled),
    setVoteBorders: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_VOTE_BORDERS, enabled),
    setAutostart: (
      enabled: boolean,
      minimized: boolean,
      playlistId: string | null
    ): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_AUTOSTART, enabled, minimized, playlistId),
    getAutostartSupported: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_GET_AUTOSTART_SUPPORTED),
    setAudioScreen: (screen: string | null): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_AUDIO_SCREEN, screen),
    setAmbientVolume: (volume: number | null): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_AMBIENT_VOLUME, volume),
    setDefaultAudioSensitivity: (multiplier: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_DEFAULT_AUDIO_SENSITIVITY, multiplier),
    setDisablePuppetAnimation: (disabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_DISABLE_PUPPET_ANIMATION, disabled),
    setSteamIdentity: (identity: SteamIdentity): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_STEAM_IDENTITY, identity),
    ignoreCreator: (steamId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_IGNORE_CREATOR, steamId),
    unignoreCreator: (steamId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_UNIGNORE_CREATOR, steamId)
  },

  playlist: {
    getAll: (): Promise<Playlist[]> => ipcRenderer.invoke(IpcChannels.PLAYLIST_GET_ALL),
    getOne: (id: string): Promise<Playlist | null> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_GET_ONE, id),
    create: (title: string): Promise<Playlist> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_CREATE, title),
    rename: (id: string, title: string): Promise<Playlist | null> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_RENAME, id, title),
    delete: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_DELETE, id),
    updateSettings: (id: string, patch: Partial<PlaylistSettings>): Promise<Playlist | null> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_UPDATE_SETTINGS, id, patch),
    addItems: (id: string, wallpaperIds: string[]): Promise<Playlist | null> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_ADD_ITEMS, id, wallpaperIds),
    removeItems: (id: string, wallpaperIds: string[]): Promise<Playlist | null> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_REMOVE_ITEMS, id, wallpaperIds),
    reorderItems: (id: string, orderedWallpaperIds: string[]): Promise<Playlist | null> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_REORDER_ITEMS, id, orderedWallpaperIds),
    updateItem: (
      id: string,
      wallpaperId: string,
      patch: { volume?: number; durationSec?: number }
    ): Promise<Playlist | null> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_UPDATE_ITEM, id, wallpaperId, patch),
    start: (id: string, screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_START, id, screen),
    playItem: (id: string, wallpaperId: string, screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_PLAY_ITEM, id, wallpaperId, screen),
    stop: (screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_STOP, screen),
    pause: (screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_PAUSE, screen),
    resume: (screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_RESUME, screen),
    next: (screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_NEXT, screen),
    previous: (screen?: ScreenTarget): Promise<PlaylistPlaybackState[]> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_PREVIOUS, screen),
    getState: (): Promise<PlaylistPlaybackState[]> =>
      ipcRenderer.invoke(IpcChannels.PLAYLIST_GET_STATE)
  },

  folders: {
    getAll: (): Promise<WallpaperFolder[]> =>
      ipcRenderer.invoke(IpcChannels.FOLDERS_GET_ALL),
    create: (title: string): Promise<WallpaperFolder> =>
      ipcRenderer.invoke(IpcChannels.FOLDERS_CREATE, title),
    rename: (id: string, title: string): Promise<WallpaperFolder | null> =>
      ipcRenderer.invoke(IpcChannels.FOLDERS_RENAME, id, title),
    delete: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.FOLDERS_DELETE, id),
    addItems: (folderId: string, itemIds: string[]): Promise<WallpaperFolder | null> =>
      ipcRenderer.invoke(IpcChannels.FOLDERS_ADD_ITEMS, folderId, itemIds),
    removeItems: (folderId: string, itemIds: string[]): Promise<WallpaperFolder | null> =>
      ipcRenderer.invoke(IpcChannels.FOLDERS_REMOVE_ITEMS, folderId, itemIds),
    importWEConfig: (configPath: string): Promise<{ folders: number; playlists: number }> =>
      ipcRenderer.invoke(IpcChannels.FOLDERS_IMPORT_WE_CONFIG, configPath),
    cleanup: (): Promise<{ removed: number }> =>
      ipcRenderer.invoke(IpcChannels.FOLDERS_CLEANUP)
  },

  wallpaper: {
    apply: (options: ApplyWallpaperOptions): Promise<{ ok: boolean; appliedPath: string }> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_APPLY, options),
    getActive: (): Promise<WallpaperMeta | null> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_GET_ACTIVE),
    getAssignments: (): Promise<ScreenAssignment[]> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_GET_ASSIGNMENTS),
    getTargets: (): Promise<ScreenTarget[]> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_GET_TARGETS),
    stop: (screen?: ScreenTarget): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_STOP, screen),
    testLaunch: (wallpaperId: string, screen?: ScreenTarget): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_TEST_LAUNCH, wallpaperId, screen),
    generateThumbnail: (wallpaperId: string): Promise<WallpaperMeta> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_GENERATE_THUMBNAIL, wallpaperId),
    pickThumbnail: (wallpaperId: string): Promise<WallpaperMeta | null> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_PICK_THUMBNAIL, wallpaperId),
    deleteThumbnail: (wallpaperId: string): Promise<WallpaperMeta> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_DELETE_THUMBNAIL, wallpaperId),
    detectEnvironment: (): Promise<WallpaperEnvironment> =>
      ipcRenderer.invoke(IpcChannels.WALLPAPER_DETECT_ENV)
  },

  lwe: {
    status: (): Promise<LweStatus> =>
      ipcRenderer.invoke(IpcChannels.LWE_STATUS),
    detectDistro: (): Promise<LinuxDistro> =>
      ipcRenderer.invoke(IpcChannels.LWE_DETECT_DISTRO),
    installDeps: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.LWE_INSTALL_DEPS),
    install: (): Promise<LweStatus> =>
      ipcRenderer.invoke(IpcChannels.LWE_INSTALL),
    uninstall: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.LWE_UNINSTALL),
    launch: (wallpaperPath: string, options?: { screen?: ScreenTarget; fps?: number }): Promise<{ ok: boolean; running: boolean }> =>
      ipcRenderer.invoke(IpcChannels.LWE_LAUNCH, wallpaperPath, options),
    stop: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.LWE_STOP),
    killAll: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.LWE_KILL_ALL),
    listObjects: (wallpaperPath: string): Promise<LweSceneObject[]> =>
      ipcRenderer.invoke(IpcChannels.LWE_LIST_OBJECTS, wallpaperPath),
    hotswapSettings: (options: {
      disabledObjects?: string[]
      enabledObjects?: string[]
      volume?: number
      xray?: boolean
      scaling?: string
      zoom?: number
      offsetX?: number
      offsetY?: number
      disableParallax?: boolean
      expandCanvas?: boolean
      cornerColor?: string
      speed?: number
      propertyOverrides?: Record<string, string>
      audioScreen?: string
      ambientVolume?: number
      audioSensitivity?: Record<string, number>
      soundVolume?: Record<string, number>
    }, wallpaperPath?: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.LWE_HOTSWAP_SETTINGS, options, wallpaperPath),
    listProperties: (wallpaperPath: string): Promise<LweProperty[]> =>
      ipcRenderer.invoke(IpcChannels.LWE_LIST_PROPERTIES, wallpaperPath),
    listScreens: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.LWE_LIST_SCREENS),
    listAudioObjects: (wallpaperPath: string): Promise<LweAudioObject[]> =>
      ipcRenderer.invoke(IpcChannels.LWE_LIST_AUDIO_OBJECTS, wallpaperPath),
    listEffects: (wallpaperPath: string): Promise<LweSceneEffect[]> =>
      ipcRenderer.invoke(IpcChannels.LWE_LIST_EFFECTS, wallpaperPath),
    listApplications: (): Promise<DesktopApplication[]> =>
      ipcRenderer.invoke(IpcChannels.LWE_LIST_APPLICATIONS),
    pickShortcutPath: (kind: 'file' | 'directory'): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.LWE_PICK_SHORTCUT_PATH, kind)
  },

  schedule: {
    getAll: (): Promise<ScheduleRule[]> => ipcRenderer.invoke(IpcChannels.SCHEDULE_GET_ALL),
    save: (rule: Omit<ScheduleRule, 'id'> & { id?: string }): Promise<ScheduleRule> =>
      ipcRenderer.invoke(IpcChannels.SCHEDULE_SAVE, rule),
    delete: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IpcChannels.SCHEDULE_DELETE, id),
    run: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IpcChannels.SCHEDULE_RUN, id)
  },

  backup: {
    item: (itemId: string): Promise<{ ok: boolean; unsubscribed: boolean }> =>
      ipcRenderer.invoke(IpcChannels.BACKUP_ITEM, itemId),
    selection: (itemIds: string[]): Promise<{ backedUp: number; failed: number; unsubscribed: number }> =>
      ipcRenderer.invoke(IpcChannels.BACKUP_SELECTION, itemIds),
    scan: (): Promise<{ imported: number; skipped: number; linked: number }> =>
      ipcRenderer.invoke(IpcChannels.BACKUP_SCAN)
  },

  desktopIcons: {
    setEnabled: (enabled: boolean): Promise<{ ok: boolean; enabled: boolean }> =>
      ipcRenderer.invoke(IpcChannels.DESKTOP_ICONS_SET_ENABLED, enabled),
    getEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.DESKTOP_ICONS_GET_ENABLED)
  },

  shell: {
    openInFileManager: (folderPath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_IN_FILE_MANAGER, folderPath),
    openWithDefault: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_WITH_DEFAULT, filePath),
    openPath: (targetPath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_PATH, targetPath),
    openPaths: (targetPaths: string[]): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_PATHS, targetPaths),
    openExternal: (url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_EXTERNAL, url)
  },

  on: {
    downloadProgress: (cb: (info: DownloadProgressEvent) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, info: DownloadProgressEvent) => cb(info)
      ipcRenderer.on(IpcChannels.EVENT_DOWNLOAD_PROGRESS, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_DOWNLOAD_PROGRESS, listener)
    },
    wallpaperImported: (cb: (meta: WallpaperMeta) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, meta: WallpaperMeta) => cb(meta)
      ipcRenderer.on(IpcChannels.EVENT_WALLPAPER_IMPORTED, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_WALLPAPER_IMPORTED, listener)
    },
    steamStatus: (cb: (running: boolean) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, running: boolean) => cb(running)
      ipcRenderer.on(IpcChannels.EVENT_STEAM_STATUS, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_STEAM_STATUS, listener)
    },
    lweInstallProgress: (cb: (progress: LweInstallProgress) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, progress: LweInstallProgress) => cb(progress)
      ipcRenderer.on(IpcChannels.EVENT_LWE_INSTALL_PROGRESS, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_LWE_INSTALL_PROGRESS, listener)
    },
    backupProgress: (cb: (progress: BackupProgressEvent) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, progress: BackupProgressEvent) => cb(progress)
      ipcRenderer.on(IpcChannels.EVENT_BACKUP_PROGRESS, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_BACKUP_PROGRESS, listener)
    },
    playlistStateChanged: (cb: (states: PlaylistPlaybackState[]) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, states: PlaylistPlaybackState[]) => cb(states)
      ipcRenderer.on(IpcChannels.EVENT_PLAYLIST_STATE_CHANGED, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_PLAYLIST_STATE_CHANGED, listener)
    },
    votedIdsChanged: (cb: (ids: string[]) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, ids: string[]) => cb(ids)
      ipcRenderer.on(IpcChannels.EVENT_VOTED_IDS_CHANGED, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_VOTED_IDS_CHANGED, listener)
    },
    failedVotesChanged: (cb: (failed: Record<string, string>) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, failed: Record<string, string>) => cb(failed)
      ipcRenderer.on(IpcChannels.EVENT_FAILED_VOTES_CHANGED, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_FAILED_VOTES_CHANGED, listener)
    },
    libraryChanged: (cb: () => void): (() => void) => {
      const listener = () => cb()
      ipcRenderer.on(IpcChannels.EVENT_LIBRARY_CHANGED, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_LIBRARY_CHANGED, listener)
    },
    displayChanged: (cb: () => void): (() => void) => {
      const listener = () => cb()
      ipcRenderer.on(IpcChannels.EVENT_DISPLAY_CHANGED, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_DISPLAY_CHANGED, listener)
    },
    wallpaperCrashed: (cb: (event: CrashEvent) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: CrashEvent) => cb(event)
      ipcRenderer.on(IpcChannels.EVENT_WALLPAPER_CRASHED, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_WALLPAPER_CRASHED, listener)
    },
    scheduleFired: (cb: (ruleName: string) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, ruleName: string) => cb(ruleName)
      ipcRenderer.on(IpcChannels.EVENT_SCHEDULE_FIRED, listener)
      return () => ipcRenderer.off(IpcChannels.EVENT_SCHEDULE_FIRED, listener)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
