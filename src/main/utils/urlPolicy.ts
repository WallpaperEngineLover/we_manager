import * as path from 'path'

/** What the app hands to the desktop's opener: web links, Steam's own scheme and mail, nothing that runs a program */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'steam:', 'mailto:'])

export function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/** The page the window is allowed to be on (a reload, the dev server's own paths), anything else is a navigation away */
export function isAppUrl(url: string, appUrl: string): boolean {
  try {
    const target = new URL(url)
    const app = new URL(appUrl)
    if (target.protocol !== app.protocol) return false
    return app.protocol === 'file:' ? target.pathname === app.pathname : target.origin === app.origin
  } catch {
    return false
  }
}

const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.apng', '.mp4', '.webm'])

/**
 * wallpaper:// serves previews: an image or video inside the library, backup and thumbnail folders. A project.json can
 * name any path as its preview, and the renderer reads these as bytes
 */
export function isServablePreview(filePath: string, roots: readonly string[]): boolean {
  if (!path.isAbsolute(filePath) || filePath.includes('\0')) return false
  const resolved = path.resolve(filePath)
  if (!MEDIA_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return false

  return roots.some((root) => {
    const relative = path.relative(path.resolve(root), resolved)
    return relative !== '' && relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative)
  })
}
