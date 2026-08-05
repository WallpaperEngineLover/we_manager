import { ipcMain, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getLweStatus, detectDistro, installLweDeps, installLwe, uninstallLwe, launchLweAsync, stopLwe, isLweRunning, killAllLweProcesses, listLweObjects, hotswapLweSettings, listLweProperties, listLweAudioObjects } from '../services/lwe.service'
import { invalidateEnvCache } from '../services/wallpaper.service'
import { getConnectedScreens } from '../utils/platform'

export function registerLweHandlers(win: BrowserWindow): void {
  ipcMain.handle(IpcChannels.LWE_STATUS, () => {
    return getLweStatus()
  })

  ipcMain.handle(IpcChannels.LWE_DETECT_DISTRO, () => {
    return detectDistro()
  })

  ipcMain.handle(IpcChannels.LWE_INSTALL_DEPS, async () => {
    await installLweDeps(win)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.LWE_INSTALL, async () => {
    await installLwe(win)
    invalidateEnvCache()
    return getLweStatus()
  })

  ipcMain.handle(IpcChannels.LWE_UNINSTALL, async () => {
    const result = await uninstallLwe()
    invalidateEnvCache()
    return result
  })

  ipcMain.handle(IpcChannels.LWE_LAUNCH, async (_e, wallpaperPath: string, options?: { screenRoot?: string; fps?: number }) => {
    await launchLweAsync(wallpaperPath, options)
    return { ok: true, running: isLweRunning() }
  })

  ipcMain.handle(IpcChannels.LWE_STOP, async () => {
    await stopLwe()
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.LWE_KILL_ALL, async () => {
    return await killAllLweProcesses()
  })

  ipcMain.handle(IpcChannels.LWE_LIST_OBJECTS, async (_e, wallpaperPath: string) => {
    // Some wallpapers have project data linux-wallpaperengine itself can't parse; treat that as "no objects" rather than a hard error
    try {
      return await listLweObjects(wallpaperPath)
    } catch (err) {
      console.warn('[LWE] list-objects failed for', wallpaperPath, ':', (err as Error).message)
      return []
    }
  })

  ipcMain.handle(
    IpcChannels.LWE_HOTSWAP_SETTINGS,
    (
      _e,
      options: {
        disabledObjects?: string[]
        enabledObjects?: string[]
        volume?: number
        xray?: boolean
        scaling?: string
        zoom?: number
        disableParallax?: boolean
        cornerColor?: string
        speed?: number
        propertyOverrides?: Record<string, string>
        audioScreen?: string
        ambientVolume?: number
        audioSensitivity?: Record<string, number>
        soundVolume?: Record<string, number>
      }
    ) => {
      return { ok: hotswapLweSettings(options) }
    }
  )

  ipcMain.handle(IpcChannels.LWE_LIST_SCREENS, () => {
    return getConnectedScreens()
  })

  ipcMain.handle(IpcChannels.LWE_LIST_PROPERTIES, async (_e, wallpaperPath: string) => {
    // Same reasoning as list-objects: some wallpapers have properties linux-wallpaperengine
    // itself can't parse, treat that as "no properties" rather than a hard error.
    try {
      return await listLweProperties(wallpaperPath)
    } catch (err) {
      console.warn('[LWE] list-properties failed for', wallpaperPath, ':', (err as Error).message)
      return []
    }
  })

  ipcMain.handle(IpcChannels.LWE_LIST_AUDIO_OBJECTS, async (_e, wallpaperPath: string) => {
    // Same reasoning as list-objects/list-properties: treat a parse failure as "nothing detected"
    // rather than a hard error.
    try {
      return await listLweAudioObjects(wallpaperPath)
    } catch (err) {
      console.warn('[LWE] list-audio-objects failed for', wallpaperPath, ':', (err as Error).message)
      return []
    }
  })
}
