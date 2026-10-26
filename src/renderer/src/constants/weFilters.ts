export {
  WE_RESOLUTION_GROUPS,
  ALL_RESOLUTION_TAGS,
  canonicalResolutionTag,
  resolutionsFromTags,
  isGroupSelected,
  setGroupSelected,
  migrateResolutionSelection,
  type ResolutionGroup
} from '@shared/resolutions'

export interface FilterItem {
  tag: string
  label: string
}

export const WE_SHOW_ONLY: FilterItem[] = [
  { tag: 'Approved', label: 'Approved' },
  { tag: 'Audio responsive', label: 'Audio Responsive' },
  { tag: '3D', label: '3D' },
  { tag: 'Customizable', label: 'Customizable' },
  { tag: 'Puppet Warp', label: 'Puppet Warp' },
  { tag: 'HDR', label: 'HDR' },
  { tag: 'Media Integration', label: 'Media Integration' },
  { tag: 'User Shortcut', label: 'User Shortcut' },
  { tag: 'Video Texture', label: 'Video Texture' },
  { tag: 'Asset Pack', label: 'Asset Pack' },
  { tag: 'Verified', label: 'Verified' },
  { tag: 'Multi-monitor optimized', label: 'Multi-monitor optimized' }
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
  { tag: 'Particle', label: 'Particle' },
  { tag: 'Image', label: 'Image' },
  { tag: 'Sound', label: 'Sound' },
  { tag: 'Model', label: 'Model' },
  { tag: 'Text', label: 'Text' },
  { tag: 'Sprite', label: 'Sprite' },
  { tag: 'Fullscreen', label: 'Fullscreen' },
  { tag: 'Composite', label: 'Composite' },
  { tag: 'Script', label: 'Script' },
  { tag: 'Effect', label: 'Effect' },
  { tag: 'Scripted Layer', label: 'Scripted Layer' }
]

export const WE_ASSET_GENRES: FilterItem[] = [
  { tag: 'Audio Visualizer', label: 'Audio Visualizer' },
  { tag: 'Background', label: 'Background' },
  { tag: 'Character', label: 'Character' },
  { tag: 'Clock', label: 'Clock' },
  { tag: 'Fire', label: 'Fire' },
  { tag: 'Interactive', label: 'Interactive' },
  { tag: 'Magic', label: 'Magic' },
  { tag: 'Post Processing', label: 'Post Processing' },
  { tag: 'Smoke', label: 'Smoke' },
  { tag: 'Space', label: 'Space' }
]

export const WE_SCRIPT_TYPES: FilterItem[] = [
  { tag: 'Boolean', label: 'Boolean' },
  { tag: 'Number', label: 'Number' },
  { tag: 'Vec2', label: 'Vec2' },
  { tag: 'Vec3', label: 'Vec3' },
  { tag: 'Vec4', label: 'Vec4' },
  { tag: 'String', label: 'String' },
  { tag: 'No Animation', label: 'No Animation' },
  { tag: 'Oversized', label: 'Oversized' }
]

export const WE_AGE_RATINGS: FilterItem[] = [
  { tag: 'Everyone', label: 'All Ages' },
  { tag: 'Questionable', label: 'Parental Guidance' },
  { tag: 'Mature', label: 'Mature' }
]

// Local library only: items whose downloaded project.json never had a rating set.
// Not a real Steam Workshop tag, so it can't be used to filter the live workshop query.
export const WE_LIBRARY_AGE_RATINGS: FilterItem[] = [
  ...WE_AGE_RATINGS,
  { tag: 'Uncategorized', label: 'Uncategorized' }
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

export function migrateTagSelection(selected: unknown, options: FilterItem[]): string[] {
  if (!Array.isArray(selected)) return []
  const known = new Map(options.map((o) => [o.tag.toLowerCase(), o.tag]))
  return selected.flatMap((tag) => {
    const match = typeof tag === 'string' ? known.get(tag.toLowerCase()) : undefined
    return match ? [match] : []
  })
}
