import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'
import type {
  WorkshopQueryParams,
  WorkshopQueryResult,
  WorkshopItem,
  WallpaperMeta,
  WallpaperFolder,
  LibraryFilters,
  ApplyWallpaperOptions,
  DownloadProgressEvent,
  WallpaperEnvironment,
  LweStatus,
  LweInstallProgress,
  LinuxDistro
} from '../shared/types'

const api = {
  workshop: {
    query: (params: WorkshopQueryParams): Promise<WorkshopQueryResult> =>
      ipcRenderer.invoke(IpcChannels.WORKSHOP_QUERY, params),
    getItem: (publishedFileId: string): Promise<WorkshopItem | null> =>
      ipcRenderer.invoke(IpcChannels.WORKSHOP_GET_ITEM, publishedFileId)
  },

  steam: {
    isRunning: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.STEAM_IS_RUNNING),
    subscribe: (itemId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.STEAM_SUBSCRIBE, itemId),
    unsubscribe: (itemId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.STEAM_UNSUBSCRIBE, itemId),
    getSubscribedItems: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.STEAM_GET_SUBSCRIBED),
    downloadInfo: (itemId: string): Promise<DownloadProgressEvent | null> =>
      ipcRenderer.invoke(IpcChannels.STEAM_DOWNLOAD_INFO, itemId),
    itemState: (itemId: string): Promise<number> =>
      ipcRenderer.invoke(IpcChannels.STEAM_ITEM_STATE, itemId),
    vote: (itemId: string, voteUp: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.STEAM_VOTE, itemId, voteUp)
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
    scan: (): Promise<{ imported: number; skipped: number }> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_SCAN),
    distinctTags: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.LIBRARY_DISTINCT_TAGS)
  },

  config: {
    get: (): Promise<{ workshopPath: string | null; defaultWorkshopPath: string; isConfigured: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_GET),
    setWorkshopPath: (p: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_SET_WORKSHOP_PATH, p),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_PICK_FOLDER),
    pickFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_PICK_FILE),
    importWE: (sourcePath: string): Promise<{ folders: number; playlists: number; configPath: string }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_IMPORT_WE, sourcePath),
    createFresh: (): Promise<{ configPath: string }> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_CREATE_FRESH)
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
    launch: (wallpaperPath: string, options?: { screenRoot?: string; fps?: number }): Promise<{ ok: boolean; running: boolean }> =>
      ipcRenderer.invoke(IpcChannels.LWE_LAUNCH, wallpaperPath, options),
    stop: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.LWE_STOP)
  },

  shell: {
    openInFileManager: (folderPath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_IN_FILE_MANAGER, folderPath),
    openWithDefault: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_WITH_DEFAULT, filePath),
    openPath: (targetPath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_PATH, targetPath),
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
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
