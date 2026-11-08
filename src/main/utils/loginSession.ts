import { randomBytes } from 'crypto'
import { readFileSync, realpathSync, writeFileSync } from 'fs'
import path from 'path'
import { isFlatpak } from './flatpak'

function bootId(): string {
  try {
    return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
  } catch {
    return String(Math.round(Date.now() / 1000 - process.uptime()))
  }
}

function runtimeDir(): string {
  const dir = process.env.XDG_RUNTIME_DIR
  return dir && dir.startsWith('/') ? dir : `/run/user/${process.getuid?.() ?? 0}`
}

function unescapeMountPoint(text: string): string {
  return text.replace(/\\([0-7]{3})/g, (_m, octal: string) => String.fromCharCode(parseInt(octal, 8)))
}

/** The id of the mount the runtime dir sits on: a tmpfs of its own from the first login to the last logout */
function runtimeMountId(dir: string): string {
  let resolved = dir
  try {
    resolved = realpathSync(dir)
  } catch {
    return ''
  }
  let best = ''
  let bestLength = -1
  try {
    for (const line of readFileSync('/proc/self/mountinfo', 'utf8').split('\n')) {
      const fields = line.split(' ')
      if (fields.length < 5) continue
      const point = unescapeMountPoint(fields[4])
      const inside = point === '/' || resolved === point || resolved.startsWith(`${point}/`)
      if (inside && point.length >= bestLength) {
        best = fields[0]
        bestLength = point.length
      }
    }
  } catch {
    return ''
  }
  return best
}

/** Inside a Flatpak the runtime dir is a new tmpfs for every run, the app's folder in it is the host's */
function flatpakLoginMarker(): string {
  const appId = process.env.FLATPAK_ID
  if (!appId) return ''
  const file = path.join(runtimeDir(), 'app', appId, 'we-manager-login')
  try {
    const saved = readFileSync(file, 'utf8').trim()
    if (saved) return saved
  } catch {
    // not written yet
  }
  const id = randomBytes(16).toString('hex')
  try {
    writeFileSync(file, `${id}\n`, { flag: 'wx', mode: 0o600 })
  } catch {
    try {
      return readFileSync(file, 'utf8').trim()
    } catch {
      return ''
    }
  }
  return id
}

/**
 * Tells two login sessions apart, the way the engine's PlaylistSchedule does: XDG_SESSION_ID is missing for
 * autostart entries and user services, the runtime dir's mount is not
 */
export function loginSessionToken(): string {
  const boot = bootId()
  if (isFlatpak()) {
    const marker = flatpakLoginMarker()
    if (marker) return `${boot}:f${marker}`
  }
  const mount = runtimeMountId(runtimeDir())
  if (mount) return `${boot}:m${mount}`
  return `${boot}:${process.env.XDG_SESSION_ID ?? ''}`
}
