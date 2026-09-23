export { WE_RESOLUTION_GROUPS, type ResolutionGroup } from '@shared/resolutions'

export interface FilterItem {
  tag: string
  label: string
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
