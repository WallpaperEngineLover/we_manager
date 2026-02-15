import { BrowserWindow } from 'electron'
import { registerSteamHandlers } from './steam.handlers'
import { registerWorkshopHandlers } from './workshop.handlers'
import { registerLibraryHandlers } from './library.handlers'
import { registerWallpaperHandlers } from './wallpaper.handlers'
import { registerConfigHandlers } from './config.handlers'
import { registerFolderHandlers } from './folders.handlers'
import { registerShellHandlers } from './shell.handlers'
import { registerLweHandlers } from './lwe.handlers'
import { registerDesktopIconsHandlers } from './desktop-icons.handlers'

export function registerAllHandlers(win: BrowserWindow): void {
  registerSteamHandlers(win)
  registerWorkshopHandlers()
  registerLibraryHandlers()
  registerWallpaperHandlers()
  registerConfigHandlers()
  registerFolderHandlers()
  registerShellHandlers()
  registerLweHandlers(win)
  registerDesktopIconsHandlers()
}
