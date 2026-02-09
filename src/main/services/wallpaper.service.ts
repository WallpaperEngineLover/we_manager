import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import { detectDisplayServer, detectDesktopEnv, isCommandAvailable } from '../utils/platform'
import type { WallpaperBackend, WallpaperEnvironment } from '@shared/types'

const execFileAsync = promisify(execFile)

// Cache environment detection — it never changes during a session
let envCache: WallpaperEnvironment | null = null

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

  envCache = { displayServer, desktopEnv, availableBackends: available, recommendedBackend: recommended }
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
  const ds = detectDisplayServer()
  const de = detectDesktopEnv()

  if (preferredBackend && preferredBackend !== 'auto') {
    await applyWithBackend(preferredBackend, imagePath)
    return
  }

  if (de === 'gnome') {
    await execFileAsync('gsettings', [
      'set',
      'org.gnome.desktop.background',
      'picture-uri',
      `file://${imagePath}`
    ])
    return
  }

  if (de === 'kde' && isCommandAvailable('qdbus')) {
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
    return
  }

  if (ds === 'wayland') {
    if (isCommandAvailable('swww')) {
      await execFileAsync('swww', ['img', imagePath, '--transition-type', 'fade'])
      return
    }
    if (isCommandAvailable('swaybg')) {
      await execFileAsync('swaybg', ['-i', imagePath, '-m', 'fill'])
      return
    }
  }

  if (isCommandAvailable('feh')) {
    await execFileAsync('feh', ['--bg-fill', imagePath])
    return
  }
  if (isCommandAvailable('xwallpaper')) {
    await execFileAsync('xwallpaper', ['--zoom', imagePath])
    return
  }

  throw new Error(
    'No supported wallpaper backend found. Please install swww (Wayland) or feh (X11).'
  )
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
