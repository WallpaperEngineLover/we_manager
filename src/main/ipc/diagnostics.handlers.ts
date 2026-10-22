import { ipcMain, dialog, shell, type BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { IpcChannels } from '@shared/ipc-channels'
import { t } from '../i18n'
import { NoEngineRunningError, collectDiagnostics } from '../services/diagnostics.service'

let running = false

export function registerDiagnosticsHandlers(win: BrowserWindow): void {
  ipcMain.handle(IpcChannels.DIAGNOSTICS_COLLECT, async () => {
    if (running) throw new Error('Already collecting')
    running = true
    let report: string
    try {
      report = await collectDiagnostics()
    } catch (err) {
      if (err instanceof NoEngineRunningError) return { status: 'no-engine' as const }
      throw err
    } finally {
      running = false
    }

    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    const result = await dialog.showSaveDialog(win, {
      title: t('diagnostics.saveTitle'),
      defaultPath: path.join(os.homedir(), `we-manager-diagnostics-${stamp}.txt`),
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return { status: 'cancelled' as const }

    fs.writeFileSync(result.filePath, report)
    shell.showItemInFolder(result.filePath)
    return { status: 'saved' as const, path: result.filePath }
  })
}
