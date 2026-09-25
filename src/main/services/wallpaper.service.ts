import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { detectDisplayServer, detectDesktopEnv, isCommandAvailable } from '../utils/platform'
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
    if (isCommandAvailable('swww')) available.push('swww')
    if (isCommandAvailable('swaybg')) available.push('swaybg')
    if (isCommandAvailable('feh')) available.push('feh')
    if (isCommandAvailable('xwallpaper')) available.push('xwallpaper')
    if (desktopEnv === 'gnome') available.push('gsettings')
    if (desktopEnv === 'kde' && isCommandAvailable('qdbus')) available.push('qdbus')
  }

  let recommended: WallpaperBackend = 'auto'
  if (platform === 'win32') recommended = 'windows'
  else if (platform === 'darwin') recommended = 'macos'
  else if (desktopEnv === 'gnome') recommended = 'gsettings'
  else if (desktopEnv === 'kde') recommended = 'qdbus'
  else if (displayServer === 'wayland' && available.includes('swww')) recommended = 'swww'
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
      'No supported wallpaper backend found. Please install swww (Wayland) or feh (X11).'
    )
  }
  await applyWithBackend(backend, imagePath)
}

function pickLinuxBackend(): WallpaperBackend | null {
  const de = detectDesktopEnv()
  if (de === 'gnome') return 'gsettings'
  if (de === 'kde' && isCommandAvailable('qdbus')) return 'qdbus'

  if (detectDisplayServer() === 'wayland') {
    if (isCommandAvailable('swww')) return 'swww'
    if (isCommandAvailable('swaybg')) return 'swaybg'
  }

  if (isCommandAvailable('feh')) return 'feh'
  if (isCommandAvailable('xwallpaper')) return 'xwallpaper'
  return null
}

async function applyWithBackend(backend: WallpaperBackend, imagePath: string): Promise<void> {
  switch (backend) {
    case 'swww':
      await execFileAsync('swww', ['img', imagePath, '--transition-type', 'fade'])
      break
    case 'swaybg':
      await execFileAsync('swaybg', ['-i', imagePath, '-m', 'fill'])
      break
    case 'feh':
      await execFileAsync('feh', ['--bg-fill', imagePath])
      break
    case 'xwallpaper':
      await execFileAsync('xwallpaper', ['--zoom', imagePath])
      break
    case 'gsettings':
      await execFileAsync('gsettings', [
        'set',
        'org.gnome.desktop.background',
        'picture-uri',
        `file://${imagePath}`
      ])
      break
    case 'qdbus': {
      const script = `
        var allDesktops = desktops();
        for (var i = 0; i < allDesktops.length; i++) {
          var d = allDesktops[i];
          d.wallpaperPlugin = 'org.kde.image';
          d.currentConfigGroup = ['Wallpaper', 'org.kde.image', 'General'];
          d.writeConfig('Image', 'file://${imagePath}');
        }
      `
      await execFileAsync('qdbus', [
        'org.kde.plasmashell',
        '/PlasmaShell',
        'org.kde.PlasmaShell.evaluateScript',
        script
      ])
      break
    }
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
  const script = `tell application "Finder" to set desktop picture to POSIX file "${imagePath}"`
  await execFileAsync('osascript', ['-e', script])
}

async function applyWindows(imagePath: string): Promise<void> {
  // Pass path via environment variable to avoid injection risk from special characters
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
    // Explicit even when off: xray state lives on the running LWE process, not per-wallpaper,
    // so a hot-reload into a wallpaper with xray off must actively clear a previous wallpaper's "on".
    xrayFullReveal: wallpaper.xrayFullReveal ?? false,
    scalingMode: wallpaper.scalingMode,
    zoom: wallpaper.zoom,
    offsetX: wallpaper.offsetX,
    offsetY: wallpaper.offsetY,
    // Explicit even when off, same reasoning as xrayFullReveal above.
    disableParallax: wallpaper.disableParallax ?? false,
    // Explicit even when off, same reasoning as xrayFullReveal above.
    expandCanvas: wallpaper.expandCanvas ?? false,
    cornerColor: wallpaper.cornerColor,
    imageAdjustments: wallpaper.imageAdjustments,
    speed: wallpaper.playbackSpeed,
    audioSensitivity: wallpaper.audioSensitivity,
    soundVolume: wallpaper.soundVolume,
    customArgs: wallpaper.customArgs
  }
}

export function isAnimatedWallpaper(wallpaper: WallpaperMeta): boolean {
  return wallpaper.type === 'scene' || wallpaper.type === 'web' || wallpaper.type === 'video'
}

/**
 * Apply a library wallpaper: renders animated/scene/web/video wallpapers via
 * linux-wallpaperengine when available, otherwise falls back to a static image.
 * Shared by the manual "apply" IPC handler and the playlist playback engine.
 */
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

  // Static fallback: set the preview image as a plain wallpaper
  const appliedPath = findWallpaperImage(wallpaper.localPath)
  await applyWallpaper(appliedPath, options.backend)
  return appliedPath
}
