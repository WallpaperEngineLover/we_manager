import { useEffect, useState } from 'react'

export type PreviewSize = 'small' | 'normal' | 'big'

export const PREVIEW_SIZE_MIN_PX: Record<PreviewSize, number> = {
  small: 130,
  normal: 200,
  big: 280
}

const STORAGE_KEY = 'we-preview-size'

function isPreviewSize(value: unknown): value is PreviewSize {
  return value === 'small' || value === 'normal' || value === 'big'
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
      // ignore write failures (e.g. storage disabled)
    }
  }, [size])

  return [size, setSize]
}
