import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { WallpaperMeta } from '@shared/types'

let backupRoot = ''
const wallpapers = new Map<string, WallpaperMeta>()

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock('./config.service', () => ({ getConfiguredBackupPath: () => backupRoot }))
vi.mock('./library.service', () => ({
  getWallpaper: (id: string) => wallpapers.get(id) ?? null,
  getAllWallpapers: () => [...wallpapers.values()],
  updateWallpaper: (id: string, patch: Partial<WallpaperMeta>) =>
    wallpapers.set(id, { ...wallpapers.get(id)!, ...patch }),
  upsertWallpaper: (meta: WallpaperMeta) => wallpapers.set(meta.id, meta),
  deleteWallpaper: (id: string) => wallpapers.delete(id),
  applyWallpaperChanges: (c: {
    upserts?: WallpaperMeta[]
    patches?: { id: string; patch: Partial<WallpaperMeta> }[]
    deletes?: string[]
  }) => {
    for (const m of c.upserts ?? []) wallpapers.set(m.id, m)
    for (const { id, patch } of c.patches ?? []) wallpapers.set(id, { ...wallpapers.get(id)!, ...patch })
    for (const id of c.deletes ?? []) wallpapers.delete(id)
  },
  normalizeType: (t?: string) => t ?? 'scene',
  normalizeRating: () => 'everyone',
}))

const backup = await import('./backup.service')

const win = { isDestroyed: () => false, webContents: { send: vi.fn<() => void>() } } as never

let tmp = ''
let source = ''

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content)
  }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-backup-'))
  backupRoot = path.join(tmp, 'backups')
  source = path.join(tmp, 'workshop', '123')
  writeFiles(source, { 'project.json': '{}', 'materials/a.tex': 'aaaa', 'scene.pkg': 'pkg' })
  wallpapers.clear()
})

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('backupWallpaper', () => {
  it('copies, verifies and leaves no staging folder behind', async () => {
    const dir = await backup.backupWallpaper('123', source, win)
    expect(dir).toBe(path.join(backupRoot, '123'))
    expect(await backup.backupMatchesSource(source, dir)).toBe(true)
    expect(fs.readdirSync(backupRoot)).toEqual(['123'])
  })

  it('refuses a folder without project.json', async () => {
    fs.rmSync(path.join(source, 'project.json'))
    await expect(backup.backupWallpaper('123', source, win)).rejects.toThrow(/project.json/)
    expect(fs.existsSync(path.join(backupRoot, '123'))).toBe(false)
  })

  it('ignores the shader cache Wallpaper Engine writes into the wallpaper', async () => {
    writeFiles(source, { 'shaders/blobsSM40/abc.dxs': 'blob', 'shaders/custom.frag': 'void main() {}' })
    const dir = await backup.backupWallpaper('123', source, win)
    expect(fs.existsSync(path.join(dir, 'shaders/blobsSM40'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'shaders/custom.frag'))).toBe(true)
    writeFiles(source, { 'shaders/blobsSM40/def.dxs': 'another blob' })
    expect(await backup.backupMatchesSource(source, dir)).toBe(true)
  })

  it('replaces a corrupted backup', async () => {
    const dir = await backup.backupWallpaper('123', source, win)
    fs.writeFileSync(path.join(dir, 'materials/a.tex'), 'aaab')
    expect(await backup.backupMatchesSource(source, dir)).toBe(false)
    fs.writeFileSync(path.join(dir, 'stray'), 'x')
    await backup.backupWallpaper('123', source, win)
    expect(await backup.backupMatchesSource(source, dir)).toBe(true)
    expect(fs.readdirSync(backupRoot)).toEqual(['123'])
  })
})

describe('backupMatchesSource', () => {
  it('detects missing files and size changes', async () => {
    const dir = await backup.backupWallpaper('123', source, win)
    fs.rmSync(path.join(dir, 'scene.pkg'))
    expect(await backup.backupMatchesSource(source, dir)).toBe(false)
    expect(await backup.backupMatchesSource(source, path.join(tmp, 'nope'))).toBe(false)
  })
})

const base = { title: 't', type: 'scene', contentRating: 'everyone', createdAt: 0, updatedAt: 0, subscribed: false, appliedCount: 0, tags: [], categories: [] } as unknown as WallpaperMeta

describe('removeBackup', () => {

  it('drops a backup entry whose folder no longer exists', async () => {
    wallpapers.set('9', { ...base, id: '9', source: 'backup', localPath: path.join(tmp, 'gone', '9'), backedUp: true })
    await backup.removeBackup('9')
    expect(wallpapers.has('9')).toBe(false)
  })

  it('deletes the backup of a workshop entry and keeps the workshop copy', async () => {
    const dir = await backup.backupWallpaper('123', source, win)
    wallpapers.set('123', { ...base, id: '123', source: 'workshop', localPath: source, backedUp: true, backupDir: dir })
    await backup.removeBackup('123')
    expect(fs.existsSync(dir)).toBe(false)
    expect(fs.existsSync(source)).toBe(true)
    expect(wallpapers.get('123')?.backedUp).toBe(false)
  })

  it('never deletes a folder outside the backup folder', async () => {
    const outside = path.join(tmp, 'elsewhere')
    writeFiles(outside, { 'project.json': '{}' })
    wallpapers.set('7', { ...base, id: '7', source: 'backup', localPath: outside, backedUp: true })
    const { keptDir } = await backup.removeBackup('7')
    expect(keptDir).toBe(outside)
    expect(fs.existsSync(outside)).toBe(true)
    expect(wallpapers.has('7')).toBe(false)
  })
})

describe('scanBackupFolder', () => {
  it('drops missing and corrupted backup entries and skips corrupted folders', async () => {
    writeFiles(path.join(backupRoot, 'good'), { 'project.json': '{"type":"video","file":"a.mp4"}', 'a.mp4': 'v' })
    writeFiles(path.join(backupRoot, 'nofile'), { 'project.json': '{"type":"video","file":"a.mp4"}' })
    writeFiles(path.join(backupRoot, 'badjson'), { 'project.json': '{nope' })
    writeFiles(path.join(backupRoot, 'scene'), { 'project.json': '{"type":"scene","file":"scene.json"}', 'scene.pkg': 'p' })
    writeFiles(path.join(backupRoot, 'preset'), { 'project.json': '{"dependency":"1"}' })
    wallpapers.set('gone', { ...base, id: 'gone', source: 'backup', localPath: path.join(backupRoot, 'gone'), backedUp: true })
    wallpapers.set('nofile', { ...base, id: 'nofile', source: 'backup', localPath: path.join(backupRoot, 'nofile'), backedUp: true })
    wallpapers.set('offline', { ...base, id: 'offline', source: 'backup', localPath: path.join(tmp, 'unmounted', 'offline'), backedUp: true })

    const result = (await backup.scanBackupFolder())
    expect(result.removed).toBe(2)
    expect(result.corrupted.sort()).toEqual(['badjson', 'nofile'])
    expect([...wallpapers.keys()].sort()).toEqual(['good', 'offline', 'preset', 'scene'])
    expect(wallpapers.get('good')?.fileSize).toBe(fs.statSync(path.join(backupRoot, 'good', 'project.json')).size + 1)

    const again = await backup.scanBackupFolder()
    expect(again.imported).toBe(0)
    expect(again.skipped).toBe(3)
  })

  it('re-imports a backup entry that pointed at a folder in the old backup location', async () => {
    writeFiles(path.join(backupRoot, 'moved'), { 'project.json': '{}' })
    fs.mkdirSync(path.join(tmp, 'old-backups'))
    wallpapers.set('moved', { ...base, id: 'moved', source: 'backup', localPath: path.join(tmp, 'old-backups', 'moved'), backedUp: true, fileSize: 1 })
    const result = await backup.scanBackupFolder()
    expect(result.removed).toBe(0)
    expect(result.imported).toBe(1)
    expect(wallpapers.get('moved')?.localPath).toBe(path.join(backupRoot, 'moved'))
  })

  it('keeps a workshop entry linked when its backup differs from the workshop copy', async () => {
    const dir = await backup.backupWallpaper('123', source, win)
    wallpapers.set('123', { ...base, id: '123', source: 'workshop', localPath: source, backedUp: true, backupDir: dir })
    writeFiles(source, { 'scene.pkg': 'updated-by-the-author', 'materials/b.tex': 'bbbb' })
    const result = await backup.scanBackupFolder()
    expect(result.unlinked).toBe(0)
    expect(result.corrupted).toEqual([])
    expect(wallpapers.get('123')?.backedUp).toBe(true)
  })

  it('links an unlinked workshop entry to an older backup', async () => {
    const dir = await backup.backupWallpaper('123', source, win)
    wallpapers.set('123', { ...base, id: '123', source: 'workshop', localPath: source, backedUp: false })
    writeFiles(source, { 'scene.pkg': 'updated-by-the-author' })
    const result = await backup.scanBackupFolder()
    expect(result.linked).toBe(1)
    expect(wallpapers.get('123')).toMatchObject({ backedUp: true, backupDir: dir })
  })

  it('flags a backup that is older than the workshop copy', async () => {
    const dir = await backup.backupWallpaper('123', source, win)
    wallpapers.set('123', { ...base, id: '123', source: 'workshop', localPath: source, backedUp: true, backupDir: dir })
    writeFiles(source, { 'shaders/blobsSM40/abc.dxs': 'blob' })
    await backup.checkOutdatedBackups()
    expect(wallpapers.get('123')?.backupOutdated).toBeFalsy()

    writeFiles(source, { 'scene.pkg': 'updated-by-the-author' })
    fs.utimesSync(source, new Date(), new Date(Date.now() + 5000))
    expect(await backup.checkOutdatedBackups()).toBe(true)
    expect(wallpapers.get('123')?.backupOutdated).toBe(true)

    await backup.backupWallpaper('123', source, win)
    fs.utimesSync(source, new Date(), new Date(Date.now() + 10000))
    await backup.checkOutdatedBackups()
    expect(wallpapers.get('123')?.backupOutdated).toBe(false)
  })

  it('unlinks a workshop entry whose backup lost its project.json', async () => {
    const dir = await backup.backupWallpaper('123', source, win)
    wallpapers.set('123', { ...base, id: '123', source: 'workshop', localPath: source, backedUp: true, backupDir: dir })
    fs.rmSync(path.join(dir, 'project.json'))
    const result = await backup.scanBackupFolder()
    expect(result.unlinked).toBe(1)
    expect(result.corrupted).toEqual(['123'])
    expect(wallpapers.get('123')?.backedUp).toBe(false)
  })

})
