import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { WallpaperMeta } from '@shared/types'

let state = 0
let steamDown = false
let subscribed: string[] = []
let installInfo: { folder: string; sizeOnDisk: number } | null = null
const wallpapers = new Map<string, WallpaperMeta>()

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock('./config.service', () => ({ getConfiguredBackupPath: () => null }))
vi.mock('../utils/paths', () => ({ getWorkshopPath: () => dir }))
vi.mock('./steam.service', () => ({
  ITEM_STATE_INSTALLED: 4,
  ITEM_STATE_NEEDS_UPDATE: 8,
  ITEM_STATE_DOWNLOADING: 16,
  ITEM_STATE_DOWNLOAD_PENDING: 32,
  isSteamRunning: () => true,
  getSubscribedItems: async () => subscribed,
  fetchItemState: async () => {
    if (steamDown) throw new Error('Steam is only used while the window is open')
    return state
  },
  getInstallInfo: async () => installInfo
}))
vi.mock('./library.service', () => ({
  getAllWallpapers: () => [...wallpapers.values()],
  applyWallpaperChanges: (c: { patches?: { id: string; patch: Partial<WallpaperMeta> }[] }) => {
    for (const { id, patch } of c.patches ?? []) wallpapers.set(id, { ...wallpapers.get(id)!, ...patch })
  },
  normalizeType: (t?: string) => t ?? 'scene',
  getDirSizeAsync: async (dir: string) =>
    fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .reduce((total, e) => total + fs.statSync(path.join(e.parentPath, e.name)).size, 0),
  readProjectJson: (dir: string) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'))
    } catch {
      return null
    }
  }
}))

const verify = await import('./workshop-verify.service')

let dir = ''

function wallpaper(id: string, extra: Partial<WallpaperMeta> = {}): WallpaperMeta {
  return {
    id,
    title: id,
    type: 'video',
    source: 'workshop',
    localPath: dir,
    subscribed: true,
    createdAt: 0,
    updatedAt: 0,
    appliedCount: 0,
    tags: [],
    categories: [],
    ...extra
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'))
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ type: 'video', file: 'clip.mp4' }))
  fs.writeFileSync(path.join(dir, 'clip.mp4'), 'x'.repeat(100))
  state = 4
  steamDown = false
  installInfo = { folder: dir, sizeOnDisk: fs.statSync(path.join(dir, 'project.json')).size + 100 }
  wallpapers.clear()
  subscribed = []
})

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('checkItem', () => {
  it('passes an intact install, extra files included', async () => {
    fs.mkdirSync(path.join(dir, 'shaders', 'blobsSM40'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'shaders', 'blobsSM40', 'a.dxs'), 'cache')
    expect((await verify.checkItem(wallpaper('1'))).problem).toBeNull()
  })

  it('reports what Steam says first', async () => {
    state = 0
    expect((await verify.checkItem(wallpaper('1'))).problem).toBe('notInstalled')
    state = 4 | 8
    expect((await verify.checkItem(wallpaper('1'))).problem).toBe('needsUpdate')
    state = 4 | 16
    expect(await verify.checkItem(wallpaper('1'))).toEqual({ problem: null, busy: true })
  })

  it('finds a missing main file and missing data', async () => {
    fs.truncateSync(path.join(dir, 'clip.mp4'), 10)
    expect((await verify.checkItem(wallpaper('1'))).problem).toBe('missingData')
    fs.rmSync(path.join(dir, 'clip.mp4'))
    expect((await verify.checkItem(wallpaper('1'))).problem).toBe('missingMainFile')
    fs.rmSync(path.join(dir, 'project.json'))
    expect((await verify.checkItem(wallpaper('1'))).problem).toBe('brokenProject')
  })

  it('accepts a preset only when its dependency is installed', async () => {
    installInfo = null
    fs.rmSync(path.join(dir, 'clip.mp4'))
    const pj = path.join(dir, 'project.json')
    fs.writeFileSync(pj, JSON.stringify({ type: 'scene' }))
    expect((await verify.checkItem(wallpaper('1'))).problem).toBe('missingMainFile')

    fs.writeFileSync(pj, JSON.stringify({ type: 'scene', dependency: 99 }))
    expect((await verify.checkItem(wallpaper('1'))).problem).toBe('missingDependency')
    expect(verify.presetDependency({ dependency: 99 })).toBe('99')

    fs.mkdirSync(path.join(path.dirname(dir), '99'), { recursive: true })
    fs.writeFileSync(path.join(path.dirname(dir), '99', 'project.json'), '{}')
    try {
      expect((await verify.checkItem(wallpaper('1'))).problem).toBeNull()
    } finally {
      fs.rmSync(path.join(path.dirname(dir), '99'), { recursive: true, force: true })
    }
  })

  it('falls back to localPath without install info', async () => {
    installInfo = null
    expect((await verify.checkItem(wallpaper('1'))).problem).toBeNull()
    expect((await verify.checkItem(wallpaper('1', { localPath: path.join(dir, 'gone') }))).problem).toBe('missingFolder')
  })
})

describe('verifyItems', () => {
  it('records problems, clears fixed ones and skips downloads', async () => {
    wallpapers.set('1', wallpaper('1', { verifyProblem: 'missingData' }))
    wallpapers.set('2', wallpaper('2', { localPath: path.join(dir, 'gone') }))
    wallpapers.set('3', wallpaper('3', { downloading: true }))
    wallpapers.set('4', wallpaper('4', { source: 'local' }))
    installInfo = null

    const progress: number[] = []
    const result = await verify.verifyItems(undefined, (done) => progress.push(done))

    expect(result).toEqual({ checked: 2, skipped: 1, damaged: ['2'] })
    expect(wallpapers.get('1')!.verifyProblem).toBeUndefined()
    expect(wallpapers.get('2')!.verifyProblem).toBe('missingFolder')
    expect(progress.at(-1)).toBe(3)
  })

  it('skips items Steam could not be asked about instead of calling them not installed', async () => {
    wallpapers.set('1', wallpaper('1'))
    steamDown = true

    const result = await verify.verifyItems(undefined, () => {})

    expect(result).toEqual({ checked: 0, skipped: 1, damaged: [] })
    expect(wallpapers.get('1')!.verifyProblem).toBeUndefined()
  })

  it('checks subscriptions that are not workshop entries', async () => {
    fs.mkdirSync(path.join(dir, '7'))
    fs.writeFileSync(path.join(dir, '7', 'project.json'), JSON.stringify({ type: 'video', file: 'v.mp4' }))
    fs.writeFileSync(path.join(dir, '7', 'v.mp4'), 'x')
    wallpapers.set('5', wallpaper('5', { source: 'backup' }))
    subscribed = ['5', '6', '7']
    installInfo = null
    state = 0

    const result = await verify.verifyItems(undefined, () => {})

    expect(result.damaged.sort()).toEqual(['5', '6', '7'])
    expect(wallpapers.get('5')!.verifyProblem).toBeUndefined()
    expect(wallpapers.has('6')).toBe(false)
  })
})

describe('settleRepairStash', () => {
  it('puts the old copy back over a folder that is no wallpaper', async () => {
    const item = path.join(dir, '8')
    const stash = verify.repairStashOf(item, '8')
    fs.mkdirSync(stash)
    fs.writeFileSync(path.join(stash, 'project.json'), '{"old":true}')
    fs.mkdirSync(item)
    fs.writeFileSync(path.join(item, 'partial.bin'), 'x')

    await verify.settleRepairStash(item, stash)

    expect(fs.existsSync(stash)).toBe(false)
    expect(fs.readFileSync(path.join(item, 'project.json'), 'utf8')).toBe('{"old":true}')
    expect(fs.existsSync(path.join(item, 'partial.bin'))).toBe(false)
  })

  it('drops the old copy once the new one is readable', async () => {
    const item = path.join(dir, '9')
    const stash = verify.repairStashOf(item, '9')
    fs.mkdirSync(stash)
    fs.writeFileSync(path.join(stash, 'project.json'), '{"old":true}')
    fs.mkdirSync(item)
    fs.writeFileSync(path.join(item, 'project.json'), '{"new":true}')

    await verify.settleRepairStash(item, stash)

    expect(fs.existsSync(stash)).toBe(false)
    expect(fs.readFileSync(path.join(item, 'project.json'), 'utf8')).toBe('{"new":true}')
  })
})
