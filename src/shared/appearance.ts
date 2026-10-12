export type ThemeMode = 'dark' | 'light' | 'system'
/** 'hover' keeps GIF previews still until hovered */
export type PreviewAnimation = 'always' | 'hover'

export interface Appearance {
  theme: ThemeMode
  /** oklch hue */
  accentHue: number
  /** 0 = gray (Graphite) */
  accentChroma: number
  /** 100 = opaque, lower needs a restart */
  windowOpacity: number
  /** KDE blur, via XWayland on Wayland */
  blur: boolean
  previewAnimation: PreviewAnimation
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'dark',
  accentHue: 277,
  accentChroma: 1,
  windowOpacity: 100,
  blur: false,
  previewAnimation: 'always'
}

export const ACCENT_PRESETS: { name: string; hue: number; chroma: number }[] = [
  { name: 'Indigo', hue: 277, chroma: 1 },
  { name: 'Blue', hue: 255, chroma: 1 },
  { name: 'Sky', hue: 232, chroma: 0.8 },
  { name: 'Teal', hue: 185, chroma: 0.6 },
  { name: 'Emerald', hue: 160, chroma: 0.7 },
  { name: 'Amber', hue: 65, chroma: 0.75 },
  { name: 'Orange', hue: 45, chroma: 0.85 },
  { name: 'Rose', hue: 15, chroma: 0.95 },
  { name: 'Pink', hue: 350, chroma: 0.95 },
  { name: 'Purple', hue: 305, chroma: 1 },
  { name: 'Graphite', hue: 277, chroma: 0 }
]

export const MIN_WINDOW_OPACITY = 40

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function normalizeAppearance(raw: Partial<Appearance> | undefined): Appearance {
  const theme = raw?.theme === 'light' || raw?.theme === 'system' ? raw.theme : 'dark'
  return {
    theme,
    accentHue: clamp(raw?.accentHue, 0, 360, DEFAULT_APPEARANCE.accentHue),
    accentChroma: clamp(raw?.accentChroma, 0, 1, DEFAULT_APPEARANCE.accentChroma),
    windowOpacity: Math.round(clamp(raw?.windowOpacity, MIN_WINDOW_OPACITY, 100, 100)),
    blur: raw?.blur === true,
    previewAnimation: raw?.previewAnimation === 'hover' ? 'hover' : 'always'
  }
}

export function isTranslucent(appearance: Appearance): boolean {
  return appearance.windowOpacity < 100
}

export function wantsBlur(appearance: Appearance): boolean {
  return isTranslucent(appearance) && appearance.blur
}

/** Fixed at window creation */
export function launchAppearanceKey(appearance: Appearance): string {
  return `${isTranslucent(appearance)}:${wantsBlur(appearance)}`
}
