import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'
import { WE_APP_ID } from '@shared/constants'
import { getConfiguredWorkshopPath } from '../services/config.service'

export function getWorkshopPath(): string {
  return getConfiguredWorkshopPath() ?? getDefaultWorkshopPath()
}

export function getDefaultWorkshopPath(): string {
  const home = os.homedir()
  if (process.platform === 'linux') {
    const candidates = [
      path.join(home, '.steam', 'steam', 'steamapps', 'workshop', 'content', String(WE_APP_ID)),
      path.join(home, '.local', 'share', 'Steam', 'steamapps', 'workshop', 'content', String(WE_APP_ID))
    ]
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
