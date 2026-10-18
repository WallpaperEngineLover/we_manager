import { execFile, execFileSync } from 'child_process'
import * as fs from 'fs'

let inside: boolean | undefined

export function isFlatpak(): boolean {
  inside ??= !!process.env.FLATPAK_ID || fs.existsSync('/.flatpak-info')
  return inside
}

// the host helper can lack these (Hyprland from a tty); not DISPLAY, the sandbox's isn't the host's
const SESSION_VARIABLES = ['WAYLAND_DISPLAY', 'XDG_CURRENT_DESKTOP', 'XDG_SESSION_TYPE',
  'HYPRLAND_INSTANCE_SIGNATURE', 'SWAYSOCK', 'NIRI_SOCKET']

function sessionEnvArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  return SESSION_VARIABLES.filter((name) => env[name]).map((name) => `--env=${name}=${env[name]}`)
}

/** Runs on the host, through flatpak-spawn inside a Flatpak */
export function hostCommand(cmd: string, args: string[] = []): [string, string[]] {
  return isFlatpak() ? ['flatpak-spawn', ['--host', ...sessionEnvArgs(), cmd, ...args]] : [cmd, args]
}

export function hostShell(command: string): string {
  if (!isFlatpak()) return command
  const env = sessionEnvArgs().map((arg) => `'${arg.replace(/'/g, `'\\''`)}'`)
  return ['flatpak-spawn --host', ...env, `sh -c ${JSON.stringify(command)}`].join(' ')
}

const hostCommandCache = new Map<string, boolean>()

export function isHostCommandAvailable(cmd: string): boolean {
  const cached = hostCommandCache.get(cmd)
  if (cached !== undefined) return cached
  let found = false
  try {
    const [file, args] = hostCommand('sh', ['-c', `command -v ${JSON.stringify(cmd)}`])
    execFileSync(file, args, { stdio: 'ignore', timeout: 5000 })
    found = true
  } catch {
    found = false
  }
  hostCommandCache.set(cmd, found)
  return found
}

let infoCache: string | undefined

// written once when the sandbox starts
function flatpakInfo(): string {
  if (infoCache === undefined) {
    try {
      infoCache = fs.readFileSync('/.flatpak-info', 'utf8')
    } catch {
      infoCache = ''
    }
  }
  return infoCache
}

/** The sandbox's /app as the host sees it */
export function hostAppPath(info = flatpakInfo()): string | undefined {
  return info.match(/^app-path=(.+)$/m)?.[1]?.trim() || undefined
}

export function toHostPath(sandboxPath: string, appPath = hostAppPath()): string | undefined {
  if (!appPath || !sandboxPath.startsWith('/app/')) return undefined
  return appPath + sandboxPath.slice('/app'.length)
}

export function flatpakInstanceId(info = flatpakInfo()): string | undefined {
  return info.match(/^instance-id=(.+)$/m)?.[1]?.trim() || undefined
}

// prints the host pid of the process in pid namespace $1 whose pid in there is $2
const HOST_PID_SCRIPT = `ns=$1 pid=$2
for d in /proc/[0-9]*; do
  [ "$(readlink "$d/ns/pid" 2>/dev/null)" = "$ns" ] || continue
  ids=$(sed -n 's/^NSpid:[[:space:]]*//p' "$d/status" 2>/dev/null)
  [ "\${ids##*[[:space:]]}" = "$pid" ] && { echo "\${ids%%[[:space:]]*}"; exit 0; }
done
exit 1`

/** a process of an earlier run is only reachable through the host */
export function hostPidOf(pid: number): Promise<number | undefined> {
  let ns: string
  try {
    ns = fs.readlinkSync('/proc/self/ns/pid')
  } catch {
    return Promise.resolve(undefined)
  }
  return new Promise((resolve) => {
    execFile('flatpak-spawn', ['--host', 'sh', '-c', HOST_PID_SCRIPT, 'sh', ns, String(pid)], { timeout: 10_000 },
      (err, stdout) => {
        const hostPid = parseInt(stdout, 10)
        resolve(!err && hostPid > 0 ? hostPid : undefined)
      })
  })
}

// a failed flatpak-spawn says nothing about the process
const HOST_CMDLINE_SCRIPT = '[ -e /proc/$1 ] || { echo gone; exit 0; }; printf "alive "; tr "\\0" " " < /proc/$1/cmdline || true'

function parseHostCommandLine(stdout: string): string | null | undefined {
  if (stdout.trim() === 'gone') return null
  return stdout.startsWith('alive ') ? stdout.slice('alive '.length) : undefined
}

/** null when gone, undefined when the host couldn't be asked */
export function hostProcessCommandLine(hostPid: number): string | null | undefined {
  try {
    return parseHostCommandLine(execFileSync('flatpak-spawn', ['--host', 'sh', '-c', HOST_CMDLINE_SCRIPT, 'sh', String(hostPid)],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch {
    return undefined
  }
}

export function hostProcessCommandLineAsync(hostPid: number): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    execFile('flatpak-spawn', ['--host', 'sh', '-c', HOST_CMDLINE_SCRIPT, 'sh', String(hostPid)], { timeout: 5000 },
      (err, stdout) => resolve(err ? undefined : parseHostCommandLine(stdout)))
  })
}

/** process.kill for a host pid */

export function killHostProcess(hostPid: number, signal: NodeJS.Signals): void {
  execFileSync('flatpak-spawn', ['--host', 'kill', '-s', signal.replace(/^SIG/, ''), String(hostPid)],
    { timeout: 5000, stdio: 'ignore' })
}
