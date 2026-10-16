import type { UpdateChecks } from './types'

interface ParsedVersion {
  parts: number[]
  prerelease: string | null
}

/** "v0.8.4", "0.8.4-1ubuntu1", "1:0.8.4"; null for "r123.abc"; a letter suffix = prerelease */
export function parseVersion(raw: string): ParsedVersion | null {
  const match = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.]+))?/.exec(raw.trim().replace(/^\d+:/, ''))
  if (!match) return null
  const prerelease = match[2] && /^[A-Za-z]/.test(match[2]) ? match[2] : null
  return { parts: match[1].split('.').map(Number), prerelease }
}

/** < 0 when a is older than b, null when either can't be read */
export function compareVersions(a: string, b: string): number | null {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) return null
  for (let i = 0; i < Math.max(va.parts.length, vb.parts.length); i++) {
    const diff = (va.parts[i] ?? 0) - (vb.parts[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (va.prerelease === vb.prerelease) return 0
  if (va.prerelease === null) return 1
  if (vb.prerelease === null) return -1
  return va.prerelease < vb.prerelease ? -1 : 1
}

export function isNewerVersion(latest: string, current: string): boolean {
  return (compareVersions(latest, current) ?? 0) > 0
}

export function normalizeUpdateChecks(value: unknown): UpdateChecks | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<UpdateChecks>
  return { app: v.app === true, engine: v.engine === true }
}
