import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getLweStatus, detectDistro, installLweDeps, installLwe, uninstallLwe, launchLweAsync, isLweRunning, killAllLweProcesses, listLweObjects, hotswapLweSettings, listLweProperties, listLweAudioObjects, listLweEffects, listLweFonts, listInputFiles, type HotswapOptions } from '../services/lwe.service'
import { getPrebuiltTarget, installLwePrebuilt } from '../services/lwe-prebuilt.service'
import { installLibnode, libnodeNeeded } from '../services/lwe-libnode.service'
import { addUserFonts, listUserFonts, removeUserFont } from '../services/fonts.service'
import { stopDisplay } from '../services/display.service'
import { stopPlaylist } from '../services/playlist-player.service'
import type { ScreenTarget } from '@shared/types'
import { invalidateEnvCache } from '../services/wallpaper.service'
import { refreshEngineUpdate } from '../services/update.service'
import { getConnectedScreens, getMirroredScreens } from '../utils/platform'
import { listDesktopApplications } from '../services/shortcuts.service'
import { findWallpaperVideoFile, getVideoDurationSec } from '../utils/video'
import { t } from '../i18n'

export function registerLweHandlers(win: BrowserWindow): void {
  ipcMain.handle(IpcChannels.LWE_STATUS, () => {
    return getLweStatus()
  })

  ipcMain.handle(IpcChannels.LWE_DETECT_DISTRO, () => {
    return detectDistro()
  })

  ipcMain.handle(IpcChannels.LWE_INSTALL_DEPS, async () => {
    return { ok: await installLweDeps(win) }
  })

  ipcMain.handle(IpcChannels.LWE_LIST_FONTS, async (_e, wallpaperPath: string) => {
    try {
      return await listLweFonts(wallpaperPath)
    } catch (err) {
      console.warn('[LWE] list-fonts failed for', wallpaperPath, ':', (err as Error).message)
      return []
    }
  })

  ipcMain.handle(IpcChannels.FONTS_LIST, () => listUserFonts())

  ipcMain.handle(IpcChannels.FONTS_ADD, async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? win, {
      properties: ['openFile', 'multiSelections'],
      title: t('dialog.pickFonts'),
      filters: [{ name: t('dialog.fontFiles'), extensions: ['ttf', 'otf', 'ttc', 'otc'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { added: [], rejected: [], fonts: listUserFonts() }
    return { ...addUserFonts(result.filePaths), fonts: listUserFonts() }
  })

  ipcMain.handle(IpcChannels.FONTS_REMOVE, (_e, name: string) => {
    removeUserFont(name)
    return listUserFonts()
  })

  ipcMain.handle(IpcChannels.LWE_LIBNODE_NEEDED, () => libnodeNeeded())

  ipcMain.handle(IpcChannels.LWE_INSTALL_LIBNODE, async () => {
    return { ok: await installLibnode(win) }
  })

  ipcMain.handle(IpcChannels.LWE_INSTALL, async () => {
    await installLwe(win)
    invalidateEnvCache()
    refreshEngineUpdate()
    return getLweStatus()
  })

  ipcMain.handle(IpcChannels.LWE_PREBUILT_TARGET, () => getPrebuiltTarget())

  ipcMain.handle(IpcChannels.LWE_INSTALL_PREBUILT, async (_e, tag?: string) => {
    if (tag !== undefined && typeof tag !== 'string') throw new Error('The version has to be a release tag.')
    await installLwePrebuilt(win, tag)
    invalidateEnvCache()
    refreshEngineUpdate()
    return getLweStatus()
  })

  ipcMain.handle(IpcChannels.LWE_UNINSTALL, async () => {
    const result = await uninstallLwe()
    invalidateEnvCache()
    refreshEngineUpdate()
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
    // a parse failure means "no objects"
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

  ipcMain.handle(IpcChannels.LWE_MIRRORED_SCREENS, () => getMirroredScreens())

  ipcMain.handle(IpcChannels.LWE_INPUT_FILES, () => listInputFiles(getConnectedScreens()))

  ipcMain.handle(IpcChannels.LWE_LIST_APPLICATIONS, () => listDesktopApplications())

  // null when there is no video file or no ffprobe to measure it
  ipcMain.handle(IpcChannels.LWE_VIDEO_DURATION, async (_e, wallpaperPath: string, projectFile?: string) => {
    const videoFile = findWallpaperVideoFile(wallpaperPath, projectFile)
    return videoFile ? ((await getVideoDurationSec(videoFile)) ?? null) : null
  })

  ipcMain.handle(IpcChannels.LWE_PICK_SHORTCUT_PATH, async (_e, kind: 'file' | 'directory') => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? win, {
      properties: [kind === 'directory' ? 'openDirectory' : 'openFile'],
      title: kind === 'directory' ? t('dialog.pickShortcutFolder') : t('dialog.pickShortcutFile')
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.LWE_LIST_PROPERTIES, async (_e, wallpaperPath: string) => {
    // a parse failure means "no properties"
    try {
      return await listLweProperties(wallpaperPath)
    } catch (err) {
      console.warn('[LWE] list-properties failed for', wallpaperPath, ':', (err as Error).message)
      return []
    }
  })

  ipcMain.handle(IpcChannels.LWE_LIST_AUDIO_OBJECTS, async (_e, wallpaperPath: string) => {
    // a parse failure means "nothing detected"

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
