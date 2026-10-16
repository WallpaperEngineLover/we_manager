import { app, nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { isTranslucent, launchAppearanceKey, wantsBlur, type Appearance } from '@shared/appearance'
import { getAppearance } from './config.service'
import { detectDesktopEnv } from '../utils/platform'
import { relaunchApp } from '../utils/relaunch'

type Koffi = typeof import('koffi')

// transparency and X11/Wayland are fixed at window creation
let launchAppearance: Appearance | null = null
let mainWindow: BrowserWindow | null = null

function onX11(): boolean {
  const ozone = app.commandLine.getSwitchValue('ozone-platform')
  if (ozone) return ozone === 'x11'
  return !process.env.WAYLAND_DISPLAY || process.env.ELECTRON_OZONE_PLATFORM_HINT === 'x11'
}

/** Not in a Flatpak on Wayland, fallback-x11 hides the X socket */

function xwaylandReachable(): boolean {
  return !!process.env.DISPLAY
}

/**
 * Before app ready: KWin only blurs X11 windows, so Wayland goes through XWayland. The platform is picked before any
 * JS runs and an appended switch only reaches child processes, so the app relaunches with it.
 */
export function prepareAppearance(): void {
  launchAppearance = getAppearance()
  if (wantsBlur(launchAppearance) && detectDesktopEnv() === 'kde' && !onX11() && xwaylandReachable()) {
    relaunchApp([...process.argv.slice(1), '--ozone-platform=x11'], 'exit')
  }
}

export function getLaunchAppearance(): Appearance {
  return launchAppearance ?? getAppearance()
}

export function isAppearanceRestartNeeded(): boolean {
  const current = getAppearance()
  const launch = getLaunchAppearance()
  if (isTranslucent(current) !== isTranslucent(launch)) return true
  if (onX11() || !xwaylandReachable()) return false
  return launchAppearanceKey(current) !== launchAppearanceKey(launch)
}

function darkBackground(theme: Appearance['theme']): boolean {
  return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
}

export function windowAppearanceOptions(): Pick<BrowserWindowConstructorOptions, 'transparent' | 'backgroundColor'> {
  const appearance = getLaunchAppearance()
  nativeTheme.themeSource = appearance.theme
  if (isTranslucent(appearance)) return { transparent: true, backgroundColor: '#00000000' }
  return { backgroundColor: darkBackground(appearance.theme) ? '#0e0f12' : '#f3f4f7' }
}

export function attachAppearance(win: BrowserWindow): void {
  mainWindow = win
  win.once('ready-to-show', () => updateBlur(getAppearance()))
  win.on('show', () => updateBlur(getAppearance()))
}

export function applyLiveAppearance(appearance: Appearance): void {
  nativeTheme.themeSource = appearance.theme
  updateBlur(appearance)
}

let x11: {
  display: unknown
  blurAtom: bigint | number
  change: (...args: unknown[]) => number
  remove: (...args: unknown[]) => number
  flush: (display: unknown) => number
} | null = null

function getX11(): typeof x11 {
  if (x11) return x11
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi: Koffi = require('koffi')
  const lib = koffi.load('libX11.so.6')
  const openDisplay = lib.func('void *XOpenDisplay(const char *name)')
  const internAtom = lib.func('unsigned long XInternAtom(void *display, const char *name, int onlyIfExists)')
  const display = openDisplay(null)
  if (!display) throw new Error('XOpenDisplay failed')
  x11 = {
    display,
    blurAtom: internAtom(display, '_KDE_NET_WM_BLUR_BEHIND_REGION', 0),
    change: lib.func(
      'int XChangeProperty(void *display, unsigned long w, unsigned long property, unsigned long type, int format, int mode, const uint8_t *data, int nelements)'
    ),
    remove: lib.func('int XDeleteProperty(void *display, unsigned long w, unsigned long property)'),
    flush: lib.func('int XFlush(void *display)')
  }
  return x11
}

const XA_CARDINAL = 6
const PROP_MODE_REPLACE = 0

function nativeWindowId(win: BrowserWindow): bigint {
  const handle = win.getNativeWindowHandle()
  return handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0))
}

// an empty _KDE_NET_WM_BLUR_BEHIND_REGION blurs the whole window
function updateBlur(appearance: Appearance): void {
  const win = mainWindow
  if (!win || win.isDestroyed() || !onX11() || !isTranslucent(getLaunchAppearance())) return
  try {
    const lib = getX11()!
    const id = nativeWindowId(win)
    if (id === 0n) return
    if (wantsBlur(appearance)) {
      lib.change(lib.display, id, lib.blurAtom, XA_CARDINAL, 32, PROP_MODE_REPLACE, Buffer.alloc(8), 0)
    } else {
      lib.remove(lib.display, id, lib.blurAtom)
    }
    lib.flush(lib.display)
  } catch (err) {
    console.warn('[Appearance] Could not set the KDE blur property:', (err as Error)?.message ?? err)
  }
}
