interface Previewable {
  previewLocal?: string
  previewUrl?: string
}

export function getPreviewSrc(wallpaper: Previewable | undefined): string | undefined {
  if (!wallpaper) return undefined
  return wallpaper.previewLocal ? `wallpaper://${wallpaper.previewLocal}` : wallpaper.previewUrl
}
