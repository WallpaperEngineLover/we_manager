import { execFileSync } from 'child_process'
import * as fs from 'fs'

let inside: boolean | undefined

/** True when the app runs inside a Flatpak sandbox */
export function isFlatpak(): boolean {
  inside ??= !!process.env.FLATPAK_ID || fs.existsSync('/.flatpak-info')
  return inside
}

/** Command and arguments that run a program of the host system, through flatpak-spawn inside a Flatpak */
export function hostCommand(cmd: string, args: string[] = []): [string, string[]] {
  return isFlatpak() ? ['flatpak-spawn', ['--host', cmd, ...args]] : [cmd, args]
}

/** The same for a shell command line */
export function hostShell(command: string): string {
  return isFlatpak() ? `flatpak-spawn --host sh -c ${JSON.stringify(command)}` : command
}

const hostCommandCache = new Map<string, boolean>()

/** Whether the host has the program */
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
