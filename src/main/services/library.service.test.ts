import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineFlags, WallpaperMeta } from '@shared/types'

const h = vi.hoisted(() => ({
  data: { wallpapers: {}, tags: [], folders: [], resolutionsVersion: 0, seen: {} } as Record<string, unknown>,
  writes: [] as string[]
}))

vi.mock('../utils/safeStore', () => ({
  openStore: () => ({
    path: '/tmp/library.json',
    get: (key: string) => h.data[key],
    set: (key: string, value: unknown) => {
      h.writes.push(key)
      h.data[key] = value
    }
  })
}))
vi.mock('../utils/paths', () => ({ getExtraLibraryRoots: () => [], getThumbnailsPath: () => '/tmp', getWorkshopPath: () => '/tmp' }))
vi.mock('../utils/localLibrary', () => ({ findLocalWallpapers: () => [], localWallpaperId: () => '' }))
vi.mock('../utils/contained', () => ({ containedPath: () => null }))
vi.mock('../utils/projectJson', () => ({ readProjectJsonSync: () => null }))
vi.mock('../utils/shaderCache', () => ({ isShaderCache: () => false }))
vi.mock('../utils/collections', () => ({ findAndMutate: () => false }))
vi.mock('../utils/hdr', () => ({ detectFeatures: () => ({}) }))
vi.mock('./config.service', () => ({ getSteamIdentity: () => ({}) }))
vi.mock('./playlist.service', () => ({ cleanupPlaylists: () => {} }))
vi.mock('./backup.service', () => ({ backupMatchesSource: () => false, hasBackupFiles: () => false }))
vi.mock('./workshop.service', () => ({ getWorkshopDetails: () => null, getUnavailableWorkshopItems: () => [] }))
vi.mock('./steam.service', () => ({
  isSteamRunning: () => false,
  getItemDownloadStatus: () => null,
  getSubscribedItems: () => [],
  isItemStuckNeverDownloaded: () => false,
  downloadItem: () => {}
}))

// the service keeps the wallpaper map in memory, so every test starts from a fresh import
async function boot() {
  vi.resetModules()
  return await import('./library.service')
}

// flags with global-only keys are what older versions stored
function meta(id: string, engineFlags?: EngineFlags): WallpaperMeta {
  return { id, title: id, engineFlags } as WallpaperMeta
}

function stored(): Record<string, WallpaperMeta> {
  return h.data.wallpapers as Record<string, WallpaperMeta>
}

describe('stored engine flags', () => {
  beforeEach(() => {
    h.data.wallpapers = {}
    h.writes.length = 0
  })

  it('drops global-only flags at startup and keeps the rest', async () => {
    h.data.wallpapers = {
      a: meta('a', { silent: true, windowed: true, audioInput: 'usb-mic' }),
      b: meta('b', { windowed: true }),
      c: meta('c', { silent: true })
    }
    const { initLibrary } = await boot()
    initLibrary()
    expect(stored().a.engineFlags).toEqual({ silent: true })
    expect(stored().b.engineFlags).toBeUndefined()
    expect(stored().c.engineFlags).toEqual({ silent: true })
    expect(h.writes).toEqual(['wallpapers'])
  })

  it('removes flags that only hold undefined values', async () => {
    h.data.wallpapers = { a: meta('a', { silent: undefined }) }
    const { initLibrary } = await boot()
    initLibrary()
    expect(stored().a.engineFlags).toBeUndefined()
  })

  it('does not write the store again once it is clean', async () => {
    h.data.wallpapers = { a: meta('a', { silent: true, windowed: true }), b: meta('b') }
    const { initLibrary } = await boot()
    initLibrary()
    h.writes.length = 0
    initLibrary()
    expect(h.writes).toEqual([])
  })

  it('strips global-only flags when a wallpaper is written', async () => {
    const { getWallpaper, upsertWallpaper } = await boot()
    upsertWallpaper(meta('a', { silent: false, kdeBackgroundLayer: true }))
    expect(getWallpaper('a')?.engineFlags).toEqual({ silent: false })
    upsertWallpaper(meta('b', { windowed: true }))
    expect(getWallpaper('b')?.engineFlags).toBeUndefined()
  })
})
