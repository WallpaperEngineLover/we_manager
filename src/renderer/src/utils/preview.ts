interface Previewable {
  previewLocal?: string
  previewUrl?: string
  customPreview?: string
  useOriginalPreview?: boolean
}

export function getPreviewSrc(wallpaper: Previewable | undefined): string | undefined {
  if (!wallpaper) return undefined
  if (wallpaper.customPreview && !wallpaper.useOriginalPreview) return `wallpaper://${wallpaper.customPreview}`
  return wallpaper.previewLocal ? `wallpaper://${wallpaper.previewLocal}` : wallpaper.previewUrl
}
