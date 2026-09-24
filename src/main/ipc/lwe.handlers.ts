import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getLweStatus, detectDistro, installLweDeps, installLwe, uninstallLwe, launchLweAsync, isLweRunning, killAllLweProcesses, listLweObjects, hotswapLweSettings, listLweProperties, listLweAudioObjects, listLweEffects, type HotswapOptions } from '../services/lwe.service'
import { stopDisplay } from '../services/display.service'
import { stopPlaylist } from '../services/playlist-player.service'
import type { ScreenTarget } from '@shared/types'
import { invalidateEnvCache } from '../services/wallpaper.service'
import { getConnectedScreens } from '../utils/platform'
import { listDesktopApplications } from '../services/shortcuts.service'

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

  ipcMain.handle(IpcChannels.LWE_LAUNCH, async (_e, wallpaperPath: string, options?: { screen?: ScreenTarget; fps?: number }) => {
    await launchLweAsync(wallpaperPath, options)
    return { ok: true, running: isLweRunning() }
  })

  ipcMain.handle(IpcChannels.LWE_STOP, async () => {
    stopPlaylist()
    await stopDisplay()
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

  // live edits go to whichever engines show the wallpaper being edited
  ipcMain.handle(IpcChannels.LWE_HOTSWAP_SETTINGS, async (_e, options: HotswapOptions, wallpaperPath?: string) => {
    return { ok: await hotswapLweSettings(options, { wallpaperPath }) }
  })

  ipcMain.handle(IpcChannels.LWE_LIST_SCREENS, () => {
    return getConnectedScreens()
  })

  ipcMain.handle(IpcChannels.LWE_LIST_APPLICATIONS, () => listDesktopApplications())

  ipcMain.handle(IpcChannels.LWE_PICK_SHORTCUT_PATH, async (_e, kind: 'file' | 'directory') => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? win, {
      properties: [kind === 'directory' ? 'openDirectory' : 'openFile'],
      title: kind === 'directory' ? 'Choose a folder to open' : 'Choose a file to open'
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
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

  ipcMain.handle(IpcChannels.LWE_LIST_EFFECTS, async (_e, wallpaperPath: string) => {
    try {
      return await listLweEffects(wallpaperPath)
    } catch (err) {
      console.warn('[LWE] list-effects failed for', wallpaperPath, ':', (err as Error).message)
      return []
    }
  })
}
