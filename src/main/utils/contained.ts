import * as path from 'path'

export function containedPath(dir: string, rel: unknown): string | undefined {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) return undefined
  const full = path.join(dir, rel)
  const inside = path.relative(dir, full)
  return inside && inside.split(path.sep)[0] !== '..' && !path.isAbsolute(inside) ? full : undefined
}
