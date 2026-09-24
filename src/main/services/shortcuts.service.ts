import fs from 'fs'
import os from 'os'
import path from 'path'
import type { DesktopApplication } from '@shared/types'

function applicationDirs(): string[] {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share')
  const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean)
  return [dataHome, ...dataDirs].map((dir) => path.join(dir, 'applications'))
}

function readDesktopEntry(file: string): Record<string, string> {
  const entry: Record<string, string> = {}
  let inEntry = false

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('[')) {
      inEntry = line.trim() === '[Desktop Entry]'
      continue
    }
    const separator = line.indexOf('=')
    if (!inEntry || separator < 0 || line.slice(0, separator).includes('[')) continue
    const key = line.slice(0, separator).trim()
    if (!(key in entry)) entry[key] = line.slice(separator + 1).trim()
  }
  return entry
}

/**
 * Apps the user could pick as a wallpaper shortcut, the way a launcher menu lists them: an id earlier in the
 * XDG data dirs hides the same id further down, hidden and NoDisplay entries are left out.
 */
export function listDesktopApplications(): DesktopApplication[] {
  const seen = new Set<string>()
  const result: DesktopApplication[] = []

  for (const dir of applicationDirs()) {
    let files: string[]
    try {
      files = fs.readdirSync(dir, { recursive: true }) as string[]
    } catch {
      continue
    }

    for (const relative of files) {
      if (!relative.endsWith('.desktop')) continue
      const id = relative.split(path.sep).join('-')
      if (seen.has(id)) continue
      seen.add(id)

      try {
        const entry = readDesktopEntry(path.join(dir, relative))
        if (entry.Type !== 'Application' || entry.NoDisplay === 'true' || entry.Hidden === 'true' || !entry.Name) continue
        result.push({ name: entry.Name, file: path.join(dir, relative) })
      } catch {
        // unreadable entries are skipped
      }
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}
