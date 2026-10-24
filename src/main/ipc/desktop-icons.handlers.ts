import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { setDesktopIconsEnabled, getDesktopIconsEnabled, getDesktopIconsStatus, installDesktopIconsDependencies } from '../services/desktop-icons.service'

export function registerDesktopIconsHandlers(): void {
  ipcMain.handle(IpcChannels.DESKTOP_ICONS_SET_ENABLED, (_e, enabled: boolean) => {
    setDesktopIconsEnabled(enabled)
    return { ok: true, enabled }
  })

  ipcMain.handle(IpcChannels.DESKTOP_ICONS_GET_STATUS, () => getDesktopIconsStatus())

  ipcMain.handle(IpcChannels.DESKTOP_ICONS_INSTALL_DEPS, () => installDesktopIconsDependencies())

  ipcMain.handle(IpcChannels.DESKTOP_ICONS_GET_ENABLED, () => {
    return getDesktopIconsEnabled()
  })
}
