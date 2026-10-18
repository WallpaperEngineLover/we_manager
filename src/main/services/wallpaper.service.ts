import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { detectDisplayServer, detectDesktopEnv } from '../utils/platform'
import { hostCommand, isHostCommandAvailable } from '../utils/flatpak'
import { fileUri, finderWallpaperArgs, plasmaWallpaperScript } from '../utils/wallpaperScripts'
import type { ScreenTarget, WallpaperBackend, WallpaperEnvironment, WallpaperMeta } from '@shared/types'
import { getLweStatus, launchLweAsync, type LweLaunchOptions } from './lwe.service'
import { ensureDependencyInstalled } from './dependency.service'
import {
  getDefaultFps,
  getGlobalEngineFlags,
  getRecommendedFpsEnabled,
  getRecommendedWebFpsEnabled
} from './config.service'
import { findWallpaperVideoFile, getVideoFps } from '../utils/video'
import { RECOMMENDED_WEB_FPS } from '@shared/constants'
import { resolveEngineFlags } from '@shared/engineFlags'
import { needsFreshLaunch } from '@shared/compat'
import { videoSegmentsOf } from '@shared/videoTrim'
import { applyHyprpaper, applySwaybg, applySwww, hasHyprpaper, prefersHyprpaper, swwwCommand } from './static-wallpaper.service'

const execFileAsync = promisify(execFile)

let envCache: WallpaperEnvironment | null = null

export function invalidateEnvCache(): void {
  envCache = null
}

export function detectEnvironment(): WallpaperEnvironment {
  if (envCache) return envCache

  const platform = os.platform()
  const displayServer = detectDisplayServer()
  const desktopEnv = detectDesktopEnv()
  const available: WallpaperBackend[] = []

  if (platform === 'win32') {
    available.push('windows')
  } else if (platform === 'darwin') {
    available.push('macos')
  } else {
    if (desktopEnv === 'hyprland' && hasHyprpaper()) available.push('hyprpaper')
    if (swwwCommand()) available.push('swww')
    if (isHostCommandAvailable('swaybg')) available.push('swaybg')
    if (isHostCommandAvailable('feh')) available.push('feh')
    if (isHostCommandAvailable('xwallpaper')) available.push('xwallpaper')
    if (desktopEnv === 'gnome') available.push('gsettings')
    if (desktopEnv === 'kde' && isHostCommandAvailable('qdbus')) available.push('qdbus')
  }

  let recommended: WallpaperBackend = 'auto'
  if (platform === 'win32') recommended = 'windows'
  else if (platform === 'darwin') recommended = 'macos'
  else if (desktopEnv === 'gnome') recommended = 'gsettings'
  else if (desktopEnv === 'kde') recommended = 'qdbus'
  else if (available.includes('hyprpaper') && prefersHyprpaper()) recommended = 'hyprpaper'
  else if (displayServer === 'wayland' && available.includes('swww')) recommended = 'swww'
  else if (displayServer === 'wayland' && available.includes('swaybg')) recommended = 'swaybg'
  else if (available.includes('feh')) recommended = 'feh'

  envCache = {
    displayServer,
    desktopEnv,
    availableBackends: available,
    recommendedBackend: recommended,
    linuxWallpaperEngine: getLweStatus()
  }
  return envCache
}

export async function applyWallpaper(imagePath: string, backend?: WallpaperBackend): Promise<void> {
  const platform = os.platform()
  if (platform === 'linux') {
    await applyLinux(imagePath, backend)
  } else if (platform === 'darwin') {
    await applyMacOS(imagePath)
  } else if (platform === 'win32') {
    await applyWindows(imagePath)
  } else {
    throw new Error(`Unsupported platform: ${platform}`)
  }
}

async function applyLinux(imagePath: string, preferredBackend?: WallpaperBackend): Promise<void> {
  if (preferredBackend && preferredBackend !== 'auto') {
    await applyWithBackend(preferredBackend, imagePath)
    return
  }

  const backend = pickLinuxBackend()
  if (!backend) {
    throw new Error(
      'No supported wallpaper backend found. Please install awww/swww or swaybg (Wayland), hyprpaper (Hyprland) or feh (X11).'
    )
  }
  await applyWithBackend(backend, imagePath)
}

function pickLinuxBackend(): WallpaperBackend | null {
  const de = detectDesktopEnv()
  if (de === 'gnome') return 'gsettings'
  if (de === 'kde' && isHostCommandAvailable('qdbus')) return 'qdbus'

  if (de === 'hyprland' && prefersHyprpaper()) return 'hyprpaper'

  if (detectDisplayServer() === 'wayland') {
    if (swwwCommand()) return 'swww'
    if (isHostCommandAvailable('swaybg')) return 'swaybg'
  }

  if (isHostCommandAvailable('feh')) return 'feh'
  if (isHostCommandAvailable('xwallpaper')) return 'xwallpaper'
  return null
}

async function applyWithBackend(backend: WallpaperBackend, imagePath: string): Promise<void> {
  switch (backend) {
    case 'hyprpaper':
      await applyHyprpaper(imagePath)
      break
    case 'swww':
      await applySwww(imagePath)
      break
    case 'swaybg':
      await applySwaybg(imagePath)
      break
    case 'feh':
      await execFileAsync(...hostCommand('feh', ['--bg-fill', imagePath]))
      break
    case 'xwallpaper':
      await execFileAsync(...hostCommand('xwallpaper', ['--zoom', imagePath]))
      break
    case 'gsettings':
      await execFileAsync(...hostCommand('gsettings', [
        'set',
        'org.gnome.desktop.background',
        'picture-uri',
        fileUri(imagePath)
      ]))
      break
    case 'qdbus':
      await execFileAsync(...hostCommand('qdbus', [
        'org.kde.plasmashell',
        '/PlasmaShell',
        'org.kde.PlasmaShell.evaluateScript',
        plasmaWallpaperScript(imagePath)
      ]))
      break
    case 'windows':
      await applyWindows(imagePath)
      break
    case 'macos':
      await applyMacOS(imagePath)
      break
    default:
      throw new Error(`Unknown backend: ${backend}`)
  }
}

async function applyMacOS(imagePath: string): Promise<void> {
  await execFileAsync('osascript', finderWallpaperArgs(imagePath))
}

async function applyWindows(imagePath: string): Promise<void> {
  // via the environment to avoid injection
  const script = `
    Add-Type -TypeDefinition @'
    using System.Runtime.InteropServices;
    public class Wallpaper {
      [DllImport("user32.dll", CharSet=CharSet.Auto)]
      public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
    }
'@
    [Wallpaper]::SystemParametersInfo(20, 0, $env:WE_WALLPAPER_PATH, 3)
  `
  await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, WE_WALLPAPER_PATH: imagePath }
  })
}

function findWallpaperImage(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`)
  }
  if (!fs.statSync(dirPath).isDirectory()) {
    return dirPath
  }

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
  const files = fs.readdirSync(dirPath)

  const preview = files.find((f) => f.toLowerCase().startsWith('preview'))
  if (preview && imageExtensions.includes(path.extname(preview).toLowerCase())) {
    return path.join(dirPath, preview)
  }

  const image = files.find((f) => imageExtensions.includes(path.extname(f).toLowerCase()))
  if (image) return path.join(dirPath, image)

  throw new Error(`No image found in ${dirPath}`)
}

export async function lweOptionsFor(
  wallpaper: WallpaperMeta,
  options: { fps?: number; volume?: number } = {}
): Promise<LweLaunchOptions> {
  let fps = options.fps ?? wallpaper.fpsOverride
  if (fps === undefined && wallpaper.type === 'video' && wallpaper.localPath && getRecommendedFpsEnabled()) {
    const videoFile = findWallpaperVideoFile(wallpaper.localPath, wallpaper.file)
    if (videoFile) fps = await getVideoFps(videoFile)
  }
  if (fps === undefined && wallpaper.type === 'web' && getRecommendedWebFpsEnabled()) {
    fps = RECOMMENDED_WEB_FPS
  }
  fps = fps ?? getDefaultFps() ?? undefined

  return {
    engineFlags: resolveEngineFlags(getGlobalEngineFlags(), wallpaper.engineFlags),
    fps,
    volume: options.volume ?? wallpaper.volumeOverride,
    disabledObjects: wallpaper.disabledObjects,
    enabledObjects: wallpaper.enabledObjects,
    disabledEffects: wallpaper.disabledEffects,
    enabledEffects: wallpaper.enabledEffects,
    propertyOverrides: wallpaper.propertyOverrides,
    // always sent: xray state lives in the running engine, a hotswap must clear it
    xrayMode: wallpaper.xrayDisabled ? 'disabled' : wallpaper.xrayFullReveal ? 'full' : 'normal',
    scalingMode: wallpaper.scalingMode,
    zoom: wallpaper.zoom,
    offsetX: wallpaper.offsetX,
    offsetY: wallpaper.offsetY,
    disableParallax: wallpaper.disableParallax ?? false,
    expandCanvas: wallpaper.expandCanvas ?? false,
    repairAssets: wallpaper.repairAssets ?? false,
    cornerColor: wallpaper.cornerColor,
    imageAdjustments: wallpaper.imageAdjustments,
    speed: wallpaper.playbackSpeed,
    videoSegments: wallpaper.type === 'video' ? videoSegmentsOf(wallpaper) : undefined,
    audioSensitivity: wallpaper.audioSensitivity,
    soundVolume: wallpaper.soundVolume,
    customArgs: wallpaper.customArgs
  }
}

export function isAnimatedWallpaper(wallpaper: WallpaperMeta): boolean {
  return wallpaper.type === 'scene' || wallpaper.type === 'web' || wallpaper.type === 'video'
}

/** linux-wallpaperengine when available, else a static image */
export async function applyWallpaperMeta(
  wallpaper: WallpaperMeta,
  options: {
    fps?: number
    volume?: number
    backend?: WallpaperBackend
    dependencyPrompt?: 'always' | 'once'
    screen?: ScreenTarget
    forceFresh?: boolean
  } = {}
): Promise<string> {
  if (!wallpaper.localPath) throw new Error(`Wallpaper ${wallpaper.id} has no local path`)

  await ensureDependencyInstalled(wallpaper, options.dependencyPrompt)

  if (isAnimatedWallpaper(wallpaper) && os.platform() === 'linux' && getLweStatus().installed) {
    await launchLweAsync(wallpaper.localPath, {
      ...(await lweOptionsFor(wallpaper, options)),
      screen: options.screen,
      forceFresh: options.forceFresh || needsFreshLaunch(wallpaper.compat)
    })
    return wallpaper.localPath
  }

  const appliedPath = findWallpaperImage(wallpaper.localPath)
  await applyWallpaper(appliedPath, options.backend)
  return appliedPath
}
