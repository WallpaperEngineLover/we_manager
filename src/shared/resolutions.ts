export interface ResolutionGroup {
  label: string
  items: { tag: string; label: string }[]
}

// Exactly the 25 tags of WE's own resolution filter (config.json steamuser.general.browser
// .filterinfo.*.resolutiontags), including their casing ("Other resolution", not "Other Resolution")
export const WE_RESOLUTION_GROUPS: ResolutionGroup[] = [
  {
    label: 'Widescreen',
    items: [
      { tag: 'Standard Definition', label: 'Standard Definition' },
      { tag: '1280 x 720', label: '1280 x 720' },
      { tag: '1366 x 768', label: '1366 x 768' },
      { tag: '1920 x 1080', label: '1920 x 1080' },
      { tag: '2560 x 1440', label: '2560 x 1440' },
      { tag: '3840 x 2160', label: '3840 x 2160' }
    ]
  },
  {
    label: 'Ultrawide',
    items: [
      { tag: 'Ultrawide Standard Definition', label: 'Standard Definition' },
      { tag: 'Ultrawide 2560 x 1080', label: '2560 x 1080' },
      { tag: 'Ultrawide 3440 x 1440', label: '3440 x 1440' }
    ]
  },
  {
    label: 'Dual Monitor',
    items: [
      { tag: 'Dual Standard Definition', label: 'Standard Definition' },
      { tag: 'Dual 3840 x 1080', label: '3840 x 1080' },
      { tag: 'Dual 5120 x 1440', label: '5120 x 1440' },
      { tag: 'Dual 7680 x 2160', label: '7680 x 2160' }
    ]
  },
  {
    label: 'Triple Monitor',
    items: [
      { tag: 'Triple Standard Definition', label: 'Standard Definition' },
      { tag: 'Triple 4096 x 768', label: '4096 x 768' },
      { tag: 'Triple 5760 x 1080', label: '5760 x 1080' },
      { tag: 'Triple 7680 x 1440', label: '7680 x 1440' },
      { tag: 'Triple 11520 x 2160', label: '11520 x 2160' }
    ]
  },
  {
    label: 'Portrait / Phone',
    items: [
      { tag: 'Portrait Standard Definition', label: 'Standard Definition' },
      { tag: 'Portrait 720 x 1280', label: '720 x 1280' },
      { tag: 'Portrait 1080 x 1920', label: '1080 x 1920' },
      { tag: 'Portrait 1440 x 2560', label: '1440 x 2560' },
      { tag: 'Portrait 2160 x 3840', label: '2160 x 3840' }
    ]
  },
  {
    label: 'Other',
    items: [
      { tag: 'Other resolution', label: 'Other resolution' },
      { tag: 'Dynamic resolution', label: 'Dynamic resolution' }
    ]
  }
]

export const ALL_RESOLUTION_TAGS: string[] = WE_RESOLUTION_GROUPS.flatMap((g) => g.items.map((i) => i.tag))

// Workshop tags don't always match WE's casing, so lookups go through the lowercased tag
const CANONICAL_TAG = new Map(ALL_RESOLUTION_TAGS.map((tag) => [tag.toLowerCase(), tag]))

export function canonicalResolutionTag(tag: string): string | undefined {
  return CANONICAL_TAG.get(tag.toLowerCase())
}

export function resolutionsFromTags(tags: readonly string[]): string[] {
  const out: string[] = []
  for (const tag of tags) {
    const canonical = canonicalResolutionTag(tag)
    if (canonical && !out.includes(canonical)) out.push(canonical)
  }
  return out
}

export function isGroupSelected(selected: readonly string[], group: ResolutionGroup): boolean {
  return group.items.every((i) => selected.includes(i.tag))
}

export function setGroupSelected(selected: readonly string[], group: ResolutionGroup, on: boolean): string[] {
  const tags = group.items.map((i) => i.tag)
  return on ? [...new Set([...selected, ...tags])] : selected.filter((t) => !tags.includes(t))
}

// Missing from the list of older builds of this app. A saved selection holding every other tag
// was "everything selected" back then.
const ADDED_TAGS = new Set([
  'Ultrawide Standard Definition',
  'Dual Standard Definition',
  'Triple Standard Definition',
  'Portrait Standard Definition'
])
const PREVIOUS_ALL_TAGS = ALL_RESOLUTION_TAGS.filter((t) => !ADDED_TAGS.has(t))

/** Maps a persisted selection onto the current tags: fixes casing, drops tags that no longer
 *  exist, and turns an old "everything selected" into the current full list. */
export function migrateResolutionSelection(saved: unknown): string[] {
  if (!Array.isArray(saved)) return []
  const tags = resolutionsFromTags(saved.filter((t): t is string => typeof t === 'string'))
  if (tags.length < ALL_RESOLUTION_TAGS.length && PREVIOUS_ALL_TAGS.every((t) => tags.includes(t))) {
    return [...ALL_RESOLUTION_TAGS]
  }
  return tags
}
