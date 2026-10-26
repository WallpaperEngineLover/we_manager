import type { LweFontNeed } from '@shared/types'

// `  font family="Arial" status=compatible using="Liberation Sans" objects="Clock, Date"`
const FONT_LINE_RE = /^\s*(font|emoji)\sfamily="(.*)"\sstatus=(installed|compatible|missing)\susing="(.*)"\sobjects="(.*)"\s*$/

export function parseLweFontList(output: string): LweFontNeed[] {
  const needs: LweFontNeed[] = []
  for (const line of output.split('\n')) {
    const m = line.match(FONT_LINE_RE)
    if (m) {
      needs.push({
        kind: m[1] as LweFontNeed['kind'],
        family: m[2],
        status: m[3] as LweFontNeed['status'],
        using: m[4],
        objects: m[5].split(', ').filter(Boolean)
      })
    }
  }
  return needs
}
