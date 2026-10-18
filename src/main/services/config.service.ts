import { openStore } from '../utils/safeStore'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { WE_APP_ID } from '@shared/constants'
import { normalizeAppearance, type Appearance } from '@shared/appearance'
import { normalizeCardBorders, type CardBorders } from '@shared/cardBorders'
import { normalizeCardBadges, type CardBadges } from '@shared/cardBadges'
import { normalizeLanguagePreference, type LanguagePreference } from '@shared/i18n'
import { normalizeUpdateChecks } from '@shared/updates'
import type {
  DisplayMode,
  EngineFlagPreset,
  EngineFlags,
  ExtraLibrary,
  SplitScreen,
  SteamIdentity,
  UpdateChecks,
  UpdateTarget
} from '@shared/types'

interface AppConfig {
  workshopPath: string | null
  /** Plain strings are the old unnamed format */
  extraLibraryPaths: (string | ExtraLibrary)[]
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
  /** Legacy, only read to migrate into cardBorders */
  voteBorders: boolean
  cardBorders: CardBorders | null
  cardBadges: CardBadges | null
  recommendedFpsEnabled: boolean
  recommendedWebFpsEnabled: boolean
  audioScreen: string | null
  ambientVolume: number | null
  defaultAudioSensitivity: number
  /** --render-debug no-puppet-animation */
  disablePuppetAnimation: boolean
  disableAnimations: boolean
  steamIdentity: SteamIdentity
  /** steamId64s hidden from browsing */
  ignoredCreators: string[]
  /** disableAnimations has its own key */
  engineFlags: EngineFlags
  engineFlagPresets: EngineFlagPreset[]
  displayMode: DisplayMode
  /** screen -> its slots, see SplitScreen */
  splitScreens: Record<string, SplitScreen>
  appearance: Appearance
  language: LanguagePreference
  /** null until answered */
  updateChecks: UpdateChecks | null
  dismissedUpdates: Partial<Record<UpdateTarget, string>>
}

const store = openStore<AppConfig>({
  name: 'config',
  defaults: {
    workshopPath: null,
    extraLibraryPaths: [],
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
    cardBorders: null,
    cardBadges: null,
    audioScreen: null,
    ambientVolume: null,
    defaultAudioSensitivity: 1,
    disablePuppetAnimation: false,
    disableAnimations: false,
    steamIdentity: 'wallpaper-engine',
    ignoredCreators: [],
    engineFlags: {},
    engineFlagPresets: [],
    displayMode: 'shared',
    splitScreens: {},
    appearance: normalizeAppearance(undefined),
    language: 'system',
    updateChecks: null,
    dismissedUpdates: {}
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

export function getExtraLibraries(): ExtraLibrary[] {
  return store
    .get('extraLibraryPaths')
    .map((entry) => (typeof entry === 'string' ? { path: entry, name: path.basename(entry) || entry } : entry))
}

export function setExtraLibraries(libraries: ExtraLibrary[]): void {
  store.set('extraLibraryPaths', libraries)
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

export function getAppearance(): Appearance {
  return normalizeAppearance(store.get('appearance'))
}

export function setAppearance(appearance: Partial<Appearance>): Appearance {
  const next = normalizeAppearance({ ...getAppearance(), ...appearance })
  store.set('appearance', next)
  return next
}

export function getLanguagePreference(): LanguagePreference {
  return normalizeLanguagePreference(store.get('language'))
}

export function setLanguagePreference(language: LanguagePreference): void {
  store.set('language', normalizeLanguagePreference(language))
}

export function getUpdateChecks(): UpdateChecks | null {
  return normalizeUpdateChecks(store.get('updateChecks'))
}

export function setUpdateChecks(checks: UpdateChecks): void {
  store.set('updateChecks', normalizeUpdateChecks(checks))
}

export function getDismissedUpdates(): Partial<Record<UpdateTarget, string>> {
  return store.get('dismissedUpdates')
}

export function setDismissedUpdates(dismissed: Partial<Record<UpdateTarget, string>>): void {
  store.set('dismissedUpdates', dismissed)
}

export function getCardBorders(): CardBorders {
  return normalizeCardBorders(store.get('cardBorders'), store.get('voteBorders'))
}

export function setCardBorders(borders: CardBorders): CardBorders {
  const next = normalizeCardBorders(borders)
  store.set('cardBorders', next)
  return next
}

export function getCardBadges(): CardBadges {
  return normalizeCardBadges(store.get('cardBadges'))
}

export function setCardBadges(badges: CardBadges): CardBadges {
  const next = normalizeCardBadges(badges)
  store.set('cardBadges', next)
  return next
}

/** 'standalone' connects under a neutral test app id. Read on every connect */
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

export function getRecommendedFpsEnabled(): boolean {
  return store.get('recommendedFpsEnabled')
}

export function setRecommendedFpsEnabled(enabled: boolean): void {
  store.set('recommendedFpsEnabled', enabled)
}

/** pages only animate per presented frame */
export function getRecommendedWebFpsEnabled(): boolean {
  return store.get('recommendedWebFpsEnabled')
}

export function setRecommendedWebFpsEnabled(enabled: boolean): void {
  store.set('recommendedWebFpsEnabled', enabled)
}

/** The only screen with audio, null = every screen */
export function getAudioScreen(): string | null {
  return store.get('audioScreen')
}

export function setAudioScreen(screen: string | null): void {
  store.set('audioScreen', screen)
}

/** 0-128 for scene and web sound, null = the wallpaper's volume */
export function getAmbientVolume(): number | null {
  return store.get('ambientVolume')
}

export function setAmbientVolume(volume: number | null): void {
  store.set('ambientVolume', volume)
}

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

export function getDisplayMode(): DisplayMode {
  return store.get('displayMode')
}

export function setDisplayMode(mode: DisplayMode): void {
  store.set('displayMode', mode)
}

export function getSplitScreens(): Record<string, SplitScreen> {
  return store.get('splitScreens')
}

/** null forgets the screen's split */
export function setSplitScreen(screen: string, split: SplitScreen | null): void {
  const splits = { ...store.get('splitScreens') }
  // a layout picked before any wallpaper is kept
  if (split === null || (split.slots.length === 0 && split.layout === 'aspect')) delete splits[screen]
  else splits[screen] = split
  store.set('splitScreens', splits)
}

export function getDefaultAudioSensitivity(): number {
  return store.get('defaultAudioSensitivity')
}

export function setDefaultAudioSensitivity(multiplier: number): void {
  store.set('defaultAudioSensitivity', multiplier)
}

/** Git URL or local path, null = official repo */
export function getLweRepoUrl(): string | null {
  return store.get('lweRepoUrl')
}

export function getLweRepoBranch(): string | null {
  return store.get('lweRepoBranch')
}

export function setLweRepo(url: string | null, branch: string | null): void {
  store.set('lweRepoUrl', url?.trim() || null)
  store.set('lweRepoBranch', branch?.trim() || null)
}

export function getLweCmakeArgs(): string | null {
  return store.get('lweCmakeArgs')
}

export function setLweCmakeArgs(args: string | null): void {
  store.set('lweCmakeArgs', args?.trim() || null)
}

export function getWeConfigPath(): string {
  return path.join(app.getPath('userData'), 'we-config.json')
}

export function importWEConfigFile(sourcePath: string): string {
  const workshopPath = getConfiguredWorkshopPath()
  if (!workshopPath) throw new Error('Workshop path must be configured before importing')

  let content = fs.readFileSync(sourcePath, 'utf8')

  // e.g. D:/Games/SteamLibrary/steamapps/workshop/content/431960/... up to "431960/"

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
