export const IpcChannels = {
  // Workshop browsing (steamworks.js)
  WORKSHOP_QUERY: 'workshop:query',
  WORKSHOP_GET_ITEM: 'workshop:get-item',
  WORKSHOP_QUERY_BY_CREATOR: 'workshop:query-by-creator',

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
  STEAM_GET_FAILED_VOTES: 'steam:get-failed-votes',
  STEAM_CHECK_VOTE: 'steam:check-vote',
  STEAM_REDOWNLOAD: 'steam:redownload',
  STEAM_GET_AUTHOR_INFO: 'steam:get-author-info',

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
  LIBRARY_CHECK_UNAVAILABLE: 'library:check-unavailable',

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
  WALLPAPER_GET_ASSIGNMENTS: 'wallpaper:get-assignments',
  WALLPAPER_GET_TARGETS: 'wallpaper:get-targets',
  WALLPAPER_STOP: 'wallpaper:stop',
  WALLPAPER_TEST_LAUNCH: 'wallpaper:test-launch',
  WALLPAPER_GENERATE_THUMBNAIL: 'wallpaper:generate-thumbnail',
  WALLPAPER_PICK_THUMBNAIL: 'wallpaper:pick-thumbnail',
  WALLPAPER_DELETE_THUMBNAIL: 'wallpaper:delete-thumbnail',

  // Scheduling
  SCHEDULE_GET_ALL: 'schedule:get-all',
  SCHEDULE_SAVE: 'schedule:save',
  SCHEDULE_DELETE: 'schedule:delete',
  SCHEDULE_RUN: 'schedule:run',

  // Configuration
  CONFIG_GET: 'config:get',
  CONFIG_SET_WORKSHOP_PATH: 'config:set-workshop-path',
  CONFIG_SET_DEFAULT_FPS: 'config:set-default-fps',
  CONFIG_SET_RECOMMENDED_FPS: 'config:set-recommended-fps',
  CONFIG_SET_RECOMMENDED_WEB_FPS: 'config:set-recommended-web-fps',
  CONFIG_SET_LWE_REPO: 'config:set-lwe-repo',
  CONFIG_SET_LWE_CMAKE_ARGS: 'config:set-lwe-cmake-args',
  CONFIG_SET_BACKUP_PATH: 'config:set-backup-path',
  CONFIG_SET_AUTO_UNSUBSCRIBE: 'config:set-auto-unsubscribe',
  CONFIG_SET_AUDIO_SCREEN: 'config:set-audio-screen',
  CONFIG_SET_AMBIENT_VOLUME: 'config:set-ambient-volume',
  CONFIG_SET_DEFAULT_AUDIO_SENSITIVITY: 'config:set-default-audio-sensitivity',
  CONFIG_SET_DISABLE_PUPPET_ANIMATION: 'config:set-disable-puppet-animation',
  CONFIG_SET_ENGINE_FLAGS: 'config:set-engine-flags',
  CONFIG_SET_ENGINE_PRESETS: 'config:set-engine-presets',
  CONFIG_SET_DISPLAY_MODE: 'config:set-display-mode',
  CONFIG_SET_STEAM_IDENTITY: 'config:set-steam-identity',
  CONFIG_IGNORE_CREATOR: 'config:ignore-creator',
  CONFIG_UNIGNORE_CREATOR: 'config:unignore-creator',
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
  PLAYLIST_PLAY_ITEM: 'playlist:play-item',
  PLAYLIST_STOP: 'playlist:stop',
  PLAYLIST_PAUSE: 'playlist:pause',
  PLAYLIST_RESUME: 'playlist:resume',
  PLAYLIST_NEXT: 'playlist:next',
  PLAYLIST_PREVIOUS: 'playlist:previous',
  PLAYLIST_GET_STATE: 'playlist:get-state',

  // Tray & autostart
  CONFIG_SET_TRAY_ENABLED: 'config:set-tray-enabled',
  CONFIG_SET_KILL_LWE_ON_QUIT: 'config:set-kill-lwe-on-quit',
  CONFIG_SET_VOTE_BORDERS: 'config:set-vote-borders',
  CONFIG_SET_AUTOSTART: 'config:set-autostart',
  CONFIG_GET_AUTOSTART_SUPPORTED: 'config:get-autostart-supported',

  // Shell operations
  SHELL_OPEN_PATH: 'shell:open-path',
  SHELL_OPEN_PATHS: 'shell:open-paths',
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
  LWE_LIST_OBJECTS: 'lwe:list-objects',
  LWE_HOTSWAP_SETTINGS: 'lwe:hotswap-settings',
  LWE_LIST_PROPERTIES: 'lwe:list-properties',
  LWE_LIST_SCREENS: 'lwe:list-screens',
  LWE_LIST_AUDIO_OBJECTS: 'lwe:list-audio-objects',
  LWE_LIST_EFFECTS: 'lwe:list-effects',

  // Desktop icons overlay
  DESKTOP_ICONS_SET_ENABLED: 'desktop-icons:set-enabled',
  DESKTOP_ICONS_GET_ENABLED: 'desktop-icons:get-enabled',

  // Events pushed from main to renderer
  EVENT_DOWNLOAD_PROGRESS: 'event:download-progress',
  EVENT_WALLPAPER_IMPORTED: 'event:wallpaper-imported',
  EVENT_STEAM_STATUS: 'event:steam-status',
  EVENT_LWE_INSTALL_PROGRESS: 'event:lwe-install-progress',
  EVENT_BACKUP_PROGRESS: 'event:backup-progress',
  EVENT_PLAYLIST_STATE_CHANGED: 'event:playlist-state-changed',
  EVENT_VOTED_IDS_CHANGED: 'event:voted-ids-changed',
  EVENT_FAILED_VOTES_CHANGED: 'event:failed-votes-changed',
  EVENT_LIBRARY_CHANGED: 'event:library-changed',
  EVENT_DISPLAY_CHANGED: 'event:display-changed',
  EVENT_WALLPAPER_CRASHED: 'event:wallpaper-crashed',
  EVENT_SCHEDULE_FIRED: 'event:schedule-fired'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
