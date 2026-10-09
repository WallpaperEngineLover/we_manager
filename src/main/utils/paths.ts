import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'
import { WE_APP_ID } from '@shared/constants'
import { getConfiguredBackupPath, getConfiguredWorkshopPath, getExtraLibraries } from '../services/config.service'

export function getWorkshopPath(): string {
  return getConfiguredWorkshopPath() ?? getDefaultWorkshopPath()
}

// workshop and backup folders have their own scans
export function getExtraLibraryRoots(): string[] {
  const skip = new Set(
    [getWorkshopPath(), getConfiguredBackupPath()].filter((p): p is string => !!p).map((p) => path.resolve(p))
  )
  const roots: string[] = []
  for (const library of getExtraLibraries()) {
    const resolved = path.resolve(library.path)
    if (!skip.has(resolved) && !roots.includes(resolved)) roots.push(resolved)
  }
  return roots
}

/** Where Steam keeps its own library on Linux: native, Flatpak Steam, Snap */
export function getSteamRoots(): string[] {
  const home = os.homedir()
  return [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam')
  ]
}

export function getDefaultWorkshopPath(): string {
  const home = os.homedir()
  if (process.platform === 'linux') {
    const candidates = getSteamRoots().map((root) => path.join(root, 'steamapps', 'workshop', 'content', String(WE_APP_ID)))
    return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]
  }
  if (process.platform === 'win32') {
    const workshopSuffix = path.join('Steam', 'steamapps', 'workshop', 'content', String(WE_APP_ID))
    const candidates = [
      path.join('C:', 'Program Files (x86)', workshopSuffix),
      path.join('C:', 'Program Files', workshopSuffix),
      path.join('C:', 'SteamLibrary', 'steamapps', 'workshop', 'content', String(WE_APP_ID)),
      path.join(os.homedir(), 'AppData', 'Local', workshopSuffix)
    ]
    return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]
  }
  // macOS
  return path.join(
    home,
    'Library',
    'Application Support',
    'Steam',
    'steamapps',
    'workshop',
    'content',
    String(WE_APP_ID)
  )
}

export function getDataPath(): string {
  return app.getPath('userData')
}

export function getPreviewCachePath(): string {
  return path.join(getDataPath(), 'preview-cache')
}

/** Where a downloaded prebuilt engine lives, outside the app's own data so the AppImage and .deb share it */
export function getLwePrebuiltDir(): string {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(dataHome, 'linux-wallpaperengine-kde')
}

export function getLweManifestPath(): string {
  return path.join(getDataPath(), 'lwe-install-manifest.json')
}

export function getThumbnailsPath(): string {
  return path.join(getDataPath(), 'thumbnails')
}
