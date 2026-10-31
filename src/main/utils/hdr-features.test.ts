import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { WallpaperMeta } from '@shared/types'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFile, isCommandAvailable } = vi.hoisted(() => ({
  execFile: vi.fn<(cmd: string, args: string[], opts: { timeout: number; encoding: string }, done: (e: Error | null, r?: { stdout: string }) => void) => void>(),
  isCommandAvailable: vi.fn<(cmd: string) => boolean>()
}))
vi.mock('child_process', () => ({ execFile }))
vi.mock('./platform', () => ({ isCommandAvailable }))

import { detectFeatures } from './hdr'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hdr-features-'))
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }) })

let counter = 0
function wallpaperDir(files: Record<string, string>, name = `w${++counter}`): string {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), content)
  return dir
}

const meta = (localPath: string | undefined, extra: Partial<WallpaperMeta> = {}): WallpaperMeta =>
  ({ id: '1', type: 'scene', localPath, ...extra }) as WallpaperMeta

const project = (extra: Record<string, unknown> = {}): string => JSON.stringify({ type: 'scene', file: 'scene.json', ...extra })

function u32(v: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(v)
  return b
}
const str = (s: string): Buffer => Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(s)])
function pkgWith(name: string, content: string): Buffer {
  return Buffer.concat([str('PKGV0023'), u32(1), str(name), u32(0), u32(Buffer.byteLength(content)), Buffer.from(content)])
}

beforeEach(() => {
  execFile.mockReset()
  isCommandAvailable.mockReset()
})

describe('detectFeatures for scenes', () => {
  it('has nothing to say without a folder or a project.json', async () => {
    expect(await detectFeatures(meta(undefined))).toEqual({})
    expect(await detectFeatures(meta(wallpaperDir({})))).toEqual({})
    expect(await detectFeatures(meta(wallpaperDir({ 'project.json': '{nope' })))).toEqual({})
  })

  it('reads a loose scene.json with a BOM and trailing commas', async () => {
    const scene = '﻿{"general":{"bloom":true,"hdr":true,},"objects":[{"sound":["a.wav"],"spatialization":true,},],}'
    const dir = wallpaperDir({ 'project.json': project(), 'scene.json': scene })
    expect(await detectFeatures(meta(dir))).toEqual({ hdr: true, hrtf: true })
  })

  it('reports false features for a plain scene', async () => {
    const dir = wallpaperDir({ 'project.json': project(), 'scene.json': '{"general":{},"objects":[]}' })
    expect(await detectFeatures(meta(dir))).toEqual({ hdr: false, hrtf: false })
  })

  it('reads the scene out of scene.pkg when there is no loose file', async () => {
    const dir = wallpaperDir({ 'project.json': project() })
    fs.writeFileSync(path.join(dir, 'scene.pkg'), pkgWith('scene.json', '{"general":{"bloom":true,"hdr":true}}'))
    expect(await detectFeatures(meta(dir))).toEqual({ hdr: true, hrtf: false })
  })

  it('prefers a package named after the scene file', async () => {
    const dir = wallpaperDir({ 'project.json': project({ file: 'gifscene.json' }) })
    fs.writeFileSync(path.join(dir, 'gifscene.pkg'), pkgWith('gifscene.json', '{"general":{"bloom":true,"hdr":true}}'))
    fs.writeFileSync(path.join(dir, 'scene.pkg'), pkgWith('gifscene.json', '{"general":{}}'))
    expect(await detectFeatures(meta(dir))).toEqual({ hdr: true, hrtf: false })
  })

  it('falls back to scene.pkg when the named package is missing', async () => {
    const dir = wallpaperDir({ 'project.json': project({ file: 'other.json' }) })
    fs.writeFileSync(path.join(dir, 'scene.pkg'), pkgWith('other.json', '{"general":{"bloom":true,"hdr":true}}'))
    expect(await detectFeatures(meta(dir))).toEqual({ hdr: true, hrtf: false })
  })

  it('has nothing to say when the scene cannot be read or parsed', async () => {
    expect(await detectFeatures(meta(wallpaperDir({ 'project.json': project() })))).toEqual({})
    expect(await detectFeatures(meta(wallpaperDir({ 'project.json': project(), 'scene.json': '{broken' })))).toEqual({})
  })

  it('goes by project.json over the library type, ignoring case', async () => {
    const dir = wallpaperDir({ 'project.json': project({ type: 'Scene' }), 'scene.json': '{"general":{"bloom":true,"hdr":true}}' })
    expect(await detectFeatures(meta(dir, { type: 'web' }))).toEqual({ hdr: true, hrtf: false })
  })

  it('uses the library type when project.json has none', async () => {
    const dir = wallpaperDir({ 'project.json': JSON.stringify({ file: 'scene.json' }), 'scene.json': '{"general":{"bloom":true,"hdr":true}}' })
    expect(await detectFeatures(meta(dir, { type: 'scene' }))).toEqual({ hdr: true, hrtf: false })
    expect(await detectFeatures(meta(dir, { type: 'web' }))).toEqual({ hdr: false, hrtf: false })
  })

  it('resolves property bindings of the project', async () => {
    const scene = '{"general":{"bloom":true,"hdr":{"user":"hdr","value":true}}}'
    const on = wallpaperDir({ 'project.json': project({ general: { properties: { hdr: { value: true } } } }), 'scene.json': scene })
    const off = wallpaperDir({ 'project.json': project({ general: { properties: { hdr: { value: false } } } }), 'scene.json': scene })
    expect((await detectFeatures(meta(on))).hdr).toBe(true)
    expect((await detectFeatures(meta(off))).hdr).toBe(false)
  })
})

describe('detectFeatures for presets', () => {
  it('reads the scene of the dependency next to the preset and lets the preset win on properties', async () => {
    const scene = '{"general":{"bloom":true,"hdr":{"user":"hdr","value":false}}}'
    wallpaperDir({ 'project.json': project({ general: { properties: { hdr: { value: false } } } }), 'scene.json': scene }, 'base-1')
    const preset = wallpaperDir({ 'project.json': JSON.stringify({ dependency: 'base-1', general: { properties: { hdr: { value: true } } } }) }, 'preset-1')
    expect(await detectFeatures(meta(preset))).toEqual({ hdr: true, hrtf: false })
  })

  it('has nothing to say when the dependency is missing', async () => {
    const preset = wallpaperDir({ 'project.json': JSON.stringify({ dependency: 'not-there' }) })
    expect(await detectFeatures(meta(preset))).toEqual({})
  })

  it('does not treat a project with its own file as a preset', async () => {
    const dir = wallpaperDir({ 'project.json': project({ dependency: 'missing' }), 'scene.json': '{"general":{"bloom":true,"hdr":true}}' })
    expect(await detectFeatures(meta(dir))).toEqual({ hdr: true, hrtf: false })
  })
})

describe('detectFeatures for videos and the rest', () => {
  const video = () => wallpaperDir({ 'project.json': JSON.stringify({ type: 'video', file: 'clip.mp4' }), 'clip.mp4': 'x' })
  const probe = (stdout: string) =>
    execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, done: (e: Error | null, r: { stdout: string }) => void) => { done(null, { stdout }) })

  it('trusts what the library already knows', async () => {
    expect(await detectFeatures(meta(video(), { type: 'video', hdr: true }))).toEqual({ hdr: true, hrtf: false })
    expect(await detectFeatures(meta(video(), { type: 'video', hdr: false }))).toEqual({ hdr: false, hrtf: false })
    expect(execFile).not.toHaveBeenCalled()
  })

  it('asks ffprobe about the first video stream', async () => {
    isCommandAvailable.mockReturnValue(true)
    probe('smpte2084\n')
    const dir = video()
    expect(await detectFeatures(meta(dir, { type: 'video' }))).toEqual({ hdr: true, hrtf: false })
    const [cmd, args, opts] = execFile.mock.calls[0]
    expect(cmd).toBe('ffprobe')
    expect(args).toEqual(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=color_transfer', '-of', 'csv=p=0', path.join(dir, 'clip.mp4')])
    expect(opts).toEqual({ timeout: 10_000, encoding: 'utf8' })
    expect(isCommandAvailable).toHaveBeenCalledWith('ffprobe')
  })

  it('knows HLG as HDR and SDR transfers as not', async () => {
    isCommandAvailable.mockReturnValue(true)
    probe('arib-std-b67\n')
    expect((await detectFeatures(meta(video(), { type: 'video' }))).hdr).toBe(true)
    probe('bt709\n')
    expect((await detectFeatures(meta(video(), { type: 'video' }))).hdr).toBe(false)
    probe('  smpte2084  \nbt709\n')
    expect((await detectFeatures(meta(video(), { type: 'video' }))).hdr).toBe(true)
    probe('')
    expect((await detectFeatures(meta(video(), { type: 'video' }))).hdr).toBe(false)
  })

  it('cannot tell without ffprobe or when it fails', async () => {
    isCommandAvailable.mockReturnValue(false)
    expect(await detectFeatures(meta(video(), { type: 'video' }))).toEqual({ hdr: undefined, hrtf: false })
    expect(execFile).not.toHaveBeenCalled()
    isCommandAvailable.mockReturnValue(true)
    execFile.mockImplementation((_c: string, _a: string[], _o: unknown, done: (e: Error) => void) => { done(new Error('boom')) })
    expect(await detectFeatures(meta(video(), { type: 'video' }))).toEqual({ hdr: undefined, hrtf: false })
  })

  it('cannot tell when the folder has no video', async () => {
    isCommandAvailable.mockReturnValue(true)
    const dir = wallpaperDir({ 'project.json': JSON.stringify({ type: 'video', file: 'gone.mp4' }) })
    expect(await detectFeatures(meta(dir, { type: 'video' }))).toEqual({ hdr: undefined, hrtf: false })
  })

  it('has no HDR or HRTF for web wallpapers', async () => {
    const dir = wallpaperDir({ 'project.json': JSON.stringify({ type: 'web', file: 'index.html' }) })
    expect(await detectFeatures(meta(dir, { type: 'web' }))).toEqual({ hdr: false, hrtf: false })
  })
})
