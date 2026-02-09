import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import * as lib from '../services/library.service'

export function registerFolderHandlers(): void {
  ipcMain.handle(IpcChannels.FOLDERS_GET_ALL, () => {
    return lib.getAllFolders()
  })

  ipcMain.handle(IpcChannels.FOLDERS_CREATE, (_e, title: string) => {
    return lib.createFolder(title)
  })

  ipcMain.handle(IpcChannels.FOLDERS_RENAME, (_e, id: string, title: string) => {
    return lib.renameFolder(id, title)
  })

  ipcMain.handle(IpcChannels.FOLDERS_DELETE, (_e, id: string) => {
    lib.deleteFolder(id)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.FOLDERS_ADD_ITEMS, (_e, folderId: string, itemIds: string[]) => {
    return lib.addItemsToFolder(folderId, itemIds)
  })

  ipcMain.handle(IpcChannels.FOLDERS_REMOVE_ITEMS, (_e, folderId: string, itemIds: string[]) => {
    return lib.removeItemsFromFolder(folderId, itemIds)
  })

  ipcMain.handle(IpcChannels.FOLDERS_IMPORT_WE_CONFIG, (_e, configPath: string) => {
    return lib.importWEConfig(configPath)
  })

  ipcMain.handle(IpcChannels.FOLDERS_CLEANUP, () => {
    const removed = lib.cleanupFolders()
    return { removed }
  })
}
