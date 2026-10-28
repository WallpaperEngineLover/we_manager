import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { UpdateChecks, UpdateTarget } from '@shared/types'
import {
  checkNow,
  dismissUpdate,
  getUpdateStatus,
  installAppUpdate,
  listVersions,
  restartApp,
  setUpdateChecksAndCheck
} from '../services/update.service'
import { hasPrebuiltAsset } from '../services/lwe-prebuilt.service'

export function registerUpdateHandlers(): void {
  ipcMain.handle(IpcChannels.UPDATES_STATUS, () => getUpdateStatus())
  ipcMain.handle(IpcChannels.UPDATES_SET_CHECKS, (_e, checks: UpdateChecks) => setUpdateChecksAndCheck(checks))
  ipcMain.handle(IpcChannels.UPDATES_CHECK, () => checkNow())
  ipcMain.handle(IpcChannels.UPDATES_DISMISS, (_e, target: UpdateTarget, version: string, forever: boolean) =>
    dismissUpdate(target, version, forever === true))
  ipcMain.handle(IpcChannels.UPDATES_INSTALL_APP, (_e, tag?: string) => installAppUpdate(tag))
  ipcMain.handle(IpcChannels.UPDATES_VERSIONS, (_e, target: UpdateTarget) => {
    if (target !== 'app' && target !== 'engine') throw new Error(`Unknown update target ${String(target)}.`)
    return listVersions(target, target === 'engine' ? hasPrebuiltAsset : undefined)
  })
  ipcMain.handle(IpcChannels.UPDATES_RESTART, () => restartApp())
}
