import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'path'
import * as os from 'os'

const config = {
  workshop: undefined as string | undefined,
  backup: undefined as string | undefined,
  libraries: [] as { path: string; name: string }[]
}

const existing = new Set<string>()

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: (p: string) => existing.has(p) }
})
vi.mock('electron', () => ({ app: { getPath: () => '/data' } }))
vi.mock('../services/config.service', () => ({
  getConfiguredWorkshopPath: () => config.workshop,
  getConfiguredBackupPath: () => config.backup,
  getExtraLibraries: () => config.libraries
}))

const paths = await import('./paths')

beforeEach(() => {
  config.workshop = undefined
  config.backup = undefined
  config.libraries = []
  existing.clear()
})

function onPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    return run()
  } finally {
    Object.defineProperty(process, 'platform', original)
  }
}

describe('getWorkshopPath', () => {
  it('prefers the configured folder', () => {
    config.workshop = '/mnt/ws'
    expect(paths.getWorkshopPath()).toBe('/mnt/ws')
  })

  it('falls back to a Steam folder on Linux', () => {
    expect(paths.getWorkshopPath()).toMatch(/steamapps\/workshop\/content\/431960$/)
  })
})

describe('getDefaultWorkshopPath', () => {
  const suffix = path.join('steamapps', 'workshop', 'content', '431960')
  const home = os.homedir()

  it('takes the first Steam root that has the folder on Linux', () => {
    existing.add(path.join(home, '.local', 'share', 'Steam', suffix))
    existing.add(path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam', suffix))
    expect(onPlatform('linux', () => paths.getDefaultWorkshopPath())).toBe(
      path.join(home, '.local', 'share', 'Steam', suffix)
    )
  })

  it('answers the native Steam root when none exists', () => {
    expect(onPlatform('linux', () => paths.getDefaultWorkshopPath())).toBe(path.join(home, '.steam', 'steam', suffix))
  })

  it('knows the Windows install folders', () => {
    const tail = path.join('Steam', suffix)
    expect(onPlatform('win32', () => paths.getDefaultWorkshopPath())).toBe(path.join('C:', 'Program Files (x86)', tail))
    existing.add(path.join('C:', 'SteamLibrary', suffix))
    expect(onPlatform('win32', () => paths.getDefaultWorkshopPath())).toBe(path.join('C:', 'SteamLibrary', suffix))
    existing.clear()
    existing.add(path.join(home, 'AppData', 'Local', tail))
    expect(onPlatform('win32', () => paths.getDefaultWorkshopPath())).toBe(path.join(home, 'AppData', 'Local', tail))
  })

  it('uses Application Support on macOS', () => {
    expect(onPlatform('darwin', () => paths.getDefaultWorkshopPath())).toBe(
      path.join(home, 'Library', 'Application Support', 'Steam', suffix)
    )
  })
})

describe('getExtraLibraryRoots', () => {
  it('drops the workshop and backup folders and duplicates', () => {
    config.workshop = '/mnt/ws'
    config.backup = '/mnt/backup/'
    config.libraries = [
      { path: '/mnt/ws/', name: 'ws' },
      { path: '/mnt/backup', name: 'backup' },
      { path: '/mnt/a', name: 'a' },
      { path: '/mnt/a/../a', name: 'again' },
      { path: '/mnt/b', name: 'b' }
    ]
    expect(paths.getExtraLibraryRoots()).toEqual(['/mnt/a', '/mnt/b'])
  })

  it('keeps libraries when no backup folder is set', () => {
    config.libraries = [{ path: '/mnt/a', name: 'a' }]
    expect(paths.getExtraLibraryRoots()).toEqual(['/mnt/a'])
  })
})

describe('getSteamRoots', () => {
  it('covers native, Flatpak and Snap Steam under the home folder', () => {
    const roots = paths.getSteamRoots()
    expect(roots).toEqual([
      path.join(os.homedir(), '.steam', 'steam'),
      path.join(os.homedir(), '.local', 'share', 'Steam'),
      path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
      path.join(os.homedir(), 'snap', 'steam', 'common', '.local', 'share', 'Steam')
    ])
    expect(roots.every((root) => root.startsWith(os.homedir()))).toBe(true)
    expect(roots.some((root) => root.includes('com.valvesoftware.Steam'))).toBe(true)
    expect(roots.some((root) => root.includes('snap'))).toBe(true)
  })
})

describe('data folders', () => {
  it('lives under userData', () => {
    expect(paths.getDataPath()).toBe('/data')
    expect(paths.getPreviewCachePath()).toBe('/data/preview-cache')
    expect(paths.getThumbnailsPath()).toBe('/data/thumbnails')
    expect(paths.getLweManifestPath()).toBe('/data/lwe-install-manifest.json')
  })

  it('puts the prebuilt engine in XDG_DATA_HOME when set', () => {
    const before = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = '/xdg'
    expect(paths.getLwePrebuiltDir()).toBe(path.join('/xdg', 'linux-wallpaperengine-kde'))
    if (before === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = before
  })

  it('falls back to ~/.local/share without XDG_DATA_HOME', () => {
    const before = process.env.XDG_DATA_HOME
    delete process.env.XDG_DATA_HOME
    expect(paths.getLwePrebuiltDir()).toBe(path.join(os.homedir(), '.local', 'share', 'linux-wallpaperengine-kde'))
    if (before !== undefined) process.env.XDG_DATA_HOME = before
  })
})
