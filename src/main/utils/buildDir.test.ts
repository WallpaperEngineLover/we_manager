import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { isOwnDirectory, lweBuildDir } from './buildDir'

describe('lweBuildDir', () => {
  it('is in the cache folder of the user, never in /tmp', () => {
    expect(lweBuildDir({}, '/home/u')).toBe('/home/u/.cache/we-manager/lwe-build')
    expect(lweBuildDir({ XDG_CACHE_HOME: '/data/cache' }, '/home/u')).toBe('/data/cache/we-manager/lwe-build')
  })

  it('ignores a cache variable that is not an absolute path', () => {
    expect(lweBuildDir({ XDG_CACHE_HOME: 'relative/cache' }, '/home/u')).toBe('/home/u/.cache/we-manager/lwe-build')
    expect(lweBuildDir({ XDG_CACHE_HOME: '' }, '/home/u')).toBe('/home/u/.cache/we-manager/lwe-build')
  })
})

describe('isOwnDirectory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-builddir-'))
  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('accepts a directory of the user', () => {
    const dir = path.join(tmp, 'mine')
    fs.mkdirSync(dir)
    expect(isOwnDirectory(dir)).toBe(true)
  })

  it('refuses one that belongs to somebody else', () => {
    const uid = process.getuid!()
    expect(isOwnDirectory(tmp, uid + 1)).toBe(false)
    expect(isOwnDirectory('/', uid === 0 ? 1 : uid)).toBe(false)
  })

  it('refuses a link, a file and what is not there', () => {
    const target = path.join(tmp, 'target')
    fs.mkdirSync(target)
    fs.symlinkSync(target, path.join(tmp, 'link'))
    fs.writeFileSync(path.join(tmp, 'file'), '')
    expect(isOwnDirectory(path.join(tmp, 'link'))).toBe(false)
    expect(isOwnDirectory(path.join(tmp, 'file'))).toBe(false)
    expect(isOwnDirectory(path.join(tmp, 'nothing'))).toBe(false)
  })
})
