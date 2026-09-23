export interface ResolutionGroup {
  label: string
  items: { tag: string; label: string }[]
}

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
      { tag: 'Ultrawide 2560 x 1080', label: '2560 x 1080' },
      { tag: 'Ultrawide 3440 x 1440', label: '3440 x 1440' },
      { tag: 'Ultrawide 3840 x 1600', label: '3840 x 1600' }
    ]
  },
  {
    label: 'Dual Monitor',
    items: [
      { tag: 'Dual 3840 x 1080', label: '3840 x 1080' },
      { tag: 'Dual 5120 x 1440', label: '5120 x 1440' },
      { tag: 'Dual 7680 x 2160', label: '7680 x 2160' }
    ]
  },
  {
    label: 'Triple Monitor',
    items: [
      { tag: 'Triple 4096 x 768', label: '4096 x 768' },
      { tag: 'Triple 5760 x 1080', label: '5760 x 1080' },
      { tag: 'Triple 7680 x 1440', label: '7680 x 1440' },
      { tag: 'Triple 11520 x 2160', label: '11520 x 2160' }
    ]
  },
  {
    label: 'Portrait / Phone',
    items: [
      { tag: 'Portrait 720 x 1280', label: '720 x 1280' },
      { tag: 'Portrait 1080 x 1920', label: '1080 x 1920' },
      { tag: 'Portrait 1440 x 2560', label: '1440 x 2560' },
      { tag: 'Portrait 2160 x 3840', label: '2160 x 3840' }
    ]
  },
  {
    label: 'Other',
    items: [
      { tag: 'Other Resolution', label: 'Other Resolution' },
      { tag: 'Dynamic Resolution', label: 'Dynamic Resolution' }
    ]
  }
]

export const RESOLUTION_TAGS = new Set(WE_RESOLUTION_GROUPS.flatMap((g) => g.items.map((i) => i.tag)))
