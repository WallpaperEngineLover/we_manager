import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { findLocalWallpapers, localWallpaperId } from './localLibrary'

let tmp = ''

function wallpaper(dir: string, project: unknown = {}): string {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(project))
  return dir
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-local-'))
})

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('localWallpaperId', () => {
  it('keeps a workshop folder name', async () => {
    expect(await localWallpaperId(wallpaper(path.join(tmp, '123'), { workshopid: '999' }))).toBe('123')
  })

  it('takes the workshop id from project.json for a renamed folder', async () => {
    expect(await localWallpaperId(wallpaper(path.join(tmp, 'renamed'), { workshopid: 456 }))).toBe('456')
  })

  it('falls back to the folder name', async () => {
    expect(await localWallpaperId(wallpaper(path.join(tmp, 'mine'), { workshopid: 'abc' }))).toBe('mine')
    expect(await localWallpaperId(wallpaper(path.join(tmp, 'nulljson'), null))).toBe('nulljson')
  })

  it('is null without a project.json', async () => {
    fs.mkdirSync(path.join(tmp, 'empty'))
    expect(await localWallpaperId(path.join(tmp, 'empty'))).toBeNull()
  })
})

describe('findLocalWallpapers', () => {
  it('lists wallpapers of every root, first root wins, missing roots are not mounted', async () => {
    const a = path.join(tmp, 'a')
    const b = path.join(tmp, 'b')
    const gone = path.join(tmp, 'gone')
    wallpaper(path.join(a, '1'))
    wallpaper(path.join(a, '.staging'))
    fs.mkdirSync(path.join(a, 'incomplete'))
    wallpaper(path.join(b, '1'))
    wallpaper(path.join(b, '2'))

    const { found, mounted } = await findLocalWallpapers([a, gone, b])
    expect(mounted).toEqual([a, b])
    expect(found.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: '1', localPath: path.join(a, '1') },
      { id: '2', localPath: path.join(b, '2') }
    ])
  })
})
