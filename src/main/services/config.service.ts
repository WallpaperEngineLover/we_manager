import Store from 'electron-store'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { WE_APP_ID } from '@shared/constants'

interface AppConfig {
  workshopPath: string | null
  defaultFps: number | null
}

const store = new Store<AppConfig>({
  name: 'config',
  defaults: {
    workshopPath: null,
    defaultFps: null
  }
})

export function getConfiguredWorkshopPath(): string | null {
  return store.get('workshopPath')
}

export function setConfiguredWorkshopPath(p: string): void {
  store.set('workshopPath', p)
}

export function isWorkshopPathConfigured(): boolean {
  return store.get('workshopPath') !== null
}

export function getDefaultFps(): number | null {
  return store.get('defaultFps')
}

export function setDefaultFps(fps: number | null): void {
  store.set('defaultFps', fps)
}

/** Path where we store our copy of config.json */
export function getWeConfigPath(): string {
  return path.join(app.getPath('userData'), 'we-config.json')
}

/**
 * Import a Wallpaper Engine config.json:
 * 1. Copies the file to our data dir
 * 2. Replaces all old workshop content paths with the configured workshop path
 * 3. Returns the path to the fixed copy
 */
export function importWEConfigFile(sourcePath: string): string {
  const workshopPath = getConfiguredWorkshopPath()
  if (!workshopPath) throw new Error('Workshop path must be configured before importing')

  let content = fs.readFileSync(sourcePath, 'utf8')

  // The WE config uses paths like:
  //   D:/Games/SteamLibrary/steamapps/workshop/content/431960/...
  //   C:/Program Files (x86)/Steam/steamapps/workshop/content/431960/...
  // We need to replace everything up to and including "431960/" with the configured workshop path + "/"
  // Match any path prefix ending in /431960/ (Windows or Linux style)
  const appId = String(WE_APP_ID)
  const pattern = new RegExp(
    // Matches: optional drive letter + any path chars + /431960/
    `[A-Za-z]:[^"]*?/steamapps/workshop/content/${appId}/|` +
    // Also match Linux-style paths
    `/[^"]*?/steamapps/workshop/content/${appId}/`,
    'g'
  )

  const normalizedTarget = workshopPath.endsWith('/') ? workshopPath : workshopPath + '/'
  content = content.replace(pattern, normalizedTarget)

  const destPath = getWeConfigPath()
  fs.writeFileSync(destPath, content, 'utf8')
  console.log(`[Config] Imported WE config from ${sourcePath} → ${destPath}`)
  return destPath
}

/** Create a fresh empty WE-style config.json */
export function createFreshConfig(): string {
  const destPath = getWeConfigPath()
  const skeleton = {
    '~': {
      general: {
        browser: { folders: [] },
        playlists: []
      }
    }
  }
  fs.writeFileSync(destPath, JSON.stringify(skeleton, null, '\t'), 'utf8')
  console.log(`[Config] Created fresh config at ${destPath}`)
  return destPath
}
