import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import {
  getConfiguredWorkshopPath,
  setConfiguredWorkshopPath,
  isWorkshopPathConfigured,
  getDefaultFps,
  setDefaultFps,
  importWEConfigFile,
  createFreshConfig
} from '../services/config.service'
import { getDefaultWorkshopPath } from '../utils/paths'
import { restartWatcher } from '../services/watcher.service'
import { importWEConfig } from '../services/library.service'

export function registerConfigHandlers(): void {
  ipcMain.handle(IpcChannels.CONFIG_GET, () => ({
    workshopPath: getConfiguredWorkshopPath(),
    defaultWorkshopPath: getDefaultWorkshopPath(),
    isConfigured: isWorkshopPathConfigured(),
    defaultFps: getDefaultFps()
  }))

  ipcMain.handle(IpcChannels.CONFIG_SET_DEFAULT_FPS, (_e, fps: number | null) => {
    setDefaultFps(fps)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_SET_WORKSHOP_PATH, (_e, newPath: string) => {
    setConfiguredWorkshopPath(newPath)
    restartWatcher()
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_PICK_FOLDER, async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Wallpaper Engine Workshop folder'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.CONFIG_PICK_FILE, async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      title: 'Select Wallpaper Engine config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.CONFIG_IMPORT_WE, (_e, sourcePath: string) => {
    // 1. Copy + fix paths
    const destPath = importWEConfigFile(sourcePath)
    // 2. Import folders/playlists into our library store
    const result = importWEConfig(destPath)
    return { ...result, configPath: destPath }
  })

  ipcMain.handle(IpcChannels.CONFIG_CREATE_FRESH, () => {
    const destPath = createFreshConfig()
    return { configPath: destPath }
  })
}
