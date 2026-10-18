import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { compositorAutostartLine } from '@shared/desktop'
import { detectDesktopEnv } from '../utils/platform'
import { isFlatpak } from '../utils/flatpak'

const DESKTOP_FILE_NAME = 'we-manager.desktop'

function getAutostartDir(): string {
  return path.join(os.homedir(), '.config', 'autostart')
}

function getAutostartDesktopPath(): string {
  return path.join(getAutostartDir(), DESKTOP_FILE_NAME)
}

/** Packaged app only, setLoginItemSettings has no Linux support */
export function isAutostartSupported(): boolean {
  return process.platform === 'linux' && app.isPackaged
}

/** The AppImage rather than its mount, `flatpak run` for a Flatpak */
function launchCommand(): string[] {
  if (isFlatpak() && process.env.FLATPAK_ID) return ['flatpak', 'run', process.env.FLATPAK_ID]
  return [process.env.APPIMAGE ?? app.getPath('exe')]
}

/** Quoted per the desktop entry spec when needed, a literal % is %% (field codes) */
function execWord(word: string): string {
  const quoted = /^[\w@%+=:,./-]+$/.test(word) ? word : `"${word.replace(/["`$\\]/g, '\\$&')}"`
  return quoted.replace(/%/g, '%%')
}

function execLineFor(minimized: boolean): string {
  return [...launchCommand(), ...(minimized ? ['--minimized'] : [])].map(execWord).join(' ')
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

  const execLine = execLineFor(minimized)

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

/** null when the session runs the .desktop entry itself */

export function getCompositorAutostartLine(): string | null {
  if (!isAutostartSupported()) return null
  return compositorAutostartLine(detectDesktopEnv(), launchCommand())
}

export function isAutostartFileEnabled(): boolean {
  return fs.existsSync(getAutostartDesktopPath())
}

/** Rewrites the entry when the app moved since autostart was saved */
export function refreshAutostartExec(minimized: boolean): void {
  if (!isAutostartSupported()) return
  try {
    const contents = fs.readFileSync(getAutostartDesktopPath(), 'utf8')
    const current = /^Exec=(.*)$/m.exec(contents)?.[1]
    if (current !== execLineFor(minimized)) setAutostartEnabled(true, minimized)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[Autostart] Failed to refresh entry:', err)
  }
}
