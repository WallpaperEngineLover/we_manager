import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'

const DESKTOP_FILE_NAME = 'we-manager.desktop'

function getAutostartDir(): string {
  return path.join(os.homedir(), '.config', 'autostart')
}

function getAutostartDesktopPath(): string {
  return path.join(getAutostartDir(), DESKTOP_FILE_NAME)
}

/**
 * Autostart only makes sense for a packaged app: Electron's app.setLoginItemSettings
 * doesn't support Linux at all, and pointing a desktop entry at an electron-vite dev
 * invocation wouldn't survive a reboot anyway.
 */
export function isAutostartSupported(): boolean {
  return process.platform === 'linux' && app.isPackaged
}

/** Resolves the launchable executable path, accounting for AppImage's mount indirection. */
function resolveExecutablePath(): string {
  return process.env.APPIMAGE ?? app.getPath('exe')
}

export function setAutostartEnabled(enabled: boolean, minimized: boolean): void {
  if (!isAutostartSupported()) return

  const dir = getAutostartDir()
  const filePath = getAutostartDesktopPath()

  if (!enabled) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return
  }

  fs.mkdirSync(dir, { recursive: true })

  const exePath = resolveExecutablePath()
  const execLine = minimized ? `"${exePath}" --minimized` : `"${exePath}"`

  const contents = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=WE Manager',
    `Exec=${execLine}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')

  fs.writeFileSync(filePath, contents, 'utf8')
}

export function isAutostartFileEnabled(): boolean {
  return fs.existsSync(getAutostartDesktopPath())
}
