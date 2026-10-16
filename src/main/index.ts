import { app, BrowserWindow, net, protocol, shell } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { IpcChannels } from '@shared/ipc-channels'
import { isSteamRunning, startUserListSync, onFailedVotesChange, onFavoriteStatusChange, bindSteamToWindow } from './services/steam.service'
import { initLibrary, checkUnavailableWallpapers, backfillResolutions, onHdrDetected, queueHdrCheck } from './services/library.service'
import { startWatcher } from './services/watcher.service'
import { checkOutdatedBackups } from './services/backup.service'
import { registerAllHandlers } from './ipc'
import { initDesktopIcons, cleanupDesktopIcons } from './services/desktop-icons.service'
import { getTrayEnabled, getAutostartPlaylistId, getKillLweOnQuit } from './services/config.service'
import { createTray } from './services/tray.service'
import { initPlaylistPlayer, startPlaylist } from './services/playlist-player.service'
import { checkEarlierRunEngines, killAllLweProcesses, getLweStatus } from './services/lwe.service'
import { initDisplay } from './services/display.service'
import { initSchedule } from './services/schedule.service'
import { initUpdates } from './services/update.service'
import { hasStatusNotifierHost } from './utils/platform'
import { attachAppearance, prepareAppearance, windowAppearanceOptions } from './services/appearance.service'
import appIcon from '../../resources/icon.png?asset'

const startMinimized = process.argv.includes('--minimized')
prepareAppearance()

// fetch() for GIF still frames in PreviewImage.tsx
protocol.registerSchemesAsPrivileged([{ scheme: 'wallpaper', privileges: { supportFetchAPI: true, corsEnabled: true } }])
let isQuitting = false
let hasKilledLweOnQuit = false

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
      sandbox: false
    }
  })

  attachAppearance(win)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // closing hides to the tray, or quits without a StatusNotifier host
  win.on('close', (event) => {
    if (getTrayEnabled() && !isQuitting && hasStatusNotifierHost()) {
      event.preventDefault()
      win.hide()
    }
  })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  if (startHidden && !hasStatusNotifierHost()) showWindowUnlessTrayAppears(win)

  return win
}

app.whenReady().then(async () => {
  protocol.handle('wallpaper', async (request) => {
    const filePath = decodeURIComponent(request.url.replace('wallpaper://', ''))
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

  initLibrary()

  const win = createWindow()
  bindSteamToWindow(win)
  registerAllHandlers(win)
  startWatcher(win)
  startBackgroundSync(win)
  initDesktopIcons()
  await checkEarlierRunEngines()
  initDisplay(win)
  const resumed = initPlaylistPlayer(win)

  if (getTrayEnabled()) createTray(win)

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
})

app.on('before-quit', (event) => {
  isQuitting = true

  if (getKillLweOnQuit() && !hasKilledLweOnQuit) {
    event.preventDefault()
    hasKilledLweOnQuit = true
    killAllLweProcesses().finally(() => app.quit())
  }
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
