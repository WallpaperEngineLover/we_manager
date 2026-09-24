import Store from 'electron-store'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { WE_APP_ID } from '@shared/constants'
import type { DisplayMode, EngineFlagPreset, EngineFlags, SteamIdentity } from '@shared/types'

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
  /** Green outline on liked wallpapers, red on ones whose like failed */
  voteBorders: boolean
  recommendedFpsEnabled: boolean
  recommendedWebFpsEnabled: boolean
  audioScreen: string | null
  ambientVolume: number | null
  /** Default --audio-sensitivity multiplier for audio-reactive objects with no per-wallpaper override */
  defaultAudioSensitivity: number
  /** Passes --render-debug no-puppet-animation to LWE - freezes puppet (.mdl) meshes at their bind pose, for troubleshooting */
  disablePuppetAnimation: boolean
  /** Passes --disable-animations to LWE - freezes all scene time (scripts, particles, effects and puppet meshes) */
  disableAnimations: boolean
  steamIdentity: SteamIdentity
  /** steamId64 of creators whose workshop items are hidden from browsing by default */
  ignoredCreators: string[]
  /** Launch-only engine flags for every wallpaper; disableAnimations lives in its own key above */
  engineFlags: EngineFlags
  engineFlagPresets: EngineFlagPreset[]
  displayMode: DisplayMode
}

const store = new Store<AppConfig>({
  name: 'config',
  defaults: {
    workshopPath: null,
    defaultFps: null,
    recommendedFpsEnabled: false,
    recommendedWebFpsEnabled: true,
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
    voteBorders: true,
    audioScreen: null,
    ambientVolume: null,
    defaultAudioSensitivity: 1,
    disablePuppetAnimation: false,
    disableAnimations: false,
    steamIdentity: 'wallpaper-engine',
    ignoredCreators: [],
    engineFlags: {},
    engineFlagPresets: [],
    displayMode: 'shared'
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

export function getVoteBorders(): boolean {
  return store.get('voteBorders')
}

export function setVoteBorders(enabled: boolean): void {
  store.set('voteBorders', enabled)
}

/** How this process identifies itself to Steam - 'wallpaper-engine' registers under WE's own
 *  app id (full workshop compatibility, but Steam treats this process as WE and closes it on
 *  logout); 'standalone' registers under a neutral test app id so Steam leaves it running.
 *  Only read once at startup (steam.service.ts initSteam()) - changing it takes effect on relaunch. */
export function getSteamIdentity(): SteamIdentity {
  return store.get('steamIdentity')
}

export function setSteamIdentity(identity: SteamIdentity): void {
  store.set('steamIdentity', identity)
}

export function getIgnoredCreators(): string[] {
  return store.get('ignoredCreators')
}

export function ignoreCreator(steamId: string): void {
  const current = store.get('ignoredCreators')
  if (!current.includes(steamId)) store.set('ignoredCreators', [...current, steamId])
}

export function unignoreCreator(steamId: string): void {
  store.set('ignoredCreators', store.get('ignoredCreators').filter((id) => id !== steamId))
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
 *  instead of the default limit - the page only produces a frame when the engine presents one,
 *  so a lower default makes the animation itself choppy. */
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

/** Freezes puppet (.mdl) meshes at their bind pose (--render-debug no-puppet-animation) - troubleshooting only. */
export function getDisablePuppetAnimation(): boolean {
  return store.get('disablePuppetAnimation')
}

export function setDisablePuppetAnimation(disabled: boolean): void {
  store.set('disablePuppetAnimation', disabled)
}

export function getDisableAnimations(): boolean {
  return store.get('disableAnimations')
}

export function getGlobalEngineFlags(): EngineFlags {
  return { ...store.get('engineFlags'), disableAnimations: store.get('disableAnimations') }
}

export function setGlobalEngineFlags(flags: EngineFlags): void {
  const { disableAnimations, ...rest } = flags
  store.set('engineFlags', rest)
  store.set('disableAnimations', !!disableAnimations)
}

export function getEngineFlagPresets(): EngineFlagPreset[] {
  return store.get('engineFlagPresets')
}

export function setEngineFlagPresets(presets: EngineFlagPreset[]): void {
  store.set('engineFlagPresets', presets.filter((p) => !p.builtIn))
}

/** 'shared' runs one engine across every screen, 'per-screen' one engine (and playlist) per screen */
export function getDisplayMode(): DisplayMode {
  return store.get('displayMode')
}

export function setDisplayMode(mode: DisplayMode): void {
  store.set('displayMode', mode)
}

/** Default --audio-sensitivity multiplier for audio-reactive objects with no per-wallpaper override. */
export function getDefaultAudioSensitivity(): number {
  return store.get('defaultAudioSensitivity')
}

export function setDefaultAudioSensitivity(multiplier: number): void {
  store.set('defaultAudioSensitivity', multiplier)
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
