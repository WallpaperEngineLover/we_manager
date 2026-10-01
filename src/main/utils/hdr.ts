import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { WallpaperMeta } from '@shared/types'
import { isCommandAvailable } from './platform'
import { findWallpaperVideoFile } from './video'

const execFileAsync = promisify(execFile)

// scene.pkg can be hundreds of MB, and libraries sit on HDDs, so only the entry table and the
// one wanted entry are read. The table is small, 64KB covers it for all but huge packages.
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
      // packed next to its json name, gifscene.json -> gifscene.pkg, and scene.pkg for everything else
      const named = path.join(localPath, sceneFile.replace(/\.json$/i, '') + '.pkg')
      raw = fs.existsSync(named) ? await readPkgEntry(named, sceneFile) : undefined
      raw ??= await readPkgEntry(path.join(localPath, 'scene.pkg'), sceneFile)
    }
    if (!raw) return undefined
    // same leniency as the engine's JSON::parseAsset: authors ship trailing commas
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

// general values are either plain or bound to a user property: { "user": "name", "value": default }
function generalFlag(general: Record<string, unknown>, key: string, properties: ProjectProperties): boolean {
  const v = general[key]
  if (v && typeof v === 'object') {
    const { user, value } = v as { user?: unknown; value?: unknown }
    const bound = typeof user === 'string' ? properties[user]?.value : undefined
    return !!(bound ?? value)
  }
  return !!v
}

// Same condition the engine renders HDR under (with ultra post processing): bloom and hdr both on
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

/** undefined = could not tell (files missing, no ffprobe) */
export async function detectHdr(w: WallpaperMeta): Promise<boolean | undefined> {
  if (!w.localPath) return undefined
  let dir = w.localPath
  let project = await readProject(dir)
  if (!project) return undefined
  let properties = project.general?.properties ?? {}

  // presets ship only properties, the wallpaper itself is the dependency in a sibling folder
  if (project.dependency && !project.file) {
    dir = path.join(path.dirname(dir), String(project.dependency))
    const base = await readProject(dir)
    if (!base) return undefined
    properties = { ...base.general?.properties, ...properties }
    project = base
  }

  const type = (project.type ?? w.type).toLowerCase()
  if (type === 'scene') {
    const scene = await readSceneJson(dir, project.file ?? 'scene.json')
    return scene === undefined ? undefined : sceneUsesHdr(scene, properties)
  }
  if (type === 'video') {
    const video = findWallpaperVideoFile(dir, project.file)
    return video ? videoIsHdr(video) : undefined
  }
  return false
}
