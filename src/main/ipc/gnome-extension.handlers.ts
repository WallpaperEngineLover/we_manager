import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getGnomeExtensionStatus, installGnomeExtension } from '../services/gnome-extension.service'

export function registerGnomeExtensionHandlers(): void {
  ipcMain.handle(IpcChannels.GNOME_EXTENSION_STATUS, () => getGnomeExtensionStatus())

  ipcMain.handle(IpcChannels.GNOME_EXTENSION_INSTALL, async () => {
    try {
      return await installGnomeExtension()
    } catch (error) {
      return { ok: false, message: (error as Error).message, status: await getGnomeExtensionStatus() }
    }
  })
}
