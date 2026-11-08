export type HevcEncoder = 'libx265' | 'hevc_nvenc' | 'hevc_qsv' | 'hevc_amf' | 'hevc_vaapi'

/** fastest first, libx265 only when no GPU encoder works */
export const ENCODER_RANKING: HevcEncoder[] = ['hevc_nvenc', 'hevc_qsv', 'hevc_amf', 'hevc_vaapi', 'libx265']

export const CRF_MIN = 22
export const CRF_MAX = 31
export const CRF_DEFAULT = 26

export function clampCrf(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return CRF_DEFAULT
  return Math.min(CRF_MAX, Math.max(CRF_MIN, Math.round(value)))
}

export interface VideoInfo {
  codec: string
  width: number
  height: number
  fps: number
  duration: number
  size: number
  bitDepth: number
  hasAudio: boolean
}

export const ENCODER_LABELS: Record<HevcEncoder, string> = {
  libx265: 'libx265 (CPU)',
  hevc_nvenc: 'NVENC (NVIDIA)',
  hevc_qsv: 'Quick Sync (Intel)',
  hevc_amf: 'AMF (AMD)',
  hevc_vaapi: 'VAAPI (GPU)'
}

export interface EncoderOption {
  encoder: HevcEncoder
  /** where the ffmpeg that runs it comes from */
  source: 'system' | 'downloaded'
  /** the render node a VAAPI encoder works on */
  device?: string
  /** decode on the GPU too, set once a trial encode showed it draws the right picture */
  hwDecode?: boolean
}

export interface VideoToolsStatus {
  encoders: EncoderOption[]
  /** in ffmpeg and running, but drawing a wrong picture, so not offered */
  wrong: EncoderOption[]
  downloaded: boolean
  /** the release asset exists for this CPU */
  canDownload: boolean
}

export interface ScreenSize {
  name: string
  width: number
  height: number
}

export interface VideoProbe {
  info: VideoInfo
  screens: ScreenSize[]
  /** the wallpaper's own trim as ranges in order, empty without a trim */
  trim: CutRange[]
  /** wallpaper:// address of the video when the window can play it (mp4, webm), for the cut preview */
  previewUrl: string | null
}

export interface CutRange {
  start: number
  end: number
}

export type ScaleMode = 'fit' | 'fill'

export interface OptimizeOptions {
  /** 'auto' picks the fastest working encoder */
  encoder: HevcEncoder | 'auto'
  /** libx265's CRF (22 to 31, lower is sharper and larger), the GPU encoders get the equivalent constant quality */
  crf?: number
  /** encode again although the video already is H.265 */
  force?: boolean
  scale?: { width: number; height: number; mode: ScaleMode }
  /** frame rate cap, a video that already runs at or below it keeps its rate */
  fps?: number
  /** the part that is kept; `more` are further parts joined after it in order, the gaps between them are cut out */
  cut?: { start: number; end: number; copy?: boolean; more?: CutRange[] }
}

export function cutRanges(cut: { start: number; end: number; more?: CutRange[] }): CutRange[] {
  return [{ start: cut.start, end: cut.end }, ...(cut.more ?? [])]
}

/** ranges to keep must lie inside the video, be longer than nothing and follow each other without overlapping */
export function cutRangesProblem(ranges: CutRange[], duration: number): 'range' | 'order' | null {
  if (ranges.length === 0) return 'range'
  for (const r of ranges) {
    if (!(Number.isFinite(r.start) && Number.isFinite(r.end) && r.start >= 0 && r.end > r.start && r.start < duration)) return 'range'
  }
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) return 'order'
  }
  return null
}

/** where in the source the cut result's time `at` comes from */
export function sourceTimeAt(cut: { start: number; end: number; more?: CutRange[] } | undefined, at: number, duration: number): number {
  if (!cut) return at
  let left = at
  const ranges = cutRanges(cut)
  for (const r of ranges) {
    const length = Math.max(0, Math.min(r.end, duration) - r.start)
    if (left < length) return r.start + left
    left -= length
  }
  const last = ranges[ranges.length - 1]
  return Math.min(last.end, duration)
}

export interface OptimizeResult {
  originalSize: number
  newSize: number
  /** the encoder that did it, none for a cut that only copies */
  encoder?: HevcEncoder
  /** encoders that drew a wrong picture on this video and were skipped */
  skipped: HevcEncoder[]
}

export interface OptimizeProgress {
  itemId: string
  stage: 'downloading' | 'unpacking' | 'encoding' | 'done' | 'error'
  percentage: number
  message?: string
}

export function isHevc(codec: string): boolean {
  return codec === 'hevc' || codec === 'h265'
}

function even(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2)
}

/**
 * Size of the output, null when the source is not larger than the target (never upscales).
 * 'fit' keeps the whole picture inside the box, 'fill' covers the box and crops the overhang,
 * so the result has exactly the box's aspect ratio (rounded to even numbers).
 */
export function targetSize(
  src: { width: number; height: number },
  box: { width: number; height: number },
  mode: ScaleMode
): { width: number; height: number } | null {
  if (!(src.width > 0 && src.height > 0 && box.width > 0 && box.height > 0)) return null
  if (mode === 'fit') {
    const factor = Math.min(box.width / src.width, box.height / src.height)
    if (factor >= 1) return null
    return { width: even(src.width * factor), height: even(src.height * factor) }
  }
  const factor = Math.max(box.width / src.width, box.height / src.height)
  if (factor >= 1) return null
  return { width: even(box.width), height: even(box.height) }
}

export function scaleFilter(
  src: { width: number; height: number },
  box: { width: number; height: number },
  mode: ScaleMode
): string | null {
  const size = targetSize(src, box, mode)
  if (!size) return null
  if (mode === 'fit') return `scale=${size.width}:${size.height}:flags=lanczos`
  return `scale=${size.width}:${size.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${size.width}:${size.height}`
}

export const FPS_TARGETS = [60, 30, 24, 15]
export const FPS_MAX = 240

/** a whole number of frames per second from 1 to FPS_MAX, 0 for anything else */
export function normalizeFps(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= FPS_MAX ? value : 0
}

/** the video's rate may be fractional (29.97), so a cap only counts when it is clearly lower */
export function fpsFilter(info: { fps: number }, fps: number | undefined): string | null {
  if (!fps || !(fps > 0) || !(info.fps > fps + 0.5)) return null
  return `fps=${fps}`
}

export interface EncoderArgs {
  /** before -i */
  input: string[]
  /** appended to the -vf chain */
  filter?: string
  output: string[]
}

export function encoderArgs(
  encoder: HevcEncoder,
  bitDepth: number,
  vaapiDevice = '/dev/dri/renderD128',
  crf = CRF_DEFAULT
): EncoderArgs {
  const tenBit = bitDepth > 8
  const x265 = String(clampCrf(crf))
  const q = String(clampCrf(crf) + 2)
  switch (encoder) {
    case 'libx265':
      return {
        input: [],
        output: ['-c:v', 'libx265', '-preset', 'medium', '-crf', x265, '-pix_fmt', tenBit ? 'yuv420p10le' : 'yuv420p']
      }
    case 'hevc_nvenc':
      return {
        input: [],
        output: [
          '-c:v', 'hevc_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', q, '-b:v', '0',
          '-pix_fmt', tenBit ? 'p010le' : 'yuv420p'
        ]
      }
    case 'hevc_qsv':
      return {
        input: [],
        output: ['-c:v', 'hevc_qsv', '-preset', 'medium', '-global_quality', q, '-pix_fmt', tenBit ? 'p010le' : 'nv12']
      }
    case 'hevc_amf':
      return {
        input: [],
        output: [
          '-c:v', 'hevc_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', q, '-qp_p', q,
          '-pix_fmt', tenBit ? 'p010le' : 'yuv420p'
        ]
      }
    case 'hevc_vaapi':
      return {
        input: ['-vaapi_device', vaapiDevice],
        filter: `format=${tenBit ? 'p010' : 'nv12'},hwupload`,
        output: ['-c:v', 'hevc_vaapi', '-qp', q]
      }
  }
}

export function pickEncoder(wanted: HevcEncoder | 'auto', available: EncoderOption[]): EncoderOption | undefined {
  if (wanted !== 'auto') return available.find((o) => o.encoder === wanted)
  for (const encoder of ENCODER_RANKING) {
    const hit = available.find((o) => o.encoder === encoder)
    if (hit) return hit
  }
  return undefined
}

/** output extension for HEVC: mp4, mov and mkv hold it, webm and avi do not; the spelling of a kept one stays as it is */
export function outputExtension(sourceExt: string): string {
  return ['.mp4', '.m4v', '.mov', '.mkv'].includes(sourceExt.toLowerCase()) ? sourceExt : '.mkv'
}

export interface BuildArgsInput {
  source: string
  dest: string
  info: VideoInfo
  options: OptimizeOptions
  encoder?: HevcEncoder
  vaapiDevice?: string
  /** ffmpeg picks whatever decoder the machine has (CUDA, VAAPI, QSV, D3D, ...) and hands frames back to the filters, it falls back to software by itself */
  hwDecode?: boolean
}

/** The ffmpeg command line for one job, a pure function so it can be tested */
export function buildFfmpegArgs({ source, dest, info, options, encoder, vaapiDevice, hwDecode }: BuildArgsInput): string[] {
  const args = ['-hide_banner', '-nostdin', '-y']
  const { cut } = options
  const ranges = cut ? cutRanges(cut) : []
  const joined = ranges.length > 1

  const enc = encoder ? encoderArgs(encoder, info.bitDepth, vaapiDevice, options.crf) : undefined
  if (joined && !enc) throw new Error('joining several parts needs an encoder')
  if (enc) args.push(...enc.input)
  const decode = hwDecode && enc ? ['-hwaccel', 'auto'] : []
  if (joined) {
    // one input per part, each seeks to its own start instead of decoding everything in front of it
    for (const r of ranges) args.push(...decode, '-ss', String(r.start), '-to', String(r.end), '-i', source)
  } else {
    if (cut) args.push('-ss', String(cut.start), '-to', String(cut.end))
    args.push(...decode, '-i', source)
  }

  const filters: string[] = []
  if (enc) {
    const rate = fpsFilter(info, options.fps)
    if (rate) filters.push(rate)
    if (options.scale) {
      const scale = scaleFilter(info, options.scale, options.scale.mode)
      if (scale) filters.push(scale)
    }
    if (enc.filter) filters.push(enc.filter)
  }

  if (joined) {
    const graph: string[] = []
    const inputs: string[] = []
    ranges.forEach((_, i) => {
      graph.push(`[${i}:v:0]setpts=PTS-STARTPTS[v${i}]`)
      inputs.push(`[v${i}]`)
      if (info.hasAudio) {
        graph.push(`[${i}:a:0]asetpts=PTS-STARTPTS[a${i}]`)
        inputs.push(`[a${i}]`)
      }
    })
    graph.push(`${inputs.join('')}concat=n=${ranges.length}:v=1:a=${info.hasAudio ? 1 : 0}[vj]${info.hasAudio ? '[aj]' : ''}`)
    graph.push(`[vj]${filters.length > 0 ? filters.join(',') : 'null'}[vout]`)
    args.push('-filter_complex', graph.join(';'), '-map', '[vout]')
    if (info.hasAudio) args.push('-map', '[aj]')
    args.push('-map_metadata', '0')
  } else {
    args.push('-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0')
    if (filters.length > 0) args.push('-vf', filters.join(','))
  }

  if (enc) {
    args.push(...enc.output)
    // VAAPI writes the parameter sets into the stream, an hvc1 mp4 says they are not there: the player decodes green and pink
    if (/\.(mp4|m4v|mov)$/i.test(dest) && encoder !== 'hevc_vaapi') args.push('-tag:v', 'hvc1')
  } else {
    args.push('-c:v', 'copy')
  }

  // ffmpeg 8.1 starts the copied audio at the keyframe before the cut and shifts the video by the gap, so a cut re-encodes the sound
  if (enc && cut) args.push('-c:a', 'aac', '-b:a', '192k')
  else args.push('-c:a', 'copy')
  if (/\.(mp4|m4v|mov)$/i.test(dest)) args.push('-movflags', '+faststart')
  args.push('-progress', 'pipe:1', '-nostats', dest)
  return args
}

/** seconds of the last out_time line in a chunk of ffmpeg -progress output */
export function parseProgressSeconds(chunk: string): number | undefined {
  let seconds: number | undefined
  for (const line of chunk.split('\n')) {
    const m = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim())
    // both keys carry microseconds (out_time_ms is a long-standing misnomer)
    if (m) seconds = Number(m[1]) / 1_000_000
  }
  return seconds
}

/** Seconds of video left after the cut, the whole duration without one */
export function outputDuration(info: VideoInfo, cut?: { start: number; end: number; more?: CutRange[] }): number {
  if (!cut) return info.duration
  return cutRanges(cut).reduce((sum, r) => sum + Math.max(0, Math.min(r.end, info.duration) - r.start), 0)
}

export interface FrameColor {
  y: number
  u: number
  v: number
}

/** average Y, U and V of one frame from ffmpeg's `signalstats,metadata=print` output */
export function parseFrameColor(output: string): FrameColor | null {
  const grab = (key: string): number => {
    const m = new RegExp(`lavfi\\.signalstats\\.${key}AVG=([0-9.]+)`).exec(output)
    return m ? Number(m[1]) : NaN
  }
  const color = { y: grab('Y'), u: grab('U'), v: grab('V') }
  return Number.isFinite(color.y) && Number.isFinite(color.u) && Number.isFinite(color.v) ? color : null
}

/** A hardware encoder that writes a green or otherwise wrong picture still exits cleanly, so the result is compared with the source */
export function colorsMatch(a: FrameColor, b: FrameColor, tolerance = 40): boolean {
  return Math.abs(a.y - b.y) <= tolerance && Math.abs(a.u - b.u) <= tolerance && Math.abs(a.v - b.v) <= tolerance
}

export type ScaleTarget = 'none' | '4k' | '1440p' | '1080p' | '720p'

/** the largest size a "downscale to" default can name, nothing here is ever bigger than 4K */
export const SCALE_TARGETS: Record<Exclude<ScaleTarget, 'none'>, { width: number; height: number; label: string }> = {
  '4k': { width: 3840, height: 2160, label: '4K' },
  '1440p': { width: 2560, height: 1440, label: '1440p' },
  '1080p': { width: 1920, height: 1080, label: '1080p' },
  '720p': { width: 1280, height: 720, label: '720p' }
}

export type TrimMode = 'never' | 'ask' | 'auto'

export const TRIM_MODES: TrimMode[] = ['never', 'ask', 'auto']

export interface QuickTrim {
  id: string
  title: string
  start: number
  end: number
}

export interface VideoToolSettings {
  /** copy the original next to the video before it is replaced */
  backupOriginal: boolean
  encoder: HevcEncoder | 'auto'
  crf: number
  scaleTo: ScaleTarget
  scaleMode: ScaleMode
  /** frame rate cap for quick optimize, 0 keeps the rate */
  maxFps: number
  /** what quick optimize does with a wallpaper's own trim times */
  trimMode: TrimMode
}

export const DEFAULT_VIDEO_SETTINGS: VideoToolSettings = {
  backupOriginal: true,
  encoder: 'auto',
  crf: CRF_DEFAULT,
  scaleTo: 'none',
  scaleMode: 'fit',
  maxFps: 0,
  trimMode: 'ask'
}

export function normalizeVideoSettings(raw: unknown): VideoToolSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof VideoToolSettings, unknown>>
  const encoders: (HevcEncoder | 'auto')[] = ['auto', ...ENCODER_RANKING]
  return {
    backupOriginal: typeof r.backupOriginal === 'boolean' ? r.backupOriginal : DEFAULT_VIDEO_SETTINGS.backupOriginal,
    encoder: encoders.includes(r.encoder as HevcEncoder | 'auto') ? (r.encoder as HevcEncoder | 'auto') : 'auto',
    crf: clampCrf(typeof r.crf === 'number' ? r.crf : undefined),
    scaleTo: typeof r.scaleTo === 'string' && (r.scaleTo === 'none' || Object.hasOwn(SCALE_TARGETS, r.scaleTo)) ? (r.scaleTo as ScaleTarget) : 'none',
    scaleMode: r.scaleMode === 'fill' ? 'fill' : 'fit',
    maxFps: normalizeFps(r.maxFps),
    trimMode: TRIM_MODES.includes(r.trimMode as TrimMode) ? (r.trimMode as TrimMode) : DEFAULT_VIDEO_SETTINGS.trimMode
  }
}

export type QuickPlan =
  | { options: OptimizeOptions }
  | { skip: 'hevc' }
  | { skip: 'hevcSize'; size: string }

/**
 * What "Quick optimize" does to one video with the default settings, or why it leaves it alone.
 * The size only ever shrinks: a video that is not larger than the target keeps its size (targetSize gives null).
 */
export function planQuickOptimize(
  info: VideoInfo,
  settings: VideoToolSettings,
  cut?: { start: number; end: number } | null
): QuickPlan {
  const target = settings.scaleTo === 'none' ? null : SCALE_TARGETS[settings.scaleTo]
  const box = target ? { width: target.width, height: target.height } : null
  const smaller = box ? targetSize(info, box, settings.scaleMode) : null
  const options: OptimizeOptions = { encoder: settings.encoder, crf: settings.crf }
  if (smaller && box) options.scale = { ...box, mode: settings.scaleMode }
  if (fpsFilter(info, settings.maxFps)) options.fps = settings.maxFps
  if (cut) options.cut = { start: cut.start, end: cut.end }
  if (isHevc(info.codec) && !options.scale && !options.cut && !options.fps) {
    return target ? { skip: 'hevcSize', size: target.label } : { skip: 'hevc' }
  }
  return { options }
}

export interface QuickLine {
  id: string
  title: string
  kind: 'skipped' | 'failed'
  /** the whole line, already worded */
  text: string
}

export interface QuickReport {
  lines: QuickLine[]
  optimized: number
  /** how much smaller the results are than the originals, also when the originals are kept */
  savedBytes: number
  /** the copies of the originals stay next to the results, so the space is only freed once they are deleted */
  originalsKept: boolean
}

export interface QuickProgress {
  /** videos done so far */
  done: number
  total: number
  id: string
  title: string
}
