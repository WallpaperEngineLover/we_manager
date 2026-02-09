import { ipcMain, shell } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import * as path from 'path'
import * as fs from 'fs'

export function registerShellHandlers(): void {
  // Open a file with the OS default application (e.g. video in media player)
  ipcMain.handle(IpcChannels.SHELL_OPEN_WITH_DEFAULT, async (_e, filePath: string) => {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return { ok: false, error: 'File not found' }
    const result = await shell.openPath(resolved)
    return { ok: !result, error: result || undefined }
  })

  // Open a folder in the system file manager
  ipcMain.handle(IpcChannels.SHELL_OPEN_IN_FILE_MANAGER, async (_e, folderPath: string) => {
    const resolved = path.resolve(folderPath)
    if (!fs.existsSync(resolved)) return { ok: false, error: 'Path not found' }
    shell.showItemInFolder(resolved)
    return { ok: true }
  })

  // Open a path (file or folder) with shell.openPath
  ipcMain.handle(IpcChannels.SHELL_OPEN_PATH, async (_e, targetPath: string) => {
    const resolved = path.resolve(targetPath)
    const result = await shell.openPath(resolved)
    return { ok: !result, error: result || undefined }
  })
}
