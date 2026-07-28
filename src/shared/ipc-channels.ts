export const IpcChannels = {
  // Workshop browsing (steamworks.js)
  WORKSHOP_QUERY: 'workshop:query',
  WORKSHOP_GET_ITEM: 'workshop:get-item',

  // Steamworks operations
  STEAM_SUBSCRIBE: 'steam:subscribe',
  STEAM_UNSUBSCRIBE: 'steam:unsubscribe',
  STEAM_GET_SUBSCRIBED: 'steam:get-subscribed',
  STEAM_DOWNLOAD_INFO: 'steam:download-info',
  STEAM_ITEM_STATE: 'steam:item-state',
  STEAM_INSTALL_INFO: 'steam:install-info',
  STEAM_IS_RUNNING: 'steam:is-running',
  STEAM_VOTE: 'steam:vote',
  STEAM_OPEN_WORKSHOP: 'steam:open-workshop',
  STEAM_GET_VOTED_IDS: 'steam:get-voted-ids',
  STEAM_REDOWNLOAD: 'steam:redownload',

  // Library management
  LIBRARY_GET_ALL: 'library:get-all',
  LIBRARY_GET_ONE: 'library:get-one',
  LIBRARY_UPDATE: 'library:update',
  LIBRARY_DELETE: 'library:delete',
  LIBRARY_ADD_TAG: 'library:add-tag',
  LIBRARY_REMOVE_TAG: 'library:remove-tag',
  LIBRARY_GET_TAGS: 'library:get-tags',
  LIBRARY_SEARCH: 'library:search',
  LIBRARY_SCAN: 'library:scan',
  LIBRARY_DISTINCT_TAGS: 'library:distinct-tags',
  LIBRARY_RESET_FPS_OVERRIDES: 'library:reset-fps-overrides',

  // Folders
  FOLDERS_GET_ALL: 'folders:get-all',
  FOLDERS_CREATE: 'folders:create',
  FOLDERS_RENAME: 'folders:rename',
  FOLDERS_DELETE: 'folders:delete',
  FOLDERS_ADD_ITEMS: 'folders:add-items',
  FOLDERS_REMOVE_ITEMS: 'folders:remove-items',
  FOLDERS_IMPORT_WE_CONFIG: 'folders:import-we-config',
  FOLDERS_CLEANUP: 'folders:cleanup',

  // Wallpaper application
  WALLPAPER_APPLY: 'wallpaper:apply',
  WALLPAPER_GET_ACTIVE: 'wallpaper:get-active',
  WALLPAPER_DETECT_ENV: 'wallpaper:detect-env',

  // Configuration
  CONFIG_GET: 'config:get',
  CONFIG_SET_WORKSHOP_PATH: 'config:set-workshop-path',
  CONFIG_SET_DEFAULT_FPS: 'config:set-default-fps',
  CONFIG_SET_LWE_REPO: 'config:set-lwe-repo',
  CONFIG_SET_BACKUP_PATH: 'config:set-backup-path',
  CONFIG_SET_AUTO_UNSUBSCRIBE: 'config:set-auto-unsubscribe',
  CONFIG_PICK_FOLDER: 'config:pick-folder',
  CONFIG_PICK_FILE: 'config:pick-file',
  CONFIG_IMPORT_WE: 'config:import-we',
  CONFIG_CREATE_FRESH: 'config:create-fresh',

  // Backup
  BACKUP_ITEM: 'backup:item',
  BACKUP_SELECTION: 'backup:selection',
  BACKUP_SCAN: 'backup:scan',

  // Playlists
  PLAYLIST_GET_ALL: 'playlist:get-all',
  PLAYLIST_GET_ONE: 'playlist:get-one',
  PLAYLIST_CREATE: 'playlist:create',
  PLAYLIST_RENAME: 'playlist:rename',
  PLAYLIST_DELETE: 'playlist:delete',
  PLAYLIST_UPDATE_SETTINGS: 'playlist:update-settings',
  PLAYLIST_ADD_ITEMS: 'playlist:add-items',
  PLAYLIST_REMOVE_ITEMS: 'playlist:remove-items',
  PLAYLIST_REORDER_ITEMS: 'playlist:reorder-items',
  PLAYLIST_UPDATE_ITEM: 'playlist:update-item',
  PLAYLIST_START: 'playlist:start',
  PLAYLIST_STOP: 'playlist:stop',
  PLAYLIST_PAUSE: 'playlist:pause',
  PLAYLIST_RESUME: 'playlist:resume',
  PLAYLIST_NEXT: 'playlist:next',
  PLAYLIST_PREVIOUS: 'playlist:previous',
  PLAYLIST_GET_STATE: 'playlist:get-state',

  // Tray & autostart
  CONFIG_SET_TRAY_ENABLED: 'config:set-tray-enabled',
  CONFIG_SET_KILL_LWE_ON_QUIT: 'config:set-kill-lwe-on-quit',
  CONFIG_SET_AUTOSTART: 'config:set-autostart',
  CONFIG_GET_AUTOSTART_SUPPORTED: 'config:get-autostart-supported',

  // Shell operations
  SHELL_OPEN_PATH: 'shell:open-path',
  SHELL_OPEN_IN_FILE_MANAGER: 'shell:open-in-file-manager',
  SHELL_OPEN_WITH_DEFAULT: 'shell:open-with-default',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',

  // linux-wallpaperengine
  LWE_STATUS: 'lwe:status',
  LWE_DETECT_DISTRO: 'lwe:detect-distro',
  LWE_INSTALL_DEPS: 'lwe:install-deps',
  LWE_INSTALL: 'lwe:install',
  LWE_UNINSTALL: 'lwe:uninstall',
  LWE_LAUNCH: 'lwe:launch',
  LWE_STOP: 'lwe:stop',
  LWE_KILL_ALL: 'lwe:kill-all',

  // Desktop icons overlay
  DESKTOP_ICONS_SET_ENABLED: 'desktop-icons:set-enabled',
  DESKTOP_ICONS_GET_ENABLED: 'desktop-icons:get-enabled',

  // Events pushed from main to renderer
  EVENT_DOWNLOAD_PROGRESS: 'event:download-progress',
  EVENT_WALLPAPER_IMPORTED: 'event:wallpaper-imported',
  EVENT_STEAM_STATUS: 'event:steam-status',
  EVENT_LWE_INSTALL_PROGRESS: 'event:lwe-install-progress',
  EVENT_BACKUP_PROGRESS: 'event:backup-progress',
  EVENT_PLAYLIST_STATE_CHANGED: 'event:playlist-state-changed'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
