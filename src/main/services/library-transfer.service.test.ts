import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { WallpaperMeta } from '@shared/types'

let roots: string[] = []
let onScreen: string[] = []
let busy: string[] = []
const wallpapers = new Map<string, WallpaperMeta>()
const unsubscribe = vi.fn<(id: bigint) => Promise<void>>(async () => {})

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock('./config.service', () => ({ getConfiguredBackupPath: () => null }))
vi.mock('../utils/paths', () => ({ getExtraLibraryRoots: () => roots }))
vi.mock('./display.service', () => ({
  getWallpapersInUse: () => new Set([...onScreen, ...busy])
}))
vi.mock('./steam.service', () => ({ unsubscribeFromItem: (id: bigint) => unsubscribe(id) }))
vi.mock('./library.service', () => ({
  getWallpaper: (id: string) => wallpapers.get(id) ?? null,
  updateWallpaper: (id: string, patch: Partial<WallpaperMeta>) =>
    wallpapers.set(id, { ...wallpapers.get(id)!, ...patch }),
  normalizeType: (t?: string) => t ?? 'scene',
  normalizeRating: () => 'everyone'
}))

const { transferWallpapers } = await import('./library-transfer.service')

const win = { isDestroyed: () => false, webContents: { send: vi.fn<() => void>() } } as never

let tmp = ''
let target = ''

function addWallpaper(id: string, dir: string, source: WallpaperMeta['source']): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ preview: 'preview.jpg' }))
  fs.writeFileSync(path.join(dir, 'preview.jpg'), 'jpg')
  wallpapers.set(id, {
    id,
    title: id,
    type: 'scene',
    localPath: dir,
    previewLocal: path.join(dir, 'preview.jpg'),
    createdAt: 0,
    updatedAt: 0,
    subscribed: source === 'workshop',
    appliedCount: 0,
    source,
    tags: [],
    categories: []
  })
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-transfer-'))
  target = path.join(tmp, 'hdd')
  fs.mkdirSync(target)
  roots = [path.join(tmp, 'ssd'), target]
  onScreen = []
  busy = []
  wallpapers.clear()
  unsubscribe.mockClear()
})

afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('transferWallpapers', () => {
  it('copies without touching the entry or the original', async () => {
    const src = path.join(tmp, 'ssd', '111')
    addWallpaper('111', src, 'local')
    const result = await transferWallpapers(['111'], target, 'copy', win)
    expect(result).toEqual({ done: 1, alreadyThere: 0, failed: [] })
    expect(fs.existsSync(path.join(target, '111', 'project.json'))).toBe(true)
    expect(fs.existsSync(src)).toBe(true)
    expect(wallpapers.get('111')!.localPath).toBe(src)
  })

  it('moves a local wallpaper and points the entry at the new folder', async () => {
    const src = path.join(tmp, 'ssd', 'mine')
    addWallpaper('mine', src, 'local')
    await transferWallpapers(['mine'], target, 'move', win)
    const dest = path.join(target, 'mine')
    expect(fs.existsSync(src)).toBe(false)
    expect(wallpapers.get('mine')).toMatchObject({ localPath: dest, previewLocal: path.join(dest, 'preview.jpg') })
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('unsubscribes a moved workshop wallpaper and makes it local', async () => {
    addWallpaper('222', path.join(tmp, 'workshop', '222'), 'workshop')
    await transferWallpapers(['222'], target, 'move', win)
    expect(unsubscribe).toHaveBeenCalledWith(222n)
    expect(wallpapers.get('222')).toMatchObject({ source: 'local', subscribed: false })
  })

  it('keeps the original when unsubscribing fails', async () => {
    const src = path.join(tmp, 'workshop', '333')
    addWallpaper('333', src, 'workshop')
    unsubscribe.mockRejectedValueOnce(new Error('Steam is not running'))
    const result = await transferWallpapers(['333'], target, 'move', win)
    expect(result.failed[0].reason).toMatch(/unsubscribing failed/)
    expect(fs.existsSync(src)).toBe(true)
    expect(wallpapers.get('333')!.source).toBe('workshop')
  })

  it('refuses to overwrite a different folder and to move what is on a screen', async () => {
    addWallpaper('444', path.join(tmp, 'ssd', '444'), 'local')
    fs.mkdirSync(path.join(target, '444'))
    fs.writeFileSync(path.join(target, '444', 'other.txt'), 'x')
    addWallpaper('555', path.join(tmp, 'ssd', '555'), 'local')
    onScreen = ['555']

    const result = await transferWallpapers(['444', '555'], target, 'move', win)
    expect(result.failed.map((f) => f.id)).toEqual(['444', '555'])
    expect(fs.existsSync(path.join(tmp, 'ssd', '555'))).toBe(true)
    expect(fs.existsSync(path.join(target, '444', 'other.txt'))).toBe(true)
  })

  it('refuses to move what a playlist or schedule is switching to, but still copies it', async () => {
    const src = path.join(tmp, 'ssd', '888')
    addWallpaper('888', src, 'local')
    busy = ['888']

    const moved = await transferWallpapers(['888'], target, 'move', win)
    expect(moved.failed.map((f) => f.id)).toEqual(['888'])
    expect(moved.failed[0].reason).toMatch(/playlist or schedule/)
    expect(fs.existsSync(src)).toBe(true)
    expect(wallpapers.get('888')!.localPath).toBe(src)

    expect(await transferWallpapers(['888'], target, 'copy', win)).toMatchObject({ done: 1, failed: [] })
  })

  it('finishes an interrupted copy in the target before looking at what is there', async () => {
    const src = path.join(tmp, 'ssd', '999')
    addWallpaper('999', src, 'local')
    fs.cpSync(src, path.join(target, '.999.old'), { recursive: true })
    expect(await transferWallpapers(['999'], target, 'move', win)).toMatchObject({ done: 1, failed: [] })
    expect(fs.readdirSync(target)).toEqual(['999'])
    expect(fs.existsSync(src)).toBe(false)
  })

  it('reuses an identical folder left by an earlier copy after checking it on disk', async () => {
    const src = path.join(tmp, 'ssd', '777')
    addWallpaper('777', src, 'local')
    fs.cpSync(src, path.join(target, '777'), { recursive: true })
    expect(await transferWallpapers(['777'], target, 'move', win)).toMatchObject({ done: 1, failed: [] })
    expect(fs.existsSync(src)).toBe(false)
    expect(wallpapers.get('777')!.localPath).toBe(path.join(target, '777'))
  })

  it('counts wallpapers already in that library and rejects unknown folders', async () => {
    addWallpaper('666', path.join(target, '666'), 'local')
    expect(await transferWallpapers(['666'], target, 'copy', win)).toMatchObject({ done: 0, alreadyThere: 1 })
    await expect(transferWallpapers(['666'], path.join(tmp, 'elsewhere'), 'copy', win)).rejects.toThrow(
      /not a library folder/
    )
  })
})
