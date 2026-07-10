import { app, BrowserWindow, net, protocol, shell } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { initSteam } from './services/steam.service'
import { initLibrary } from './services/library.service'
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
  protocol.handle('wallpaper', (request) => {
    const filePath = decodeURIComponent(request.url.replace('wallpaper://', ''))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  const steamOk = initSteam()
  if (!steamOk) {
    console.warn('[App] Steam unavailable, subscription features disabled')
  }

  initLibrary()

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
