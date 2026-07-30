import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { queryWorkshop, getWorkshopItem, queryWorkshopByCreator } from '../services/workshop.service'
import type { WorkshopQueryParams, CreatorWorkshopQueryParams } from '@shared/types'

export function registerWorkshopHandlers(): void {
  ipcMain.handle(IpcChannels.WORKSHOP_QUERY, async (_e, params: WorkshopQueryParams) => {
    return queryWorkshop(params)
  })

  ipcMain.handle(IpcChannels.WORKSHOP_GET_ITEM, async (_e, publishedFileId: string) => {
    return getWorkshopItem(publishedFileId)
  })

  ipcMain.handle(
    IpcChannels.WORKSHOP_QUERY_BY_CREATOR,
    async (_e, creatorSteamId: string, params?: CreatorWorkshopQueryParams) => {
      return queryWorkshopByCreator(creatorSteamId, params)
    }
  )
}
