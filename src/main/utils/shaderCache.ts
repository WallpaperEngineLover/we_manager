// WE writes compiled shaders into the folder
export function isShaderCache(relPath: string): boolean {
  return /^shaders[\\/]blobs/i.test(relPath)
}
