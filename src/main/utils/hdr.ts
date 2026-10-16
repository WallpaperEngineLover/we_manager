import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { WallpaperMeta } from '@shared/types'
import { isCommandAvailable } from './platform'
import { findWallpaperVideoFile } from './video'

const execFileAsync = promisify(execFile)

// .pkg files can be huge, read only the entry table (64KB covers most) and one entry
const PKG_HEADER_CHUNK = 64 * 1024

export function parsePkgHeader(buf: Buffer): { dataStart: number; entries: Map<string, { offset: number; length: number }> } | undefined {
  let pos = 0
  const u32 = (): number => {
    if (pos + 4 > buf.length) throw new RangeError('short pkg header')
    const v = buf.readUInt32LE(pos)
    pos += 4
    return v
  }
  const str = (): string => {
    const len = u32()
    if (pos + len > buf.length) throw new RangeError('short pkg header')
    const s = buf.toString('utf8', pos, pos + len)
    pos += len
    return s
  }

  try {
    str()
    const count = u32()
    if (count > 1_000_000) return undefined
    const entries = new Map<string, { offset: number; length: number }>()
    for (let i = 0; i < count; i++) {
      const name = str()
      entries.set(name, { offset: u32(), length: u32() })
    }
    return { dataStart: pos, entries }
  } catch {
    return undefined
  }
}

export async function readPkgEntry(pkgPath: string, name: string): Promise<Buffer | undefined> {
  const fh = await fs.promises.open(pkgPath, 'r')
  try {
    const size = (await fh.stat()).size
    let chunk = PKG_HEADER_CHUNK
    let header: ReturnType<typeof parsePkgHeader>
    for (;;) {
      const buf = Buffer.alloc(Math.min(chunk, size))
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
      header = parsePkgHeader(buf.subarray(0, bytesRead))
      if (header || chunk >= size) break
      chunk *= 4
    }
    const entry = header?.entries.get(name)
    if (!header || !entry) return undefined
    const start = header.dataStart + entry.offset
    if (start + entry.length > size) return undefined
    const out = Buffer.alloc(entry.length)
    await fh.read(out, 0, entry.length, start)
    return out
  } finally {
    await fh.close()
  }
}

async function readSceneJson(localPath: string, sceneFile: string): Promise<unknown> {
  try {
    let raw: Buffer | undefined
    try {
      raw = await fs.promises.readFile(path.join(localPath, sceneFile))
    } catch {
      // gifscene.json -> gifscene.pkg, else scene.pkg
      const named = path.join(localPath, sceneFile.replace(/\.json$/i, '') + '.pkg')
      raw = fs.existsSync(named) ? await readPkgEntry(named, sceneFile) : undefined
      raw ??= await readPkgEntry(path.join(localPath, 'scene.pkg'), sceneFile)
    }
    if (!raw) return undefined
    // authors ship trailing commas
    return JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '').replace(/,(\s*[}\]])/g, '$1'))
  } catch {
    return undefined
  }
}

type ProjectProperties = Record<string, { value?: unknown }>

interface Project {
  type?: string
  file?: string
  dependency?: string
  general?: { properties?: ProjectProperties }
}

async function readProject(localPath: string): Promise<Project | undefined> {
  try {
    return JSON.parse(await fs.promises.readFile(path.join(localPath, 'project.json'), 'utf8'))
  } catch {
    return undefined
  }
}

// plain or { "user": "name", "value": default }
function generalFlag(general: Record<string, unknown>, key: string, properties: ProjectProperties): boolean {
  const v = general[key]
  if (v && typeof v === 'object') {
    const { user, value } = v as { user?: unknown; value?: unknown }
    const bound = typeof user === 'string' ? properties[user]?.value : undefined
    return !!(bound ?? value)
  }
  return !!v
}

// the engine's HDR condition under ultra post processing
export function sceneUsesHdr(scene: unknown, properties: ProjectProperties): boolean {
  const general = (scene as { general?: Record<string, unknown> } | undefined)?.general ?? {}
  return generalFlag(general, 'bloom', properties) && generalFlag(general, 'hdr', properties)
}

async function videoIsHdr(file: string): Promise<boolean | undefined> {
  if (!isCommandAvailable('ffprobe')) return undefined
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=color_transfer',
      '-of', 'csv=p=0',
      file
    ], { timeout: 10_000, encoding: 'utf8' })
    const transfer = stdout.trim().split('\n')[0]?.trim()
    return transfer === 'smpte2084' || transfer === 'arib-std-b67'
  } catch {
    return undefined
  }
}

// spatialization marks the sounds HRTF positions
export function sceneUsesSpatialSound(scene: unknown, properties: ProjectProperties): boolean {
  const objects = (scene as { objects?: unknown } | undefined)?.objects
  if (!Array.isArray(objects)) return false
  return objects.some((o) => {
    if (!o || typeof o !== 'object') return false
    const object = o as Record<string, unknown>
    return Array.isArray(object.sound) && object.sound.length > 0 && generalFlag(object, 'spatialization', properties)
  })
}

export interface WallpaperFeatures {
  hdr?: boolean
  hrtf?: boolean
}

/** undefined when it could not be told */
export async function detectFeatures(w: WallpaperMeta): Promise<WallpaperFeatures> {
  if (!w.localPath) return {}
  let dir = w.localPath
  let project = await readProject(dir)
  if (!project) return {}
  let properties = project.general?.properties ?? {}

  // a preset's wallpaper is its dependency

  if (project.dependency && !project.file) {
    dir = path.join(path.dirname(dir), String(project.dependency))
    const base = await readProject(dir)
    if (!base) return {}
    properties = { ...base.general?.properties, ...properties }
    project = base
  }

  const type = (project.type ?? w.type).toLowerCase()
  if (type === 'scene') {
    const scene = await readSceneJson(dir, project.file ?? 'scene.json')
    if (scene === undefined) return {}
    return { hdr: sceneUsesHdr(scene, properties), hrtf: sceneUsesSpatialSound(scene, properties) }
  }
  if (type === 'video') {
    // a video's own audio doesn't go through OpenAL
    if (w.hdr !== undefined) return { hdr: w.hdr, hrtf: false }
    const video = findWallpaperVideoFile(dir, project.file)
    return { hdr: video ? await videoIsHdr(video) : undefined, hrtf: false }
  }
  return { hdr: false, hrtf: false }
}
