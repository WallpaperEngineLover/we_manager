import Store from 'electron-store'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { WE_APP_ID } from '@shared/constants'

interface AppConfig {
  workshopPath: string | null
  defaultFps: number | null
  lweRepoUrl: string | null
  lweRepoBranch: string | null
  lweCmakeArgs: string | null
  backupPath: string | null
  autoUnsubscribeAfterBackup: boolean
  trayEnabled: boolean
  autostartEnabled: boolean
  autostartMinimized: boolean
  autostartPlaylistId: string | null
  killLweOnQuit: boolean
  recommendedFpsEnabled: boolean
  recommendedWebFpsEnabled: boolean
  audioScreen: string | null
  ambientVolume: number | null
}

const store = new Store<AppConfig>({
  name: 'config',
  defaults: {
    workshopPath: null,
    defaultFps: null,
    recommendedFpsEnabled: false,
    recommendedWebFpsEnabled: false,
    lweRepoUrl: null,
    lweRepoBranch: null,
    lweCmakeArgs: null,
    backupPath: null,
    autoUnsubscribeAfterBackup: false,
    trayEnabled: false,
    autostartEnabled: false,
    autostartMinimized: false,
    autostartPlaylistId: null,
    killLweOnQuit: false,
    audioScreen: null,
    ambientVolume: null
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

export function getConfiguredBackupPath(): string | null {
  return store.get('backupPath')
}

export function setConfiguredBackupPath(p: string): void {
  store.set('backupPath', p)
}

export function isBackupPathConfigured(): boolean {
  return store.get('backupPath') !== null
}

export function getAutoUnsubscribeAfterBackup(): boolean {
  return store.get('autoUnsubscribeAfterBackup')
}

export function setAutoUnsubscribeAfterBackup(enabled: boolean): void {
  store.set('autoUnsubscribeAfterBackup', enabled)
}

export function getTrayEnabled(): boolean {
  return store.get('trayEnabled')
}

export function setTrayEnabled(enabled: boolean): void {
  store.set('trayEnabled', enabled)
}

export function getAutostartEnabled(): boolean {
  return store.get('autostartEnabled')
}

export function getAutostartMinimized(): boolean {
  return store.get('autostartMinimized')
}

export function setAutostart(enabled: boolean, minimized: boolean): void {
  store.set('autostartEnabled', enabled)
  store.set('autostartMinimized', minimized)
}

export function getAutostartPlaylistId(): string | null {
  return store.get('autostartPlaylistId')
}

export function setAutostartPlaylistId(id: string | null): void {
  store.set('autostartPlaylistId', id)
}

export function getKillLweOnQuit(): boolean {
  return store.get('killLweOnQuit')
}

export function setKillLweOnQuit(enabled: boolean): void {
  store.set('killLweOnQuit', enabled)
}

export function getDefaultFps(): number | null {
  return store.get('defaultFps')
}

export function setDefaultFps(fps: number | null): void {
  store.set('defaultFps', fps)
}

/** When enabled, video wallpapers without a manual FPS override are launched at their own native frame rate. */
export function getRecommendedFpsEnabled(): boolean {
  return store.get('recommendedFpsEnabled')
}

export function setRecommendedFpsEnabled(enabled: boolean): void {
  store.set('recommendedFpsEnabled', enabled)
}

/** When enabled, web wallpapers without a manual FPS override launch at RECOMMENDED_WEB_FPS
 *  instead of the default limit - CEF paints internally at that rate regardless, so a lower
 *  default just throttles how often the engine displays what CEF already rendered. */
export function getRecommendedWebFpsEnabled(): boolean {
  return store.get('recommendedWebFpsEnabled')
}

export function setRecommendedWebFpsEnabled(enabled: boolean): void {
  store.set('recommendedWebFpsEnabled', enabled)
}

/** Screen name (matches --screen-root/--audio-screen) that alone produces audio; null = every screen can. */
export function getAudioScreen(): string | null {
  return store.get('audioScreen')
}

export function setAudioScreen(screen: string | null): void {
  store.set('audioScreen', screen)
}

/** 0-128, applied to non-video (scene sound + web) backgrounds instead of the per-wallpaper volume; null = same volume. */
export function getAmbientVolume(): number | null {
  return store.get('ambientVolume')
}

export function setAmbientVolume(volume: number | null): void {
  store.set('ambientVolume', volume)
}

/** Custom linux-wallpaperengine repo (git URL or local path); null = official repo. */
export function getLweRepoUrl(): string | null {
  return store.get('lweRepoUrl')
}

/** Branch/tag to build from the custom repo; null = default branch. */
export function getLweRepoBranch(): string | null {
  return store.get('lweRepoBranch')
}

export function setLweRepo(url: string | null, branch: string | null): void {
  store.set('lweRepoUrl', url?.trim() || null)
  store.set('lweRepoBranch', branch?.trim() || null)
}

/** Extra cmake arguments (e.g. "-DENABLE_KDE_EXPERIMENTAL_FEATURES=ON"), appended to the build. */
export function getLweCmakeArgs(): string | null {
  return store.get('lweCmakeArgs')
}

export function setLweCmakeArgs(args: string | null): void {
  store.set('lweCmakeArgs', args?.trim() || null)
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
  const appId = String(WE_APP_ID)
  const pattern = new RegExp(
    `[A-Za-z]:[^"]*?/steamapps/workshop/content/${appId}/|` +
    `/[^"]*?/steamapps/workshop/content/${appId}/`,
    'g'
  )

  const normalizedTarget = workshopPath.endsWith('/') ? workshopPath : workshopPath + '/'
  content = content.replace(pattern, normalizedTarget)

  const destPath = getWeConfigPath()
  fs.writeFileSync(destPath, content, 'utf8')
  console.log(`[Config] Imported WE config from ${sourcePath} to ${destPath}`)
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
