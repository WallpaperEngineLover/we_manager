export const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: wallpaper: https:",
  "media-src 'self' blob: wallpaper:",
  "font-src 'self' data:",
  "connect-src 'self' wallpaper: https:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')
