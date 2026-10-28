import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { APP_RELEASE_REPO, LWE_RELEASE_REPO } from '@shared/constants'
import { compareVersions, isNewerVersion, parseVersion } from '@shared/updates'
import type {
  AppInstallKind,
  AppUpdateProgress,
  AvailableUpdate,
  EngineInstallKind,
  ReleaseChoice,
  UpdateChecks,
  UpdateStatus,
  UpdateTarget
} from '@shared/types'
import { isFlatpak } from '../utils/flatpak'
import { download, fetchLatestRelease, fetchReleaseByTag, fetchReleases, isVersionTag, verifyAsset, type GithubRelease } from '../utils/github'
import { owningPackage, packageVersion } from '../utils/packages'
import { isCommandAvailable, runningAppImage } from '../utils/platform'
import { relaunchApp } from '../utils/relaunch'
import { getDismissedUpdates, getUpdateChecks, setDismissedUpdates, setUpdateChecks } from './config.service'
import { getLweStatus } from './lwe.service'

const execFileAsync = promisify(execFile)

const FIRST_CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const TICK_MS = 30 * 60 * 1000

let win: BrowserWindow | null = null
let appInstall: AppInstallKind | undefined
let appRelease: GithubRelease | null = null
let engineRelease: GithubRelease | null = null
let checking = false
let snoozed: Partial<Record<UpdateTarget, string>> = {}
let checkedAt: number | null = null
let checked: UpdateChecks = { app: false, engine: false }
let lastError: string | null = null
let appProgress: AppUpdateProgress | null = null
let installingVersion: string | undefined
let engine: { install: EngineInstallKind | null; managedBy?: string; version: string | null; update: AvailableUpdate | null } | null = null

function detectAppInstall(): AppInstallKind {
  if (isFlatpak()) return 'flatpak'
  if (runningAppImage()) return 'appimage'
  if (!app.isPackaged) return 'source'
  const pkg = owningPackage(process.execPath)
  if (pkg?.manager === 'dpkg') return 'deb'
  return pkg?.manager ?? 'unknown'
}

function releaseInfo(release: GithubRelease, current: string | null): AvailableUpdate {
  return {
    version: release.tag_name,
    current,
    notes: release.body ?? '',
    url: release.html_url,
    publishedAt: release.published_at
  }
}

function appUpdate(): AvailableUpdate | null {
  if (!appRelease || !isNewerVersion(appRelease.tag_name, app.getVersion())) return null
  return releaseInfo(appRelease, app.getVersion())
}

/** /nix/store/<hash>-linux-wallpaperengine-kde-0.8.0/bin/... */
function nixVersion(real: string): string | undefined {
  return /^\/nix\/store\/[^/]*?-(\d+(?:\.\d+)+)\//.exec(real)?.[1]
}

/** Unversioned engines are outdated when the binary is older than the release */
function evaluateEngine(): void {
  const status = getLweStatus()
  if (!status.installed || !status.path) {
    engine = { install: null, version: null, update: null }
    return
  }
  if (isFlatpak()) {
    engine = { install: 'bundled', version: null, update: null }
    return
  }

  let install: EngineInstallKind = 'build'
  let version: string | null = status.version ?? null
  let managedBy: string | undefined
  let real = status.path
  try { real = fs.realpathSync(status.path) } catch { }

  if (status.version) {
    install = 'prebuilt'
  } else if (status.managedBy) {
    install = 'package'
    managedBy = status.managedBy
    const pkg = owningPackage(real)
    const pkgVersion = real.startsWith('/nix/store/') ? nixVersion(real) : pkg && packageVersion(pkg)
    version = pkgVersion && parseVersion(pkgVersion) ? pkgVersion : null
  }

  let update: AvailableUpdate | null = null
  if (engineRelease) {
    if (version) {
      if (isNewerVersion(engineRelease.tag_name, version)) update = releaseInfo(engineRelease, version)
    } else {
      let builtAt = 0
      try { builtAt = fs.statSync(real).mtimeMs } catch { /* treat as old */ }
      if (builtAt < Date.parse(engineRelease.published_at)) update = releaseInfo(engineRelease, null)
    }
  }
  engine = { install, managedBy, version, update }
}

export function getUpdateStatus(): UpdateStatus {
  appInstall ??= detectAppInstall()
  // needed before any check ran (setup screen, checks off)
  if (!engine) evaluateEngine()
  const { install, managedBy, version, update } = engine!
  return {
    checks: getUpdateChecks(),
    checking,
    checkedAt,
    checked,
    error: lastError,
    appVersion: app.getVersion(),
    appInstall,
    app: appUpdate(),
    appProgress,
    engineInstall: install,
    ...(managedBy ? { engineManagedBy: managedBy } : {}),
    engineVersion: version,
    engine: update,
    dismissed: getDismissedUpdates(),
    snoozed
  }
}

function push(): void {
  if (win && !win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_UPDATE_STATUS, getUpdateStatus())
}

/** manual: look at everything whatever the automatic checks are set to */
export async function checkForUpdates(manual = false): Promise<UpdateStatus> {
  const checks: UpdateChecks | null = manual ? { app: true, engine: true } : getUpdateChecks()
  if (checking || !checks) return getUpdateStatus()
  checking = true
  lastError = null
  push()
  const errors: string[] = []
  const done: UpdateChecks = { app: false, engine: false }
  try {
    if (checks.app) {
      try {
        appRelease = await fetchLatestRelease(APP_RELEASE_REPO)
        done.app = true
      } catch (err) {
        errors.push((err as Error).message)
      }
    } else {
      appRelease = null
    }
    if (checks.engine && !isFlatpak()) {
      try {
        engineRelease = await fetchLatestRelease(LWE_RELEASE_REPO)
        done.engine = true
      } catch (err) {
        errors.push((err as Error).message)
      }
    } else {
      engineRelease = null
    }
    evaluateEngine()
    checkedAt = Date.now()
    checked = done
  } finally {
    checking = false
    lastError = errors.length > 0 ? errors.join(' ') : null
    push()
  }
  return getUpdateStatus()
}

/** After an engine install, build or removal, without asking GitHub again */
export function refreshEngineUpdate(): void {
  evaluateEngine()
  push()
}

export function setUpdateChecksAndCheck(checks: UpdateChecks): UpdateStatus {
  setUpdateChecks(checks)
  void checkForUpdates()
  return getUpdateStatus()
}

/** Brings dismissed notices back */
export function checkNow(): Promise<UpdateStatus> {
  snoozed = {}
  setDismissedUpdates({})
  return checkForUpdates(true)
}

/** forever: kept in the config, otherwise hidden until the app starts again */
export function dismissUpdate(target: UpdateTarget, version: string, forever: boolean): UpdateStatus {
  if (forever) setDismissedUpdates({ ...getDismissedUpdates(), [target]: version })
  else snoozed = { ...snoozed, [target]: version }
  push()
  return getUpdateStatus()
}

function setAppProgress(progress: AppUpdateProgress | null): void {
  appProgress = progress && installingVersion ? { ...progress, version: installingVersion } : progress
  push()
}

async function installAppImage(release: GithubRelease, target: string): Promise<void> {
  const asset = release.assets.find((a) => a.name.endsWith('.AppImage'))
  if (!asset) throw new Error(`Release ${release.tag_name} has no AppImage.`)
  // next to the old file so the rename stays on one filesystem
  const staged = `${target}.download`
  try {
    await download(asset.browser_download_url, staged, asset.size, (fraction) => {
      setAppProgress({ stage: 'downloading', percentage: Math.round(fraction * 90) })
    })
    setAppProgress({ stage: 'installing', percentage: 92 })
    await verifyAsset(staged, asset)
    fs.chmodSync(staged, 0o755)
    fs.renameSync(staged, target)
  } finally {
    fs.rmSync(staged, { force: true })
  }
}

async function installDeb(release: GithubRelease): Promise<void> {
  const asset = release.assets.find((a) => a.name.endsWith('_amd64.deb')) ?? release.assets.find((a) => a.name.endsWith('.deb'))
  if (!asset) throw new Error(`Release ${release.tag_name} has no .deb package.`)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-manager-update-'))
  const file = path.join(dir, asset.name)
  try {
    await download(asset.browser_download_url, file, asset.size, (fraction) => {
      setAppProgress({ stage: 'downloading', percentage: Math.round(fraction * 80) })
    })
    await verifyAsset(file, asset)
    setAppProgress({ stage: 'installing', percentage: 85 })
    // dpkg alone wouldn't resolve new dependencies
    // apt refuses to go back to an older version unless told to, but only for a deliberate downgrade
    const downgrade = (compareVersions(release.tag_name, app.getVersion()) ?? 0) < 0
    const command = isCommandAvailable('apt-get')
      ? ['apt-get', 'install', '-y', ...(downgrade ? ['--allow-downgrades'] : []), file]
      : ['dpkg', '-i', file]
    const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
    try {
      await execFileAsync(elevate, command, { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 })
    } catch (err) {
      const code = (err as { code?: number }).code
      // pkexec: 126 = the password dialog was dismissed, 127 = not authorized
      if (code === 126 || code === 127) throw new Error('The installation was not authorized.', { cause: err })
      throw err
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function hasAppAsset(release: GithubRelease): boolean {
  appInstall ??= detectAppInstall()
  const suffix = appInstall === 'deb' ? '.deb' : '.AppImage'
  return release.assets.some((a) => a.name.endsWith(suffix))
}

/** usable: the engine's check for an asset that fits this system, the app's follows from how it was installed */
export async function listVersions(target: UpdateTarget, usable?: (release: GithubRelease) => boolean): Promise<ReleaseChoice[]> {
  const releases = await fetchReleases(target === 'app' ? APP_RELEASE_REPO : LWE_RELEASE_REPO)
  const fits = target === 'app' ? hasAppAsset : usable
  return releases
    .filter((r) => !fits || fits(r))
    .map((r) => ({ tag: r.tag_name, publishedAt: r.published_at, prerelease: r.prerelease === true }))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}

/** Without a tag: the pending update. With one: that release, newer or older than the running version */
export async function installAppUpdate(tag?: string): Promise<UpdateStatus> {
  if (appProgress?.stage === 'downloading' || appProgress?.stage === 'installing') return getUpdateStatus()
  if (tag !== undefined && (typeof tag !== 'string' || !isVersionTag(tag))) {
    installingVersion = undefined
    setAppProgress({ stage: 'error', percentage: 0, message: `${String(tag)} is not a version of WE Manager.` })
    return getUpdateStatus()
  }
  if (!tag && !appUpdate()) return getUpdateStatus()
  appInstall ??= detectAppInstall()
  installingVersion = tag ?? appRelease?.tag_name
  setAppProgress({ stage: 'downloading', percentage: 0 })
  try {
    const release = tag ? await fetchReleaseByTag(APP_RELEASE_REPO, tag) : appRelease
    if (!release) throw new Error(`${APP_RELEASE_REPO} has no ${tag} release.`)
    const appImage = runningAppImage()
    if (appInstall === 'appimage' && appImage) {
      await installAppImage(release, appImage)
    } else if (appInstall === 'deb') {
      await installDeb(release)
    } else {
      throw new Error(`A ${appInstall} install updates outside WE Manager.`)
    }
    setAppProgress({ stage: 'ready', percentage: 100 })
  } catch (err) {
    setAppProgress({ stage: 'error', percentage: 0, message: (err as Error).message })
  }
  return getUpdateStatus()
}

export function restartApp(): void {
  relaunchApp()
}

function checkDue(): boolean {
  const checks = getUpdateChecks()
  return !!checks && (checks.app || checks.engine) && (checkedAt === null || Date.now() - checkedAt >= CHECK_INTERVAL_MS)
}

export function initUpdates(window: BrowserWindow): void {
  win = window
  setTimeout(() => {
    if (checkDue()) void checkForUpdates()
  }, FIRST_CHECK_DELAY_MS)
  setInterval(() => {
    if (checkDue()) void checkForUpdates()
  }, TICK_MS)
}
