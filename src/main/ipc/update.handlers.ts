import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { UpdateChecks, UpdateTarget } from '@shared/types'
import {
  checkNow,
  dismissUpdate,
  getUpdateStatus,
  installAppUpdate,
  restartApp,
  setUpdateChecksAndCheck
} from '../services/update.service'

export function registerUpdateHandlers(): void {
  ipcMain.handle(IpcChannels.UPDATES_STATUS, () => getUpdateStatus())
  ipcMain.handle(IpcChannels.UPDATES_SET_CHECKS, (_e, checks: UpdateChecks) => setUpdateChecksAndCheck(checks))
  ipcMain.handle(IpcChannels.UPDATES_CHECK, () => checkNow())
  ipcMain.handle(IpcChannels.UPDATES_DISMISS, (_e, target: UpdateTarget, version: string) => dismissUpdate(target, version))
  ipcMain.handle(IpcChannels.UPDATES_INSTALL_APP, () => installAppUpdate())
  ipcMain.handle(IpcChannels.UPDATES_RESTART, () => restartApp())
}
