import { readdir, readFile, readlink } from 'fs/promises'
import { normalizeProcessName } from '@shared/appRules'
import { hostCommand, isFlatpak } from './flatpak'
import { execFileAsync } from './exec'

/** The names a process goes by: its comm, the program it runs and, for Wine, the .exe on its command line */
export function processNames(comm: string, cmdline: string, exe: string): string[] {
  const names = new Set<string>()
  const add = (name: string) => {
    const normalized = normalizeProcessName(name)
    if (normalized !== '') names.add(normalized)
  }

  add(comm)
  add(exe)
  const args = cmdline.split('\0').filter((arg) => arg !== '')
  if (args.length > 0) add(args[0])
  for (const arg of args.slice(0, 4)) {
    if (/\.exe$/i.test(arg)) add(arg)
  }
  return [...names]
}

async function readOr(read: () => Promise<string>): Promise<string> {
  try {
    return await read()
  } catch {
    return ''
  }
}

// the kernel cuts comm at 15 characters
const COMM_WIDTH = 15

const namesByPid = new Map<string, { comm: string; names: string[] }>()

/** Every process the user can see, by normalized name. Empty where /proc cannot be read */
export async function listProcessNames(): Promise<Set<string>> {
  const found = new Set<string>()
  if (isFlatpak()) {
    try {
      const [file, args] = hostCommand('ps', ['-eo', `comm:${COMM_WIDTH}=,args=`])
      const { stdout } = await execFileAsync(file, args, { timeout: 5000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' })
      for (const line of stdout.split('\n')) {
        const comm = line.slice(0, COMM_WIDTH).trim()
        if (!comm) continue
        const rest = line.slice(COMM_WIDTH).trim().split(/\s+/)
        for (const name of processNames(comm, rest.join('\0'), rest[0] ?? '')) found.add(name)
      }
    } catch {
      return found
    }
    return found
  }
  let entries: string[]
  try {
    entries = (await readdir('/proc')).filter((entry) => /^\d+$/.test(entry))
  } catch {
    return found
  }

  const CHUNK = 64
  const alive = new Set(entries)
  for (const pid of namesByPid.keys()) {
    if (!alive.has(pid)) namesByPid.delete(pid)
  }
  for (let i = 0; i < entries.length; i += CHUNK) {
    await Promise.all(
      entries.slice(i, i + CHUNK).map(async (pid) => {
        const base = `/proc/${pid}`
        const comm = await readOr(() => readFile(`${base}/comm`, 'utf8'))
        let known = namesByPid.get(pid)
        if (!known || known.comm !== comm) {
          const [cmdline, exe] = await Promise.all([
            readOr(() => readFile(`${base}/cmdline`, 'utf8')),
            readOr(() => readlink(`${base}/exe`))
          ])
          known = { comm, names: processNames(comm, cmdline, exe) }
          namesByPid.set(pid, known)
        }
        for (const name of known.names) found.add(name)
      })
    )
  }
  return found
}

/** Every process's parent from one `ps` call on the host, for walking several ancestries without a spawn per step */
export async function parentSnapshot(): Promise<Map<number, number>> {
  const parents = new Map<number, number>()
  try {
    const [file, args] = hostCommand('ps', ['-eo', 'pid=,ppid='])
    const { stdout } = await execFileAsync(file, args, { timeout: 3000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    for (const line of stdout.split('\n')) {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number)
      if (pid && ppid >= 0) parents.set(pid, ppid)
    }
  } catch {
    // an empty snapshot makes every stream count as foreign
  }
  return parents
}

/** The parent of a process, 0 when it is gone or unreadable */
export async function parentPid(pid: number): Promise<number> {
  if (isFlatpak()) {
    try {
      const [file, args] = hostCommand('ps', ['-o', 'ppid=', '-p', String(pid)])
      const { stdout } = await execFileAsync(file, args, { timeout: 3000, encoding: 'utf8' })
      return Number(stdout.trim()) || 0
    } catch {
      return 0
    }
  }
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    // the name in parentheses may hold spaces and parentheses, the fields follow the last one
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return Number(fields[1]) || 0
  } catch {
    return 0
  }
}
