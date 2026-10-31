import { app, BrowserWindow, dialog, net, protocol, session, shell } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { IpcChannels } from '@shared/ipc-channels'
import { isSteamRunning, startUserListSync, onFailedVotesChange, onFavoriteStatusChange, bindSteamToWindow } from './services/steam.service'
import { initLibrary, checkUnavailableWallpapers, backfillResolutions, onHdrDetected, queueHdrCheck } from './services/library.service'
import { startWatcher } from './services/watcher.service'
import { checkOutdatedBackups, recoverInterruptedCopiesIn } from './services/backup.service'
import { registerAllHandlers } from './ipc'
import { initDesktopIcons, cleanupDesktopIcons } from './services/desktop-icons.service'
import { getTrayEnabled, getAutostartEnabled, getAutostartMinimized, getAutostartPlaylistId, getKillLweOnQuit, getConfiguredBackupPath } from './services/config.service'
import { refreshAutostartExec } from './services/autostart.service'
import { createTray } from './services/tray.service'
import { initPlaylistPlayer, startPlaylist } from './services/playlist-player.service'
import { checkEarlierRunEngines, killAllLweProcesses, getLweStatus } from './services/lwe.service'
import { initDisplay } from './services/display.service'
import { initSchedule } from './services/schedule.service'
import { initUpdates } from './services/update.service'
import { detectDesktopEnv, hasStatusNotifierHost } from './utils/platform'
import { needsSoftwareCompositing, readGpuVendors } from './utils/gpuWorkaround'
import { takeResetStores } from './utils/safeStore'
import { t } from './i18n'
import { getExtraLibraryRoots, getPreviewCachePath, getThumbnailsPath, getWorkshopPath } from './utils/paths'
import { isAppUrl, isSafeExternalUrl, isServablePreview } from './utils/urlPolicy'
import { attachAppearance, prepareAppearance, windowAppearanceOptions } from './services/appearance.service'
import appIcon from '../../resources/icon.png?asset'

const startMinimized = process.argv.includes('--minimized')
prepareAppearance()
if (needsSoftwareCompositing(detectDesktopEnv(), process.env.WAYLAND_DISPLAY, readGpuVendors())) {
  app.commandLine.appendSwitch('disable-gpu-compositing')
}

// fetch() for GIF still frames in PreviewImage.tsx
protocol.registerSchemesAsPrivileged([{ scheme: 'wallpaper', privileges: { supportFetchAPI: true, corsEnabled: true } }])
let isQuitting = false
let hasKilledLweOnQuit = false

const gotInstanceLock = app.requestSingleInstanceLock()
if (!gotInstanceLock) app.quit()

app.on('second-instance', (_event, argv) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || argv.includes('--minimized')) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

const BACKGROUND_SYNC_INTERVAL_MS = 3 * 60 * 1000
const TRAY_HOST_WAIT_MS = 10_000

// picks up votes/favorites made outside the app and items taken down from the Workshop
function startBackgroundSync(win: BrowserWindow): void {
  startUserListSync({
    onLikedChange: (ids) => {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_VOTED_IDS_CHANGED, ids)
    },
    onDislikedChange: (ids) => {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_DISLIKED_IDS_CHANGED, ids)
    },
    onFavoritesChange: (ids) => {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_FAVORITE_IDS_CHANGED, ids)
    }
  })
  onFailedVotesChange((failed) => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_FAILED_VOTES_CHANGED, failed)
  })
  onFavoriteStatusChange((status) => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_FAVORITE_STATUS_CHANGED, status)
  })

  const syncResolutions = async (): Promise<void> => {
    if (await backfillResolutions() && !win.isDestroyed()) {
      win.webContents.send(IpcChannels.EVENT_LIBRARY_CHANGED)
    }
  }
  onHdrDetected(() => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_LIBRARY_CHANGED)
  })
  const syncOutdatedBackups = async (): Promise<void> => {
    try {
      if (await checkOutdatedBackups() && !win.isDestroyed()) {
        win.webContents.send(IpcChannels.EVENT_LIBRARY_CHANGED)
      }
    } catch (err) {
      console.warn('[Backup] Outdated check failed:', err)
    }
  }
  win.webContents.once('did-finish-load', () => {
    void syncResolutions()
    void syncOutdatedBackups()
    queueHdrCheck()
  })

  const pushSteamStatus = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_STEAM_STATUS, isSteamRunning())
  }
  win.on('show', pushSteamStatus)
  win.on('restore', pushSteamStatus)

  setInterval(async () => {
    if (win.isDestroyed()) return
    const running = isSteamRunning()
    win.webContents.send(IpcChannels.EVENT_STEAM_STATUS, running)
    await syncOutdatedBackups()
    if (!running) return

    try {
      const { changed } = await checkUnavailableWallpapers()
      if (changed && !win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_LIBRARY_CHANGED)
      await syncResolutions()
    } catch { /* retried next tick */ }
  }, BACKGROUND_SYNC_INTERVAL_MS)
}

// gives a panel that starts after us until the deadline, then shows the window
function showWindowUnlessTrayAppears(win: BrowserWindow): void {
  const deadline = Date.now() + TRAY_HOST_WAIT_MS
  const timer = setInterval(() => {
    if (win.isDestroyed() || win.isVisible() || hasStatusNotifierHost(0)) {
      clearInterval(timer)
    } else if (Date.now() >= deadline) {
      clearInterval(timer)
      win.show()
    }
  }, 1000)
}

function createWindow(): BrowserWindow {
  const startHidden = startMinimized && getTrayEnabled()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    ...windowAppearanceOptions(),
    autoHideMenuBar: true,
    icon: appIcon,
    show: !startHidden,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // the preload only needs electron's own modules
      sandbox: true
    }
  })

  attachAppearance(win)

  const devUrl = process.env.NODE_ENV === 'development' ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const appUrl = devUrl ?? pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString()

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The window only ever shows the app. A file dropped outside the drop targets, a link without a target or a
  // redirect would load that page with the whole electronAPI in it: links go to the browser, the rest is dropped
  const keepOnApp = (event: { url: string; preventDefault: () => void }, openLinks: boolean): void => {
    if (isAppUrl(event.url, appUrl)) return
    event.preventDefault()
    if (openLinks && isSafeExternalUrl(event.url)) void shell.openExternal(event.url)
  }
  // will-frame-navigate comes first, for the main frame as well, and will-navigate is skipped once that one prevents it
  win.webContents.on('will-frame-navigate', (event) => { keepOnApp(event, event.isMainFrame) })
  win.webContents.on('will-navigate', (event) => { keepOnApp(event, true) })
  win.webContents.on('will-redirect', (event) => { keepOnApp(event, false) })

  // closing hides to the tray, or quits without a StatusNotifier host
  win.on('close', (event) => {
    if (getTrayEnabled() && !isQuitting && hasStatusNotifierHost()) {
      event.preventDefault()
      win.hide()
    }
  })

  if (devUrl) {
    win.loadURL(devUrl).catch((err: unknown) => { console.error('[Main] loadURL failed:', err) })
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html')).catch((err: unknown) => { console.error('[Main] loadFile failed:', err) })
  }

  if (startHidden && !hasStatusNotifierHost()) showWindowUnlessTrayAppears(win)

  return win
}

function announceResetStores(): void {
  const reset = takeResetStores()
  if (reset.length === 0) return
  void dialog.showMessageBox({
    type: 'warning',
    message: t('dialog.storeResetTitle'),
    detail: reset.map(({ file, keptAs }) => t('dialog.storeReset', { name: path.basename(file), keptAs })).join('\n\n')
  })
}

app.whenReady().then(async () => {
  if (!gotInstanceLock) return
  const allowedPermission = (permission: string): boolean => permission === 'clipboard-sanitized-write'
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => { callback(allowedPermission(permission)) })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allowedPermission(permission))

  protocol.handle('wallpaper', async (request) => {
    let filePath: string
    try {
      filePath = decodeURIComponent(request.url.replace('wallpaper://', ''))
    } catch {
      return new Response(null, { status: 400 })
    }

    // previews only: pictures and videos inside the library, backup and thumbnail folders, not any file of the user
    const roots = [getWorkshopPath(), getConfiguredBackupPath(), ...getExtraLibraryRoots(), getThumbnailsPath(), getPreviewCachePath()]
    if (request.method !== 'GET' || !isServablePreview(filePath, roots.filter((root): root is string => !!root))) {
      return new Response(null, { status: 403 })
    }

    try {
      const res = await net.fetch(pathToFileURL(filePath).toString())
      const headers = new Headers(res.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(res.body, { status: res.status, headers })
    } catch {
      // may still be downloading

      return new Response(null, { status: 404 })
    }
  })

  const copyRoots = [getConfiguredBackupPath(), ...getExtraLibraryRoots()].filter((root): root is string => !!root)
  await recoverInterruptedCopiesIn(copyRoots)
  initLibrary()

  const win = createWindow()
  announceResetStores()
  bindSteamToWindow(win)
  registerAllHandlers(win)
  startWatcher(win)
  startBackgroundSync(win)
  initDesktopIcons()
  await checkEarlierRunEngines()
  initDisplay(win)
  const resumed = initPlaylistPlayer(win)

  if (getTrayEnabled()) createTray(win)

  if (getAutostartEnabled()) refreshAutostartExec(getAutostartMinimized())

  const autostartPlaylistId = getAutostartPlaylistId()
  if (!resumed && autostartPlaylistId && getLweStatus().installed) {
    try {
      startPlaylist(autostartPlaylistId)
    } catch (err) {
      console.error('[App] Failed to autostart playlist:', err)
    }
  }
  initSchedule(win)
  initUpdates(win)
}).catch((err: unknown) => { console.error('[Main] startup failed:', err) })

app.on('before-quit', (event) => {
  isQuitting = true

  if (getKillLweOnQuit() && !hasKilledLweOnQuit) {
    event.preventDefault()
    hasKilledLweOnQuit = true
    killAllLweProcesses().catch((err: unknown) => { console.error('[Main] killing engines on quit failed:', err) }).finally(() => { app.quit() })
  }
})

app.on('will-quit', () => {
  cleanupDesktopIcons()
})

app.on('window-all-closed', () => {
  cleanupDesktopIcons()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    BrowserWindow.getAllWindows()[0].show()
  }
})
