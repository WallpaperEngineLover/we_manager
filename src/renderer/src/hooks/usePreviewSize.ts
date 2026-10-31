import { useEffect, useState, type CSSProperties } from 'react'

export type PreviewSize = 'small' | 'normal' | 'big' | 'list'

const PREVIEW_SIZE_MIN_PX: Record<PreviewSize, number> = {
  small: 128,
  normal: 200,
  big: 280,
  list: 0
}

export function previewGridStyle(size: PreviewSize): CSSProperties {
  if (size === 'list') return { gridTemplateColumns: '1fr', gap: '0.5rem' }
  if (size === 'small') return { gridTemplateColumns: `repeat(auto-fill, minmax(${PREVIEW_SIZE_MIN_PX.small}px, 1fr))`, gap: '0.5rem' }
  return { gridTemplateColumns: `repeat(auto-fill, minmax(${PREVIEW_SIZE_MIN_PX[size]}px, 1fr))` }
}

const STORAGE_KEY = 'we-preview-size'

function isPreviewSize(value: unknown): value is PreviewSize {
  return value === 'small' || value === 'normal' || value === 'big' || value === 'list'
}

function loadPreviewSize(): PreviewSize {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isPreviewSize(raw) ? raw : 'normal'
  } catch {
    return 'normal'
  }
}

export function usePreviewSize(): [PreviewSize, (size: PreviewSize) => void] {
  const [size, setSize] = useState<PreviewSize>(loadPreviewSize)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, size)
    } catch {
    }
  }, [size])

  return [size, setSize]
}
