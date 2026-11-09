import { describe, expect, it } from 'vitest'
import {
  buildFfmpegArgs,
  colorsMatch,
  cutRangesProblem,
  sourceTimeAt,
  encoderArgs,
  outputDuration,
  outputExtension,
  parseFrameColor,
  DEFAULT_VIDEO_SETTINGS,
  normalizeVideoSettings,
  planQuickOptimize,
  parseProgressSeconds,
  pickEncoder,
  scaleFilter,
  fpsFilter,
  normalizeFps,
  targetSize,
  type VideoInfo
} from './video-tools'

const info: VideoInfo = { codec: 'h264', width: 3840, height: 2160, fps: 30, duration: 60, size: 1000, bitDepth: 8, hasAudio: true }

describe('targetSize', () => {
  it('fits a 16:9 video into a 1080p box', () => {
    expect(targetSize(info, { width: 1920, height: 1080 }, 'fit')).toEqual({ width: 1920, height: 1080 })
  })

  it('keeps the aspect of a non-16:9 video inside an ultrawide box', () => {
    expect(targetSize({ width: 3840, height: 2160 }, { width: 3440, height: 1440 }, 'fit')).toEqual({ width: 2560, height: 1440 })
  })

  it('fits a 4:3 video into a portrait box', () => {
    expect(targetSize({ width: 2048, height: 1536 }, { width: 1080, height: 2400 }, 'fit')).toEqual({ width: 1080, height: 810 })
  })

  it('rounds to even numbers', () => {
    const size = targetSize({ width: 1001, height: 563 }, { width: 500, height: 500 }, 'fit')!
    expect(size.width % 2).toBe(0)
    expect(size.height % 2).toBe(0)
  })

  it('never upscales', () => {
    expect(targetSize({ width: 1280, height: 720 }, { width: 1920, height: 1080 }, 'fit')).toBeNull()
    expect(targetSize({ width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 'fit')).toBeNull()
  })

  it('fill covers the box exactly and crops', () => {
    expect(targetSize({ width: 3840, height: 2160 }, { width: 3440, height: 1440 }, 'fill')).toEqual({ width: 3440, height: 1440 })
  })

  it('fill refuses when one side would have to grow', () => {
    expect(targetSize({ width: 3840, height: 1000 }, { width: 1920, height: 1080 }, 'fill')).toBeNull()
  })

  it('rejects nonsense sizes', () => {
    expect(targetSize({ width: 0, height: 0 }, { width: 100, height: 100 }, 'fit')).toBeNull()
    expect(targetSize(info, { width: 0, height: 100 }, 'fit')).toBeNull()
  })
})

describe('scaleFilter', () => {
  it('scales for fit', () => {
    expect(scaleFilter(info, { width: 1920, height: 1080 }, 'fit')).toBe('scale=1920:1080:flags=lanczos')
  })

  it('scales up to cover, then crops, for fill', () => {
    expect(scaleFilter(info, { width: 3440, height: 1440 }, 'fill')).toBe(
      'scale=3440:1440:force_original_aspect_ratio=increase:flags=lanczos,crop=3440:1440'
    )
  })

  it('is null when nothing would shrink', () => {
    expect(scaleFilter(info, { width: 7680, height: 4320 }, 'fit')).toBeNull()
  })
})

describe('pickEncoder', () => {
  const all = [
    { encoder: 'libx265' as const, source: 'system' as const },
    { encoder: 'hevc_vaapi' as const, source: 'system' as const },
    { encoder: 'hevc_nvenc' as const, source: 'downloaded' as const }
  ]

  it('auto takes the fastest one', () => {
    expect(pickEncoder('auto', all)?.encoder).toBe('hevc_nvenc')
    expect(pickEncoder('auto', all.slice(0, 2))?.encoder).toBe('hevc_vaapi')
    expect(pickEncoder('auto', all.slice(0, 1))?.encoder).toBe('libx265')
  })

  it('takes the named one, or nothing when it does not work here', () => {
    expect(pickEncoder('libx265', all)?.encoder).toBe('libx265')
    expect(pickEncoder('hevc_amf', all)).toBeUndefined()
    expect(pickEncoder('auto', [])).toBeUndefined()
  })
})

describe('outputExtension', () => {
  it('keeps containers that hold HEVC and moves the others to mkv', () => {
    expect(outputExtension('.MP4')).toBe('.MP4')
    expect(outputExtension('.WEBM')).toBe('.mkv')
    expect(outputExtension('.mov')).toBe('.mov')
    expect(outputExtension('.webm')).toBe('.mkv')
    expect(outputExtension('.avi')).toBe('.mkv')
  })
})

describe('fps cap', () => {
  it('accepts whole numbers only', () => {
    expect(normalizeFps(45)).toBe(45)
    expect(normalizeFps(0)).toBe(0)
    expect(normalizeFps(12.5)).toBe(0)
    expect(normalizeFps(999)).toBe(0)
    expect(normalizeFps('30')).toBe(0)
  })

  it('only filters a clearly higher rate', () => {
    expect(fpsFilter({ fps: 60 }, 30)).toBe('fps=30')
    expect(fpsFilter({ fps: 30 }, 30)).toBeNull()
    expect(fpsFilter({ fps: 30 }, undefined)).toBeNull()
  })

  it('puts fps before the scale filter', () => {
    const args = buildFfmpegArgs({
      source: 'in.mp4', dest: 'out.mp4', info: { ...info, fps: 60 },
      options: { encoder: 'libx265', fps: 30, scale: { width: 1920, height: 1080, mode: 'fit' } }, encoder: 'libx265'
    })
    expect(args[args.indexOf('-vf') + 1]).toMatch(/^fps=30,scale=/)
  })
})

describe('buildFfmpegArgs', () => {
  it('re-encodes with libx265 and tags mp4 as hvc1', () => {
    const args = buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto' }, encoder: 'libx265' })
    expect(args).toContain('libx265')
    expect(args.join(' ')).toContain('-tag:v hvc1')
    expect(args.join(' ')).toContain('-c:a copy')
    expect(args.join(' ')).toContain('-movflags +faststart')
    expect(args.at(-1)).toBe('out.mp4')
    expect(args).not.toContain('-vf')
  })

  it('re-encodes the sound of a cut, copied audio starts at the keyframe before it and moves the video', () => {
    const cut = buildFfmpegArgs({
      source: 'in.mp4', dest: 'out.mp4', info,
      options: { encoder: 'auto', cut: { start: 960, end: 1500 } }, encoder: 'libx265'
    }).join(' ')
    expect(cut).toContain('-c:a aac')
    expect(cut).not.toContain('-c:a copy')
    const fast = buildFfmpegArgs({
      source: 'in.mp4', dest: 'out.mp4', info,
      options: { encoder: 'auto', cut: { start: 960, end: 1500, copy: true } }
    }).join(' ')
    expect(fast).toContain('-c:a copy')
  })

  it('does not tag a VAAPI mp4 as hvc1, the encoder keeps its parameter sets in the stream', () => {
    const args = buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto' }, encoder: 'hevc_vaapi' })
    expect(args).toContain('hevc_vaapi')
    expect(args.join(' ')).not.toContain('hvc1')
    const nvenc = buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto' }, encoder: 'hevc_nvenc' })
    expect(nvenc.join(' ')).toContain('-tag:v hvc1')
  })

  it('puts the scale filter before the vaapi upload', () => {
    const args = buildFfmpegArgs({
      source: 'in.mp4', dest: 'out.mp4', info,
      options: { encoder: 'hevc_vaapi', scale: { width: 1920, height: 1080, mode: 'fit' } },
      encoder: 'hevc_vaapi', vaapiDevice: '/dev/dri/renderD129'
    })
    expect(args.slice(args.indexOf('-vaapi_device'), args.indexOf('-vaapi_device') + 2)).toEqual(['-vaapi_device', '/dev/dri/renderD129'])
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=1920:1080:flags=lanczos,format=nv12,hwupload')
    expect(args.indexOf('-vaapi_device')).toBeLessThan(args.indexOf('-i'))
  })

  it('seeks in the input when re-encoding, which is frame exact and skips the decoding before the cut', () => {
    const args = buildFfmpegArgs({
      source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto', cut: { start: 2, end: 10 } }, encoder: 'libx265'
    })
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args.indexOf('-to')).toBeLessThan(args.indexOf('-i'))
  })

  it('copies the streams for a fast cut', () => {
    const args = buildFfmpegArgs({
      source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto', cut: { start: 2, end: 10, copy: true } }
    })
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args.join(' ')).toContain('-c:v copy')
  })

  it('keeps 10 bit sources at 10 bit', () => {
    const args = buildFfmpegArgs({ source: 'in.mkv', dest: 'out.mkv', info: { ...info, bitDepth: 10 }, options: { encoder: 'auto' }, encoder: 'libx265' })
    expect(args).toContain('yuv420p10le')
    expect(args.join(' ')).not.toContain('hvc1')
  })
})

describe('progress and cut length', () => {
  it('reads the last out_time of a chunk', () => {
    expect(parseProgressSeconds('frame=10\nout_time_us=1500000\nprogress=continue\nout_time_us=2500000\n')).toBe(2.5)
    expect(parseProgressSeconds('frame=10\n')).toBeUndefined()
  })

  it('counts the cut length', () => {
    expect(outputDuration(info)).toBe(60)
    expect(outputDuration(info, { start: 10, end: 25 })).toBe(15)
    expect(outputDuration(info, { start: 10, end: 500 })).toBe(50)
  })
})

describe('picture check', () => {
  const stats = (y: number, u: number, v: number): string =>
    `lavfi.signalstats.YAVG=${y}\nlavfi.signalstats.UAVG=${u}\nlavfi.signalstats.VAVG=${v}\nlavfi.signalstats.SATAVG=95`

  it('reads the averages of the first frame', () => {
    expect(parseFrameColor(stats(124.8, 127.1, 125.1))).toEqual({ y: 124.8, u: 127.1, v: 125.1 })
    expect(parseFrameColor('nothing here')).toBeNull()
  })

  it('accepts a faithful encode and rejects a green one', () => {
    const source = parseFrameColor(stats(125, 127, 125))!
    expect(colorsMatch(source, parseFrameColor(stats(124, 128, 126))!)).toBe(true)
    expect(colorsMatch(source, parseFrameColor(stats(145, 55, 35))!)).toBe(false)
  })
})

describe('quality', () => {
  it('uses the CRF for libx265, two higher for the GPU encoders, and keeps it in 22 to 31', () => {
    expect(encoderArgs('libx265', 8).output).toContain('26')
    expect(encoderArgs('libx265', 8, undefined, 31).output).toContain('31')
    expect(encoderArgs('libx265', 8, undefined, 10).output).toContain('22')
    expect(encoderArgs('libx265', 8, undefined, 99).output).toContain('31')
    expect(encoderArgs('hevc_vaapi', 8, '/dev/dri/renderD128', 22).output).toContain('24')
    expect(encoderArgs('hevc_nvenc', 8, undefined, 31).output).toContain('33')
  })
})

describe('quick optimize plan', () => {
  const hd: VideoInfo = { ...info, codec: 'h264', width: 1920, height: 1080 }
  const uhd: VideoInfo = { ...info, codec: 'h264', width: 3840, height: 2160 }
  const withScale = (scaleTo: 'none' | '4k' | '1440p' | '1080p' | '720p') => ({ ...DEFAULT_VIDEO_SETTINGS, scaleTo })

  it('converts a non-HEVC video with the default settings and keeps its size', () => {
    const plan = planQuickOptimize(hd, DEFAULT_VIDEO_SETTINGS)
    expect(plan).toEqual({ options: { encoder: 'auto', crf: 26 } })
  })

  it('never enlarges: a 1080p video stays 1080p even with a 4K target', () => {
    const plan = planQuickOptimize(hd, withScale('4k'))
    expect(plan).toEqual({ options: { encoder: 'auto', crf: 26 } })
    expect('options' in plan && plan.options.scale).toBeFalsy()
  })

  it('cuts to the trim, also on a video that is already H.265', () => {
    const cut = { start: 5, end: 20 }
    expect(planQuickOptimize(hd, DEFAULT_VIDEO_SETTINGS, cut)).toEqual({ options: { encoder: 'auto', crf: 26, cut } })
    const plan = planQuickOptimize({ ...hd, codec: 'hevc' }, DEFAULT_VIDEO_SETTINGS, cut)
    expect('options' in plan && plan.options.cut).toEqual(cut)
  })

  it('reads the trim mode and falls back to asking', () => {
    expect(normalizeVideoSettings({ trimMode: 'auto' }).trimMode).toBe('auto')
    expect(normalizeVideoSettings({ trimMode: 'sometimes' }).trimMode).toBe('ask')
    expect(normalizeVideoSettings(undefined).trimMode).toBe('ask')
  })

  it('scales a larger video down to the target', () => {
    const plan = planQuickOptimize(uhd, withScale('1080p'))
    expect('options' in plan && plan.options.scale).toEqual({ width: 1920, height: 1080, mode: 'fit' })
  })

  it('leaves an H.265 video alone unless it can be scaled down', () => {
    expect(planQuickOptimize({ ...hd, codec: 'hevc' }, DEFAULT_VIDEO_SETTINGS)).toEqual({ skip: 'hevc' })
    expect(planQuickOptimize({ ...hd, codec: 'hevc' }, withScale('1080p'))).toEqual({ skip: 'hevcSize', size: '1080p' })
    const plan = planQuickOptimize({ ...uhd, codec: 'hevc' }, withScale('1440p'))
    expect('options' in plan && plan.options.scale?.height).toBe(1440)
  })

  it('cleans up stored settings', () => {
    expect(normalizeVideoSettings(undefined)).toEqual(DEFAULT_VIDEO_SETTINGS)
    expect(normalizeVideoSettings({ backupOriginal: false, encoder: 'nope', crf: 99, scaleTo: '8k', scaleMode: 'fill' })).toEqual({
      backupOriginal: false,
      encoder: 'auto',
      crf: 31,
      scaleTo: 'none',
      scaleMode: 'fill',
      maxFps: 0,
      trimMode: 'ask'
    })
  })
})

describe('hardware decoding', () => {
  it('asks ffmpeg for the machine\'s own decoder in front of every input', () => {
    const one = buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto' }, encoder: 'hevc_nvenc', hwDecode: true })
    expect(one.join(' ')).toContain('-hwaccel auto -i in.mp4')
    const cut = { start: 0, end: 10, more: [{ start: 20, end: 30 }] }
    const two = buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto', cut }, encoder: 'libx265', hwDecode: true })
    expect(two.filter((a) => a === '-hwaccel')).toHaveLength(2)
  })

  it('stays off without the flag and when only copying', () => {
    expect(buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto' }, encoder: 'libx265' })).not.toContain('-hwaccel')
    expect(buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info, options: { encoder: 'auto', cut: { start: 1, end: 5, copy: true } }, hwDecode: true })).not.toContain('-hwaccel')
  })
})

describe('cutting several parts together', () => {
  const cut = { start: 0, end: 60, more: [{ start: 180, end: 240 }] }
  const long: VideoInfo = { ...info, duration: 300 }

  it('joins the parts with trim and concat instead of seeking', () => {
    const args = buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info: long, options: { encoder: 'auto', cut }, encoder: 'libx265' })
    const graph = args[args.indexOf('-filter_complex') + 1]
    expect(args.join(' ')).toContain('-ss 0 -to 60 -i in.mp4 -ss 180 -to 240 -i in.mp4')
    expect(graph).toContain('[0:v:0]setpts=PTS-STARTPTS[v0]')
    expect(graph).toContain('[1:a:0]asetpts=PTS-STARTPTS[a1]')
    expect(graph).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vj][aj]')
    expect(graph).toContain('[vj]null[vout]')
    expect(args).toContain('[aj]')
    expect(args.join(' ')).toContain('-c:a aac')
  })

  it('runs scale and frame rate after the join and leaves out audio filters for a silent video', () => {
    const args = buildFfmpegArgs({
      source: 'in.mp4', dest: 'out.mkv', info: { ...long, hasAudio: false },
      options: { encoder: 'auto', cut, fps: 24, scale: { width: 1920, height: 1080, mode: 'fit' } }, encoder: 'hevc_vaapi'
    })
    const graph = args[args.indexOf('-filter_complex') + 1]
    expect(graph).not.toContain('asetpts')
    expect(graph).toContain('[v0][v1]concat=n=2:v=1:a=0[vj]')
    expect(graph).toContain('[vj]fps=24,scale=1920:1080:flags=lanczos,format=nv12,hwupload[vout]')
    expect(args).not.toContain('-vf')
  })

  it('cannot be joined by copying', () => {
    expect(() => buildFfmpegArgs({ source: 'in.mp4', dest: 'out.mp4', info: long, options: { encoder: 'auto', cut } })).toThrow('needs an encoder')
  })

  it('adds the lengths of all parts', () => {
    expect(outputDuration(long, cut)).toBe(120)
    expect(outputDuration(long, { start: 0, end: 60, more: [{ start: 280, end: 900 }] })).toBe(80)
  })

  it('maps a time of the result back into the source', () => {
    expect(sourceTimeAt(cut, 10, 300)).toBe(10)
    expect(sourceTimeAt(cut, 70, 300)).toBe(190)
    expect(sourceTimeAt(cut, 500, 300)).toBe(240)
    expect(sourceTimeAt(undefined, 7, 300)).toBe(7)
  })

  it('rejects parts outside the video or out of order', () => {
    expect(cutRangesProblem([{ start: 0, end: 60 }, { start: 180, end: 240 }], 300)).toBeNull()
    expect(cutRangesProblem([{ start: 0, end: 60 }, { start: 50, end: 240 }], 300)).toBe('order')
    expect(cutRangesProblem([{ start: 200, end: 100 }], 300)).toBe('range')
    expect(cutRangesProblem([{ start: 0, end: 60 }, { start: 400, end: 500 }], 300)).toBe('range')
    expect(cutRangesProblem([], 300)).toBe('range')
  })
})
