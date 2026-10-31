import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

type Callback = (error: Error | null, result?: { stdout: string }) => void

const execFile = vi.fn<(cmd: string, args: string[], opts: unknown, done: Callback) => void>()
const isCommandAvailable = vi.fn<(cmd: string) => boolean>()

vi.mock('child_process', () => ({ execFile }))
vi.mock('./platform', () => ({ isCommandAvailable }))

const { findWallpaperVideoFile, getVideoFps, getVideoDurationSec } = await import('./video')

function probeReturns(stdout: string): void {
  execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, done: Callback) => { done(null, { stdout }) })
}

let dir = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-video-'))
  execFile.mockReset()
  isCommandAvailable.mockReset()
  isCommandAvailable.mockReturnValue(true)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('findWallpaperVideoFile', () => {
  it('uses the file project.json names when it exists', () => {
    fs.writeFileSync(path.join(dir, 'a.mp4'), '')
    fs.writeFileSync(path.join(dir, 'b.mp4'), '')
    expect(findWallpaperVideoFile(dir, 'b.mp4')).toBe(path.join(dir, 'b.mp4'))
  })

  it('falls back to the first video by extension, any case', () => {
    fs.writeFileSync(path.join(dir, 'notes.txt'), '')
    fs.writeFileSync(path.join(dir, 'clip.MKV'), '')
    expect(findWallpaperVideoFile(dir, 'missing.mp4')).toBe(path.join(dir, 'clip.MKV'))
  })

  it('is undefined without a video or for a missing folder', () => {
    fs.writeFileSync(path.join(dir, 'preview.gif'), '')
    expect(findWallpaperVideoFile(dir)).toBeUndefined()
    expect(findWallpaperVideoFile(path.join(dir, 'nope'))).toBeUndefined()
  })
})

describe('getVideoFps', () => {
  it('rounds the frame rate and prefers r_frame_rate', () => {
    probeReturns('30000/1001,25/1\n')
    return expect(getVideoFps('/v/ntsc.mp4')).resolves.toBe(30)
  })

  it('uses avg_frame_rate when the first one is unusable', async () => {
    probeReturns('0/0,60/1\n')
    expect(await getVideoFps('/v/avg.mp4')).toBe(60)
  })

  it('asks ffprobe for the first video stream of that file', async () => {
    probeReturns('25/1,25/1\n')
    await getVideoFps('/v/args.mp4')
    expect(execFile).toHaveBeenCalledWith(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,avg_frame_rate', '-of', 'csv=p=0', '/v/args.mp4'],
      { timeout: 10_000, encoding: 'utf8' },
      expect.any(Function)
    )
  })

  it('does not round a rate to zero or keep a negative one', async () => {
    probeReturns('0/1,-5/1\n')
    expect(await getVideoFps('/v/zero.mp4')).toBeUndefined()
  })

  it('caches per file', async () => {
    probeReturns('24/1,24/1\n')
    await getVideoFps('/v/cached.mp4')
    await getVideoFps('/v/cached.mp4')
    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it('is undefined without ffprobe, and on a probe error', async () => {
    isCommandAvailable.mockReturnValue(false)
    expect(await getVideoFps('/v/noprobe.mp4')).toBeUndefined()
    expect(execFile).not.toHaveBeenCalled()

    isCommandAvailable.mockReturnValue(true)
    execFile.mockImplementation((_c: string, _a: string[], _o: unknown, done: Callback) => { done(new Error('boom')) })
    expect(await getVideoFps('/v/broken.mp4')).toBeUndefined()
  })
})

describe('getVideoDurationSec', () => {
  it('parses the duration', async () => {
    probeReturns('12.5\n')
    expect(await getVideoDurationSec('/v/dur.mp4')).toBe(12.5)
  })

  it('asks ffprobe for the container duration', async () => {
    probeReturns('3\n')
    await getVideoDurationSec('/v/dargs.mp4')
    expect(execFile).toHaveBeenCalledWith(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', '/v/dargs.mp4'],
      { timeout: 10_000, encoding: 'utf8' },
      expect.any(Function)
    )
  })

  it('caches per file and skips ffprobe when it is missing', async () => {
    probeReturns('8\n')
    await getVideoDurationSec('/v/dcache.mp4')
    await getVideoDurationSec('/v/dcache.mp4')
    expect(execFile).toHaveBeenCalledTimes(1)

    isCommandAvailable.mockReturnValue(false)
    expect(await getVideoDurationSec('/v/dnone.mp4')).toBeUndefined()
  })

  it('is undefined when the probe fails', async () => {
    execFile.mockImplementation((_c: string, _a: string[], _o: unknown, done: Callback) => { done(new Error('boom')) })
    expect(await getVideoDurationSec('/v/dfail.mp4')).toBeUndefined()
  })

  it('rejects zero and garbage', async () => {
    probeReturns('N/A\n')
    expect(await getVideoDurationSec('/v/na.mp4')).toBeUndefined()
    probeReturns('0\n')
    expect(await getVideoDurationSec('/v/zero.mp4')).toBeUndefined()
  })
})
