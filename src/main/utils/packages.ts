import { execFileSync } from 'child_process'
import { isCommandAvailable } from './platform'

type PackageManager = 'pacman' | 'rpm' | 'dpkg'

export interface OwningPackage {
  manager: PackageManager
  name: string
}

function query(command: string, args: string[]): string | undefined {
  if (!isCommandAvailable(command)) return undefined
  try {
    const out = execFileSync(command, args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return out.split('\n')[0] || undefined
  } catch {
    return undefined
  }
}

export function owningPackage(file: string): OwningPackage | undefined {
  const pacman = query('pacman', ['-Qoq', file])
  if (pacman) return { manager: 'pacman', name: pacman }
  const rpm = query('rpm', ['-qf', '--qf', '%{NAME}', file])
  if (rpm) return { manager: 'rpm', name: rpm }
  const dpkg = query('dpkg-query', ['-S', file])
  if (dpkg) return { manager: 'dpkg', name: dpkg.split(':')[0] }
  return undefined
}

/** With the pacman/dpkg revision */

export function packageVersion(pkg: OwningPackage): string | undefined {
  switch (pkg.manager) {
    case 'pacman':
      return query('pacman', ['-Q', pkg.name])?.split(/\s+/)[1]
    case 'rpm':
      return query('rpm', ['-q', '--qf', '%{VERSION}', pkg.name])
    case 'dpkg':
      return query('dpkg-query', ['-W', '-f=${Version}', pkg.name])
  }
}
