import { normalizeAppearance, type Appearance } from '@shared/appearance'

const CACHE_KEY = 'appearance'

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

function resolvedTheme(appearance: Appearance): 'dark' | 'light' {
  if (appearance.theme === 'system') return darkQuery.matches ? 'dark' : 'light'
  return appearance.theme
}

export function applyAppearance(appearance: Appearance, translucent: boolean): void {
  const root = document.documentElement
  root.dataset.theme = resolvedTheme(appearance)
  root.style.setProperty('--accent-hue', String(appearance.accentHue))
  root.style.setProperty('--accent-chroma', String(appearance.accentChroma))
  if (translucent) {
    root.dataset.translucent = ''
    root.style.setProperty('--surface-alpha', String(appearance.windowOpacity / 100))
  } else {
    delete root.dataset.translucent
    root.style.removeProperty('--surface-alpha')
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ appearance, translucent }))
  } catch {
    // storage unavailable
  }
}

// config arrives after first paint, the cached look avoids a theme flash
export function applyCachedAppearance(): void {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    if (cached) applyAppearance(normalizeAppearance(cached.appearance), cached.translucent === true)
  } catch {
    // nothing cached
  }
}

export function onSystemThemeChange(cb: () => void): () => void {
  darkQuery.addEventListener('change', cb)
  return () => darkQuery.removeEventListener('change', cb)
}
