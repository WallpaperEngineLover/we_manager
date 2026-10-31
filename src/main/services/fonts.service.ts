import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { UserFont } from '@shared/types'

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc'])
const MAX_FONT_BYTES = 128 * 1024 * 1024

export function userFontDir(): string {
  const forced = process.env.LWE_FONT_DIR
  if (forced && path.isAbsolute(forced)) return forced
  const dataHome = process.env.XDG_DATA_HOME && path.isAbsolute(process.env.XDG_DATA_HOME)
    ? process.env.XDG_DATA_HOME
    : path.join(os.homedir(), '.local', 'share')
  return path.join(dataHome, 'linux-wallpaperengine', 'fonts')
}

function isFontFile(file: string): boolean {
  return FONT_EXTENSIONS.has(path.extname(file).toLowerCase())
}

export function listUserFonts(): UserFont[] {
  const dir = userFontDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && isFontFile(entry.name))
    .map(entry => ({ name: entry.name, size: fs.statSync(path.join(dir, entry.name)).size }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function addUserFonts(files: string[]): { added: string[]; rejected: string[] } {
  const dir = userFontDir()
  const added: string[] = []
  const rejected: string[] = []

  for (const file of files) {
    const name = path.basename(file)
    try {
      if (!isFontFile(name) || !fs.statSync(file).isFile() || fs.statSync(file).size > MAX_FONT_BYTES) {
        rejected.push(name)
        continue
      }
      fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(file, path.join(dir, name))
      added.push(name)
    } catch {
      rejected.push(name)
    }
  }

  return { added, rejected }
}

export function removeUserFont(name: string): boolean {
  if (name !== path.basename(name) || !isFontFile(name)) return false
  const file = path.join(userFontDir(), name)
  if (!fs.existsSync(file)) return false
  fs.rmSync(file)
  return true
}
