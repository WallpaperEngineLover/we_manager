import { ipcMain, shell } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import { isCommandAvailable } from '../utils/platform'
import { isSafeExternalUrl } from '../utils/urlPolicy'

export function registerShellHandlers(): void {
  ipcMain.handle(IpcChannels.SHELL_OPEN_WITH_DEFAULT, async (_e, filePath: string) => {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return { ok: false, error: 'File not found' }
    const result = await shell.openPath(resolved)
    return { ok: !result, error: result || undefined }
  })

  ipcMain.handle(IpcChannels.SHELL_OPEN_IN_FILE_MANAGER, (_e, folderPath: string) => {
    const resolved = path.resolve(folderPath)
    if (!fs.existsSync(resolved)) return { ok: false, error: 'Path not found' }
    shell.showItemInFolder(resolved)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.SHELL_OPEN_PATH, async (_e, targetPath: string) => {
    if (typeof targetPath !== 'string' || !targetPath) return { ok: false, error: 'Path not found' }
    const resolved = path.resolve(targetPath)
    if (!fs.existsSync(resolved)) return { ok: false, error: 'Path not found' }
    const result = await shell.openPath(resolved)
    return { ok: !result, error: result || undefined }
  })

  ipcMain.handle(IpcChannels.SHELL_OPEN_PATHS, async (_e, targetPaths: string[]) => {
    const resolved = [...new Set(targetPaths.map((p) => path.resolve(p)))].filter((p) =>
      fs.existsSync(p)
    )
    if (resolved.length === 0) return { ok: false, error: 'No valid paths' }
    if (resolved.length === 1) {
      const result = await shell.openPath(resolved[0])
      return { ok: !result, error: result || undefined }
    }

    const tabbedFileManager = ['dolphin', 'nautilus'].find(isCommandAvailable)
    if (tabbedFileManager) {
      spawn(tabbedFileManager, resolved, { detached: true, stdio: 'ignore' }).unref()
      return { ok: true }
    }

    for (const p of resolved) {
      await shell.openPath(p)
    }
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.SHELL_OPEN_EXTERNAL, async (_e, url: string) => {
    // web links and steam:// only, the opener would run whatever scheme handler a URL names
    if (!isSafeExternalUrl(url)) return { ok: false, error: 'This kind of link is not opened' }
    try {
      await shell.openExternal(url)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
