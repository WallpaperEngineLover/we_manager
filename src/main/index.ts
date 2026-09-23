import { app, BrowserWindow, net, protocol, shell } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { IpcChannels } from '@shared/ipc-channels'
import { initSteam, isSteamRunning, startVotedItemsSync } from './services/steam.service'
import { initLibrary, checkUnavailableWallpapers, backfillResolutions } from './services/library.service'
import { startWatcher } from './services/watcher.service'
import { registerAllHandlers } from './ipc'
import { initDesktopIcons, cleanupDesktopIcons } from './services/desktop-icons.service'
import { getTrayEnabled, getAutostartPlaylistId, getKillLweOnQuit } from './services/config.service'
import { createTray } from './services/tray.service'
import { initPlaylistPlayer, startPlaylist } from './services/playlist-player.service'
import { killAllLweProcesses, getLweStatus } from './services/lwe.service'

const startMinimized = process.argv.includes('--minimized')
let isQuitting = false
let hasKilledLweOnQuit = false

const BACKGROUND_SYNC_INTERVAL_MS = 3 * 60 * 1000

// Keeps "liked" state and library availability fresh without the user having to restart the
// app or click "Check unavailable" - votes cast on Steam directly (client, community website)
// and items taken down from the Workshop both eventually show up on their own.
function startBackgroundSync(win: BrowserWindow): void {
  startVotedItemsSync((ids) => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_VOTED_IDS_CHANGED, ids)
  })

  const syncResolutions = async (): Promise<void> => {
    if (await backfillResolutions() && !win.isDestroyed()) {
      win.webContents.send(IpcChannels.EVENT_LIBRARY_CHANGED)
    }
  }
  win.webContents.once('did-finish-load', () => void syncResolutions())

  setInterval(async () => {
    if (win.isDestroyed()) return
    const running = isSteamRunning()
    win.webContents.send(IpcChannels.EVENT_STEAM_STATUS, running)
    if (!running) return

    try {
      const { changed } = await checkUnavailableWallpapers()
      if (changed && !win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_LIBRARY_CHANGED)
      await syncResolutions()
    } catch {
      // transient Steam hiccup - try again next tick
    }
  }, BACKGROUND_SYNC_INTERVAL_MS)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    show: !(startMinimized && getTrayEnabled()),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // When the tray is enabled, closing the window hides it instead of quitting so the
  // tray icon remains the only way back in (and the app keeps running for playlists).
  win.on('close', (event) => {
    if (getTrayEnabled() && !isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  protocol.handle('wallpaper', async (request) => {
    const filePath = decodeURIComponent(request.url.replace('wallpaper://', ''))
    try {
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch {
      // File not on disk yet (e.g. still downloading) - a rejected fetch here
      // would otherwise surface as an uncaught net::ERR_FILE_NOT_FOUND
      return new Response(null, { status: 404 })
    }
  })

  const steamOk = initSteam()
  if (!steamOk) {
    console.warn('[App] Steam unavailable, subscription features disabled')
  }

  initLibrary()

  const win = createWindow()
  registerAllHandlers(win)
  startWatcher(win)
  startBackgroundSync(win)
  initDesktopIcons()
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
