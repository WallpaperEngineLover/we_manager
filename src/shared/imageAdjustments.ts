/**
 * Wallpaper Engine's per-wallpaper image settings (its properties panel: image filter, color options, flip), in its
 * slider units: brightness/contrast/saturation/hue 0-100 with 50 leaving the image as is, filter strength 0-100.
 * Scene and video wallpapers only.
 */
export interface ImageAdjustments {
  /** A lut from the engine's assets/materials/lut folder without the extension, '' for none */
  filter?: string
  filterStrength?: number
  /** The four color sliders only apply while this is on */
  colorEnabled?: boolean
  brightness?: number
  contrast?: number
  saturation?: number
  hue?: number
  flip?: boolean
}

export const NEUTRAL_COLOR_VALUE = 50

/** In Wallpaper Engine's own order, with its English names (ui_browse_lut_filter_*) */
export const IMAGE_FILTERS: { value: string; label: string }[] = [
  { value: 'k23_b', label: 'Vibrant Contrast' },
  { value: 'lutx32_adventure', label: 'Vibrant Darkness' },
  { value: 'lutx32_coloration', label: 'Color Boost' },
  { value: 'simple_film', label: 'Shadow Boost' },
  { value: 'lutx32_bluenavy', label: 'Moon Light' },
  { value: '80s_post-apocalyptic_action', label: 'Late Night' },
  { value: 'desert_4', label: 'Desert' },
  { value: 'desperado', label: 'Midday Sun' },
  { value: 'lutx32_dusk', label: 'Sunrise' },
  { value: 'lutx32_honeyb', label: 'Honey' },
  { value: 'lutx32_sandyskyd', label: 'Autumn' },
  { value: 'lutx32_slate', label: 'Sepia Modern' },
  { value: 'lutx32_westernf', label: 'Western' },
  { value: 'setting_sun', label: 'Sunset' },
  { value: 'tower', label: 'Color Crush' },
  { value: 'lutx32_amber', label: 'Amber' },
  { value: 'aliens_2', label: 'Toxic Green' },
  { value: 'lutx32_daisy', label: 'Daisy' },
  { value: 'lutx32_emeraldd', label: 'Emerald' },
  { value: 'lutx32_ferne', label: 'Overcast' },
  { value: 'lutx32_backsea', label: 'Blueshift' },
  { value: 'lutx32_beach', label: 'Beach' },
  { value: 'lutx32_studio', label: 'Studio Lighting' },
  { value: 'sharp_wasteland', label: 'Wasteland' },
  { value: 'gamebob_2', label: 'Retro Handheld' }
]

export function hasImageAdjustments(adjustments: ImageAdjustments | undefined): boolean {
  return Object.values(adjustments ?? {}).some((v) => v !== undefined)
}

export function imageAdjustmentArgs(adjustments: ImageAdjustments | undefined): string[] {
  const a = adjustments ?? {}
  const args: string[] = []
  if (a.filter !== undefined) args.push('--image-filter', a.filter === '' ? 'none' : a.filter)
  if (a.filterStrength !== undefined) args.push('--image-filter-strength', String(a.filterStrength))
  // the sliders turn the color options on by themselves, so the switch goes last to be able to turn them off
  if (a.brightness !== undefined) args.push('--brightness', String(a.brightness))
  if (a.contrast !== undefined) args.push('--contrast', String(a.contrast))
  if (a.saturation !== undefined) args.push('--saturation', String(a.saturation))
  if (a.hue !== undefined) args.push('--hue', String(a.hue))
  if (a.colorEnabled !== undefined) args.push('--color-options', a.colorEnabled ? 'on' : 'off')
  if (a.flip !== undefined) args.push('--flip', a.flip ? 'on' : 'off')
  return args
}

export function imageAdjustmentLines(adjustments: ImageAdjustments | undefined): string[] {
  const a = adjustments ?? {}
  const lines: string[] = []
  if (a.filter !== undefined) lines.push(`image-filter=${a.filter === '' ? 'none' : a.filter}`)
  if (a.filterStrength !== undefined) lines.push(`image-filter-strength=${a.filterStrength}`)
  if (a.brightness !== undefined) lines.push(`brightness=${a.brightness}`)
  if (a.contrast !== undefined) lines.push(`contrast=${a.contrast}`)
  if (a.saturation !== undefined) lines.push(`saturation=${a.saturation}`)
  if (a.hue !== undefined) lines.push(`hue=${a.hue}`)
  if (a.colorEnabled !== undefined) lines.push(`color-options=${a.colorEnabled ? 'on' : 'off'}`)
  if (a.flip !== undefined) lines.push(`flip=${a.flip ? 'on' : 'off'}`)
  return lines
}
