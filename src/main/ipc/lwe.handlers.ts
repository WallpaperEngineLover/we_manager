import { ipcMain, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getLweStatus, detectDistro, installLweDeps, installLwe, launchLwe, stopLwe, isLweRunning } from '../services/lwe.service'
import { invalidateEnvCache } from '../services/wallpaper.service'

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

  ipcMain.handle(IpcChannels.LWE_LAUNCH, (_e, wallpaperPath: string, options?: { screenRoot?: string; fps?: number }) => {
    launchLwe(wallpaperPath, options)
    return { ok: true, running: isLweRunning() }
  })

  ipcMain.handle(IpcChannels.LWE_STOP, () => {
    stopLwe()
    return { ok: true }
  })
}
