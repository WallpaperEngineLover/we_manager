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
  CONFIG_PICK_FOLDER: 'config:pick-folder',
  CONFIG_PICK_FILE: 'config:pick-file',
  CONFIG_IMPORT_WE: 'config:import-we',
  CONFIG_CREATE_FRESH: 'config:create-fresh',

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

  // Desktop icons overlay
  DESKTOP_ICONS_SET_ENABLED: 'desktop-icons:set-enabled',
  DESKTOP_ICONS_GET_ENABLED: 'desktop-icons:get-enabled',

  // Events pushed from main to renderer
  EVENT_DOWNLOAD_PROGRESS: 'event:download-progress',
  EVENT_WALLPAPER_IMPORTED: 'event:wallpaper-imported',
  EVENT_STEAM_STATUS: 'event:steam-status',
  EVENT_LWE_INSTALL_PROGRESS: 'event:lwe-install-progress'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
