import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ScheduleRule } from '@shared/types'
import { deleteScheduleRule, getScheduleRules, runRule, saveScheduleRule } from '../services/schedule.service'

export function registerScheduleHandlers(): void {
  ipcMain.handle(IpcChannels.SCHEDULE_GET_ALL, () => getScheduleRules())

  ipcMain.handle(IpcChannels.SCHEDULE_SAVE, (_e, rule: Omit<ScheduleRule, 'id'> & { id?: string }) =>
    saveScheduleRule(rule)
  )

  ipcMain.handle(IpcChannels.SCHEDULE_DELETE, (_e, id: string) => {
    deleteScheduleRule(id)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.SCHEDULE_RUN, async (_e, id: string) => {
    const rule = getScheduleRules().find((r) => r.id === id)
    if (!rule) throw new Error('Schedule rule not found')
    await runRule(rule)
    return { ok: true }
  })
}
