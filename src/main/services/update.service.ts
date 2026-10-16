import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { APP_RELEASE_REPO, LWE_RELEASE_REPO } from '@shared/constants'
import { isNewerVersion, parseVersion } from '@shared/updates'
import type {
  AppInstallKind,
  AppUpdateProgress,
  AvailableUpdate,
  EngineInstallKind,
  UpdateChecks,
  UpdateStatus,
  UpdateTarget
} from '@shared/types'
import { isFlatpak } from '../utils/flatpak'
import { download, fetchLatestRelease, verifyAsset, type GithubRelease } from '../utils/github'
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
let checkedAt: number | null = null
let lastError: string | null = null
let appProgress: AppUpdateProgress | null = null
let engine: { install: EngineInstallKind | null; managedBy?: string; update: AvailableUpdate | null } | null = null

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
    engine = { install: null, update: null }
    return
  }
  if (isFlatpak()) {
    engine = { install: 'bundled', update: null }
    return
  }

  let install: EngineInstallKind = 'build'
  let version: string | null = status.version ?? null
  let managedBy: string | undefined
  let real = status.path
  try { real = fs.realpathSync(status.path) } catch { /* keep the path */ }

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
  engine = { install, managedBy, update }
}

export function getUpdateStatus(): UpdateStatus {
  appInstall ??= detectAppInstall()
  // needed before any check ran (setup screen, checks off)
  if (!engine) evaluateEngine()
  const { install, managedBy, update } = engine!
  return {
    checks: getUpdateChecks(),
    checking,
    checkedAt,
    error: lastError,
    appVersion: app.getVersion(),
    appInstall,
    app: appUpdate(),
    appProgress,
    engineInstall: install,
    ...(managedBy ? { engineManagedBy: managedBy } : {}),
    engine: update,
    dismissed: getDismissedUpdates()
  }
}

function push(): void {
  if (win && !win.isDestroyed()) win.webContents.send(IpcChannels.EVENT_UPDATE_STATUS, getUpdateStatus())
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  const checks = getUpdateChecks()
  if (checking || !checks) return getUpdateStatus()
  checking = true
  lastError = null
  push()
  const errors: string[] = []
  try {
    if (checks.app) {
      try {
        appRelease = await fetchLatestRelease(APP_RELEASE_REPO)
      } catch (err) {
        errors.push((err as Error).message)
      }
    } else {
      appRelease = null
    }
    if (checks.engine && !isFlatpak()) {
      try {
        engineRelease = await fetchLatestRelease(LWE_RELEASE_REPO)
      } catch (err) {
        errors.push((err as Error).message)
      }
    } else {
      engineRelease = null
    }
    evaluateEngine()
    checkedAt = Date.now()
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
  setDismissedUpdates({})
  return checkForUpdates()
}

export function dismissUpdate(target: UpdateTarget, version: string): UpdateStatus {
  setDismissedUpdates({ ...getDismissedUpdates(), [target]: version })
  push()
  return getUpdateStatus()
}

function setAppProgress(progress: AppUpdateProgress | null): void {
  appProgress = progress
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
    const command = isCommandAvailable('apt-get') ? ['apt-get', 'install', '-y', file] : ['dpkg', '-i', file]
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

export async function installAppUpdate(): Promise<UpdateStatus> {
  const update = appUpdate()
  if (!appRelease || !update || appProgress?.stage === 'downloading' || appProgress?.stage === 'installing') {
    return getUpdateStatus()
  }
  appInstall ??= detectAppInstall()
  setAppProgress({ stage: 'downloading', percentage: 0 })
  try {
    const appImage = runningAppImage()
    if (appInstall === 'appimage' && appImage) {
      await installAppImage(appRelease, appImage)
    } else if (appInstall === 'deb') {
      await installDeb(appRelease)
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
