import { describe, expect, it, afterAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { readPkgEntry, sceneUsesHdr } from './hdr'

function u32(v: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(v)
  return b
}

function str(s: string): Buffer {
  return Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(s)])
}

function makePkg(files: Record<string, string>): Buffer {
  const parts: Buffer[] = []
  const names = Object.keys(files)
  parts.push(str('PKGV0023'), u32(names.length))
  let offset = 0
  for (const name of names) {
    const len = Buffer.byteLength(files[name])
    parts.push(str(name), u32(offset), u32(len))
    offset += len
  }
  for (const name of names) parts.push(Buffer.from(files[name]))
  return Buffer.concat(parts)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdr-test-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('readPkgEntry', () => {
  it('reads one entry without the rest of the package', async () => {
    const pkg = path.join(dir, 'scene.pkg')
    fs.writeFileSync(pkg, makePkg({ 'materials/a.json': '{"a":1}', 'scene.json': '{"general":{"hdr":true}}' }))
    expect((await readPkgEntry(pkg, 'scene.json'))?.toString()).toBe('{"general":{"hdr":true}}')
    expect(await readPkgEntry(pkg, 'missing.json')).toBeUndefined()
  })

  it('handles an entry table bigger than the first read', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 3000; i++) files[`materials/some/long/path/texture_${i}.tex`] = 'x'
    files['scene.json'] = '{}'
    const pkg = path.join(dir, 'big.pkg')
    fs.writeFileSync(pkg, makePkg(files))
    expect((await readPkgEntry(pkg, 'scene.json'))?.toString()).toBe('{}')
  })

  it('rejects garbage', async () => {
    const pkg = path.join(dir, 'bad.pkg')
    fs.writeFileSync(pkg, Buffer.from([0xff, 0xff, 0xff, 0x7f, 1, 2, 3]))
    expect(await readPkgEntry(pkg, 'scene.json')).toBeUndefined()
  })
})

describe('sceneUsesHdr', () => {
  it('needs both bloom and hdr', () => {
    expect(sceneUsesHdr({ general: { hdr: true, bloom: true } }, {})).toBe(true)
    expect(sceneUsesHdr({ general: { hdr: true, bloom: false } }, {})).toBe(false)
    expect(sceneUsesHdr({ general: { bloom: true } }, {})).toBe(false)
  })

  it('resolves user property bindings', () => {
    const scene = { general: { hdr: true, bloom: { user: 'hdr', value: true } } }
    expect(sceneUsesHdr(scene, {})).toBe(true)
    expect(sceneUsesHdr(scene, { hdr: { value: false } })).toBe(false)
  })
})
