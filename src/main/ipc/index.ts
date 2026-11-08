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
import { registerGnomeExtensionHandlers } from './gnome-extension.handlers'
import { registerBackupHandlers } from './backup.handlers'
import { registerVideoToolsHandlers } from './video-tools.handlers'
import { registerPlaylistHandlers } from './playlist.handlers'
import { registerAppRuleHandlers } from './app-rules.handlers'
import { registerScheduleHandlers } from './schedule.handlers'
import { registerUpdateHandlers } from './update.handlers'
import { registerDiagnosticsHandlers } from './diagnostics.handlers'

export function registerAllHandlers(win: BrowserWindow): void {
  registerSteamHandlers(win)
  registerWorkshopHandlers()
  registerLibraryHandlers(win)
  registerWallpaperHandlers()
  registerConfigHandlers()
  registerFolderHandlers()
  registerShellHandlers()
  registerLweHandlers(win)
  registerDesktopIconsHandlers()
  registerGnomeExtensionHandlers()
  registerBackupHandlers(win)
  registerVideoToolsHandlers(win)
  registerPlaylistHandlers()
  registerScheduleHandlers()
  registerAppRuleHandlers()
  registerUpdateHandlers()
  registerDiagnosticsHandlers(win)
}
