import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import {
  getConfiguredWorkshopPath,
  setConfiguredWorkshopPath,
  isWorkshopPathConfigured,
  getDefaultFps,
  setDefaultFps,
  getRecommendedFpsEnabled,
  setRecommendedFpsEnabled,
  getRecommendedWebFpsEnabled,
  setRecommendedWebFpsEnabled,
  getLweRepoUrl,
  getLweRepoBranch,
  setLweRepo,
  getLweCmakeArgs,
  setLweCmakeArgs,
  importWEConfigFile,
  createFreshConfig,
  getConfiguredBackupPath,
  setConfiguredBackupPath,
  isBackupPathConfigured,
  getAutoUnsubscribeAfterBackup,
  setAutoUnsubscribeAfterBackup,
  getTrayEnabled,
  setTrayEnabled,
  getAutostartEnabled,
  getAutostartMinimized,
  setAutostart,
  getAutostartPlaylistId,
  setAutostartPlaylistId,
  getKillLweOnQuit,
  setKillLweOnQuit
} from '../services/config.service'
import { getDefaultWorkshopPath } from '../utils/paths'
import { DEFAULT_LWE_REPO } from '@shared/constants'
import { restartWatcher } from '../services/watcher.service'
import { importWEConfig } from '../services/library.service'
import { createTray, destroyTray } from '../services/tray.service'
import { isAutostartSupported, setAutostartEnabled } from '../services/autostart.service'

export function registerConfigHandlers(): void {
  ipcMain.handle(IpcChannels.CONFIG_GET, () => ({
    workshopPath: getConfiguredWorkshopPath(),
    defaultWorkshopPath: getDefaultWorkshopPath(),
    isConfigured: isWorkshopPathConfigured(),
    defaultFps: getDefaultFps(),
    recommendedFpsEnabled: getRecommendedFpsEnabled(),
    recommendedWebFpsEnabled: getRecommendedWebFpsEnabled(),
    lweRepoUrl: getLweRepoUrl(),
    lweRepoBranch: getLweRepoBranch(),
    lweCmakeArgs: getLweCmakeArgs(),
    defaultLweRepoUrl: DEFAULT_LWE_REPO,
    backupPath: getConfiguredBackupPath(),
    isBackupConfigured: isBackupPathConfigured(),
    autoUnsubscribeAfterBackup: getAutoUnsubscribeAfterBackup(),
    trayEnabled: getTrayEnabled(),
    autostartSupported: isAutostartSupported(),
    autostartEnabled: getAutostartEnabled(),
    autostartMinimized: getAutostartMinimized(),
    autostartPlaylistId: getAutostartPlaylistId(),
    killLweOnQuit: getKillLweOnQuit()
  }))

  ipcMain.handle(IpcChannels.CONFIG_GET_AUTOSTART_SUPPORTED, () => isAutostartSupported())

  ipcMain.handle(IpcChannels.CONFIG_SET_TRAY_ENABLED, (_e, enabled: boolean) => {
    setTrayEnabled(enabled)
    if (enabled) {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) createTray(win)
    } else {
      destroyTray()
    }
    return { ok: true }
  })

  ipcMain.handle(
    IpcChannels.CONFIG_SET_AUTOSTART,
    (_e, enabled: boolean, minimized: boolean, playlistId: string | null) => {
      setAutostart(enabled, minimized)
      setAutostartPlaylistId(playlistId)
      setAutostartEnabled(enabled, minimized)
      return { ok: true }
    }
  )

  ipcMain.handle(IpcChannels.CONFIG_SET_KILL_LWE_ON_QUIT, (_e, enabled: boolean) => {
    setKillLweOnQuit(enabled)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_SET_BACKUP_PATH, (_e, newPath: string) => {
    setConfiguredBackupPath(newPath)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_SET_AUTO_UNSUBSCRIBE, (_e, enabled: boolean) => {
    setAutoUnsubscribeAfterBackup(enabled)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_SET_DEFAULT_FPS, (_e, fps: number | null) => {
    setDefaultFps(fps)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_SET_RECOMMENDED_FPS, (_e, enabled: boolean) => {
    setRecommendedFpsEnabled(enabled)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_SET_RECOMMENDED_WEB_FPS, (_e, enabled: boolean) => {
    setRecommendedWebFpsEnabled(enabled)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_SET_LWE_REPO, (_e, url: string | null, branch: string | null) => {
    setLweRepo(url, branch)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.CONFIG_SET_LWE_CMAKE_ARGS, (_e, args: string | null) => {
    setLweCmakeArgs(args)
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
    const destPath = importWEConfigFile(sourcePath)
    const result = importWEConfig(destPath)
    return { ...result, configPath: destPath }
  })

  ipcMain.handle(IpcChannels.CONFIG_CREATE_FRESH, () => {
    const destPath = createFreshConfig()
    return { configPath: destPath }
  })
}
