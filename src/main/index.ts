import { app, BrowserWindow, protocol, shell } from 'electron'
import path from 'path'
import { initSteam } from './services/steam.service'
import { initDatabase } from './services/library.service'
import { startWatcher } from './services/watcher.service'
import { registerAllHandlers } from './ipc'
import { initDesktopIcons, cleanupDesktopIcons } from './services/desktop-icons.service'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
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

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Serve local wallpaper files via custom protocol
  protocol.registerFileProtocol('wallpaper', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('wallpaper://', ''))
    callback({ path: filePath })
  })

  // Initialize services
  const steamOk = initSteam()
  if (!steamOk) {
    console.warn('[App] Steam unavailable — subscription features will be disabled')
  }

  initDatabase()

  const win = createWindow()
  registerAllHandlers(win)
  startWatcher(win)
  initDesktopIcons()
})

app.on('window-all-closed', () => {
  cleanupDesktopIcons()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
