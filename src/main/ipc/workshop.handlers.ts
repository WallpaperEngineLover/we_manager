import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { queryWorkshop, getWorkshopItem } from '../services/workshop.service'
import type { WorkshopQueryParams } from '@shared/types'

export function registerWorkshopHandlers(): void {
  ipcMain.handle(IpcChannels.WORKSHOP_QUERY, async (_e, params: WorkshopQueryParams) => {
    return queryWorkshop(params)
  })

  ipcMain.handle(IpcChannels.WORKSHOP_GET_ITEM, async (_e, publishedFileId: string) => {
    return getWorkshopItem(publishedFileId)
  })
}
