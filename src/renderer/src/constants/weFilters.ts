export interface FilterItem {
  tag: string
  label: string
}

export interface ResolutionGroup {
  label: string
  items: FilterItem[]
}

export const WE_SHOW_ONLY: FilterItem[] = [
  { tag: 'Approved', label: 'Approved' },
  { tag: 'Mobile', label: 'Mobile Compatible' },
  { tag: 'Audio Responsive', label: 'Audio Responsive' },
  { tag: 'Customizable', label: 'Customizable' }
]

export const WE_TYPES: FilterItem[] = [
  { tag: 'Scene', label: 'Scene' },
  { tag: 'Video', label: 'Video' },
  { tag: 'Web', label: 'Web' },
  { tag: 'Application', label: 'Application' },
  { tag: 'Preset', label: 'Preset' },
  { tag: 'Asset', label: 'Asset' }
]

export const WE_ASSET_TYPES: FilterItem[] = [
  { tag: 'Sound', label: 'Sound' },
  { tag: 'Shader', label: 'Shader' },
  { tag: 'Texture', label: 'Texture' },
  { tag: '3D', label: '3D' },
  { tag: 'Script', label: 'Script' },
  { tag: 'Effect', label: 'Effect' }
]

export const WE_AGE_RATINGS: FilterItem[] = [
  { tag: 'Everyone', label: 'All Ages' },
  { tag: 'Questionable', label: 'Parental Guidance' },
  { tag: 'Mature', label: 'Mature' }
]

export const WE_RESOLUTION_GROUPS: ResolutionGroup[] = [
  {
    label: 'Widescreen',
    items: [
      { tag: 'Standard Definition', label: 'Standard Definition' },
      { tag: '1280 x 720', label: '1280 × 720' },
      { tag: '1366 x 768', label: '1366 × 768' },
      { tag: '1920 x 1080', label: '1920 × 1080' },
      { tag: '2560 x 1440', label: '2560 × 1440' },
      { tag: '3840 x 2160', label: '3840 × 2160' }
    ]
  },
  {
    label: 'Ultrawide',
    items: [
      { tag: 'Ultrawide 2560 x 1080', label: '2560 × 1080' },
      { tag: 'Ultrawide 3440 x 1440', label: '3440 × 1440' },
      { tag: 'Ultrawide 3840 x 1600', label: '3840 × 1600' }
    ]
  },
  {
    label: 'Dual Monitor',
    items: [
      { tag: 'Dual 3840 x 1080', label: '3840 × 1080' },
      { tag: 'Dual 5120 x 1440', label: '5120 × 1440' },
      { tag: 'Dual 7680 x 2160', label: '7680 × 2160' }
    ]
  },
  {
    label: 'Triple Monitor',
    items: [
      { tag: 'Triple 4096 x 768', label: '4096 × 768' },
      { tag: 'Triple 5760 x 1080', label: '5760 × 1080' },
      { tag: 'Triple 7680 x 1440', label: '7680 × 1440' },
      { tag: 'Triple 11520 x 2160', label: '11520 × 2160' }
    ]
  },
  {
    label: 'Portrait / Phone',
    items: [
      { tag: 'Portrait 720 x 1280', label: '720 × 1280' },
      { tag: 'Portrait 1080 x 1920', label: '1080 × 1920' },
      { tag: 'Portrait 1440 x 2560', label: '1440 × 2560' },
      { tag: 'Portrait 2160 x 3840', label: '2160 × 3840' }
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

export const WE_GENRES: FilterItem[] = [
  { tag: 'Abstract', label: 'Abstract' },
  { tag: 'Animal', label: 'Animal' },
  { tag: 'Anime', label: 'Anime' },
  { tag: 'Cartoon', label: 'Cartoon' },
  { tag: 'CGI', label: 'CGI' },
  { tag: 'Cyberpunk', label: 'Cyberpunk' },
  { tag: 'Fantasy', label: 'Fantasy' },
  { tag: 'Game', label: 'Game' },
  { tag: 'Girls', label: 'Girls' },
  { tag: 'Guys', label: 'Guys' },
  { tag: 'Landscape', label: 'Landscape' },
  { tag: 'Medieval', label: 'Medieval' },
  { tag: 'Memes', label: 'Memes' },
  { tag: 'MMD', label: 'MMD' },
  { tag: 'Music', label: 'Music' },
  { tag: 'Nature', label: 'Nature' },
  { tag: 'Pixel art', label: 'Pixel Art' },
  { tag: 'Relaxing', label: 'Relaxing' },
  { tag: 'Retro', label: 'Retro' },
  { tag: 'Sci-Fi', label: 'Sci-Fi' },
  { tag: 'Sports', label: 'Sports' },
  { tag: 'Technology', label: 'Technology' },
  { tag: 'Television', label: 'Television' },
  { tag: 'Vehicle', label: 'Vehicle' },
  { tag: 'Unspecified Genre', label: 'Unspecified Genre' }
]
