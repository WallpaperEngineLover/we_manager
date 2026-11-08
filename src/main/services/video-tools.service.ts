import { execFile, spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { screen, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { WallpaperMeta } from '@shared/types'
import {
  ENCODER_RANKING,
  buildFfmpegArgs,
  encoderArgs,
  fpsFilter,
  isHevc,
  outputDuration,
  colorsMatch,
  ENCODER_LABELS,
  type FrameColor,
  outputExtension,
  parseFrameColor,
  parseProgressSeconds,
  pickEncoder,
  planQuickOptimize,
  scaleFilter,
  cutRanges,
  cutRangesProblem,
  sourceTimeAt,
  type EncoderOption,
  type HevcEncoder,
  type OptimizeOptions,
  type OptimizeProgress,
  type OptimizeResult,
  type QuickLine,
  type QuickReport,
  type QuickTrim,
  type ScreenSize,
  type VideoInfo,
  type VideoProbe,
  type VideoToolsStatus
} from '@shared/video-tools'
import { getAllWallpapers, getDirSizeAsync, getWallpaper, updateWallpaper } from './library.service'
import { fsyncPath, syncDir } from './backup.service'
import { getWallpapersInUse } from './display.service'
import { getConfiguredWorkshopPath, getVideoToolSettings } from './config.service'
import { getDataPath, getFfmpegDir } from '../utils/paths'
import { hostCommand, invalidateHostCommandCache, isFlatpak, isHostCommandAvailable } from '../utils/flatpak'
import { invalidateCommandCache, isCommandAvailable } from '../utils/platform'
import { downloadVerified, fetchLatestRelease, type GithubAsset } from '../utils/github'
import { forgetVideoProbe } from '../utils/video'
import { t } from '../i18n'
import { trimAsCut, trimAsCuts, videoSegmentsOf } from '@shared/videoTrim'
import { execFileAsync } from '../utils/exec'

const FFMPEG_BUILDS_REPO = 'BtbN/FFmpeg-Builds'

type Source = 'system' | 'downloaded'

type Tool = 'ffmpeg' | 'ffprobe'

function downloadedBinary(tool: Tool): string {
  return path.join(getFfmpegDir(), tool)
}

function systemHas(tool: Tool): boolean {
  return isFlatpak() ? isHostCommandAvailable(tool) : isCommandAvailable(tool)
}

function hasSource(source: Source): boolean {
  return source === 'downloaded' ? fs.existsSync(downloadedBinary('ffmpeg')) : systemHas('ffmpeg')
}

function command(source: Source, tool: Tool, args: string[], lowPriority = false): [string, string[]] {
  const program = source === 'downloaded' ? downloadedBinary(tool) : tool
  const argv = lowPriority ? ['nice', '-n', '10', program, ...args] : [program, ...args]
  return source === 'downloaded' ? [argv[0], argv.slice(1)] : hostCommand(argv[0], argv.slice(1), { dieWithApp: true })
}

function run(source: Source, tool: Tool, args: string[], timeout: number, owner?: Job): Promise<string> {
  const [file, fileArgs] = command(source, tool, args)
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      fileArgs,
      { timeout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        owner?.helpers.delete(child)
        if (err) reject(err)
        else resolve(stdout)
      }
    )
    owner?.helpers.add(child)
  })
}

function renderDevices(): string[] {
  try {
    return fs
      .readdirSync('/dev/dri')
      .filter((n) => n.startsWith('renderD'))
      .sort()
      .map((n) => `/dev/dri/${n}`)
  } catch {
    return []
  }
}

/** average colour of one frame, scaled down so the whole picture counts and bit depth does not matter */
async function frameColor(
  source: Source,
  input: string[],
  at = 0,
  filters: string[] = [],
  owner?: Job
): Promise<FrameColor | null> {
  const vf = [...filters, 'format=yuv420p', 'scale=16:16:flags=area', 'signalstats', 'metadata=print:file=-'].join(',')
  const out = await run(
    source,
    'ffmpeg',
    ['-hide_banner', '-nostdin', '-loglevel', 'error', ...(at > 0 ? ['-ss', String(at)] : []), ...input, '-vf', vf, '-frames:v', '1', '-an', '-f', 'null', '-'],
    60_000,
    owner
  )
  return parseFrameColor(out)
}

/**
 * Short test files go under the app's data folder, not /tmp: inside a Flatpak ffmpeg runs on the host, whose /tmp is a
 * different one, but the data folder has the same path on both sides.
 */
let scratchSwept = false

async function scratchDir(): Promise<string> {
  const dir = path.join(getDataPath(), 'video-tmp')
  await fs.promises.mkdir(dir, { recursive: true })
  if (!scratchSwept) {
    scratchSwept = true
    const stale = await fs.promises.readdir(dir).catch(() => [])
    await Promise.all(stale.map((name) => fs.promises.rm(path.join(dir, name), { force: true })))
  }
  return dir
}

type ProbeVerdict = 'ok' | 'wrong' | 'error'

async function probeEncoder(source: Source, encoder: HevcEncoder, device?: string): Promise<ProbeVerdict> {
  const enc = encoderArgs(encoder, 8, device)
  let probe: string
  try {
    probe = path.join(await scratchDir(), `probe-${process.pid}-${encoder}.mkv`)
  } catch {
    return 'error'
  }
  const lavfi = 'testsrc2=s=640x360:d=1:r=10'
  const args = [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-y',
    ...enc.input,
    '-f',
    'lavfi',
    '-i',
    lavfi,
    ...(enc.filter ? ['-vf', enc.filter] : []),
    ...enc.output,
    probe
  ]
  try {
    await run(source, 'ffmpeg', args, 20_000)
    const [want, got] = await Promise.all([
      frameColor(source, ['-f', 'lavfi', '-i', lavfi]),
      frameColor(source, ['-i', probe])
    ])
    return want && got && colorsMatch(want, got) ? 'ok' : 'wrong'
  } catch {
    return 'error'
  } finally {
    await fs.promises.rm(probe, { force: true })
  }
}

interface EncoderProbe {
  working: EncoderOption[]
  wrong: EncoderOption[]
}

/**
 * ffmpeg lists encoders it was built with, whether this machine can use them is only known by trying one.
 * VAAPI is tried on every render node: a machine with an iGPU and a graphics card has two, and only one may encode correctly.
 */
async function workingEncoders(source: Source): Promise<EncoderProbe> {
  const result: EncoderProbe = { working: [], wrong: [] }
  let listed: string
  try {
    listed = await run(source, 'ffmpeg', ['-hide_banner', '-encoders'], 15_000)
  } catch {
    return result
  }
  for (const encoder of ENCODER_RANKING) {
    if (!new RegExp(`\\s${encoder}\\s`).test(listed)) continue
    const devices: (string | undefined)[] = encoder === 'hevc_vaapi' ? renderDevices() : [undefined]
    let sawWrong = false
    let works = false
    for (const device of devices) {
      const verdict = await probeEncoder(source, encoder, device)
      if (verdict === 'ok') {
        result.working.push({ encoder, source, device })
        works = true
        break
      }
      if (verdict === 'wrong') {
        sawWrong = true
        console.warn(`[VideoTools] ${encoder}${device ? ` on ${device}` : ''} writes a wrong picture`)
      }
    }
    if (!works && sawWrong) result.wrong.push({ encoder, source })
  }
  return result
}

const badEncoders = new Set<string>()
const pictureFailures = new Map<string, number>()
const PICTURE_FAILURES_TO_BAN = 2

function badKey(source: Source, encoder: HevcEncoder): string {
  return `${source}:${encoder}`
}

const EMPTY_PROBE_KEPT_MS = 60_000
const encoderCache = new Map<Source, Promise<EncoderProbe>>()

function encodersOf(source: Source): Promise<EncoderProbe> {
  const cached = encoderCache.get(source)
  if (cached) return cached
  if (source === 'system') {
    for (const tool of ['ffmpeg', 'ffprobe']) {
      invalidateCommandCache(tool)
      invalidateHostCommandCache(tool)
    }
  }
  if (!hasSource(source)) return Promise.resolve({ working: [], wrong: [] })
  const probing = workingEncoders(source).then(
    (probe) => {
      if (probe.working.length === 0 && probe.wrong.length === 0) {
        setTimeout(() => { if (encoderCache.get(source) === probing) encoderCache.delete(source) }, EMPTY_PROBE_KEPT_MS).unref()
      }
      return probe
    },
    (err: unknown) => {
      encoderCache.delete(source)
      throw err
    }
  )
  encoderCache.set(source, probing)
  return probing
}

function ffprobeSource(): Source | undefined {
  if (fs.existsSync(downloadedBinary('ffprobe'))) return 'downloaded'
  return systemHas('ffprobe') ? 'system' : undefined
}

function assetPattern(): RegExp | null {
  const arch = process.arch === 'x64' ? 'linux64' : process.arch === 'arm64' ? 'linuxarm64' : null
  return arch ? new RegExp(`^ffmpeg-n(\\d+)\\.(\\d+)-latest-${arch}-gpl-\\d+\\.\\d+\\.tar\\.xz$`) : null
}

export async function getVideoToolsStatus(): Promise<VideoToolsStatus> {
  const options: EncoderOption[] = []
  const wrong: EncoderOption[] = []
  for (const source of ['system', 'downloaded'] as const) {
    const probe = await encodersOf(source)
    for (const option of probe.working) {
      if (badEncoders.has(badKey(source, option.encoder))) {
        wrong.push({ encoder: option.encoder, source })
        continue
      }
      if (!options.some((o) => o.encoder === option.encoder)) options.push(option)
    }
    wrong.push(...probe.wrong)
  }
  return {
    encoders: options,
    wrong: wrong.filter((w) => !options.some((o) => o.encoder === w.encoder)),
    downloaded: hasSource('downloaded'),
    canDownload: assetPattern() !== null
  }
}

function newestAsset(assets: GithubAsset[]): GithubAsset | undefined {
  const pattern = assetPattern()
  if (!pattern) return undefined
  let best: { asset: GithubAsset; version: number } | undefined
  for (const asset of assets) {
    const m = pattern.exec(asset.name)
    if (!m) continue
    const version = Number(m[1]) * 1000 + Number(m[2])
    if (!best || version > best.version) best = { asset, version }
  }
  return best?.asset
}

let downloading = false

export async function downloadFfmpeg(win: BrowserWindow): Promise<void> {
  if (downloading) throw new OptimizeError('busy', t('optimize.errBusy'))
  downloading = true
  const send = (progress: Omit<OptimizeProgress, 'itemId'>) => {
    if (!win.isDestroyed())
      win.webContents.send(IpcChannels.EVENT_VIDEO_TOOLS_PROGRESS, {
        itemId: 'ffmpeg',
        ...progress
      })
  }
  const dir = getFfmpegDir()
  const archive = `${dir}.download.tar.xz`
  const staging = `${dir}.staging`
  try {
    const release = await fetchLatestRelease(FFMPEG_BUILDS_REPO)
    const asset = release && newestAsset(release.assets)
    if (!asset) throw new Error(t('optimize.errNoBuild'))
    const sizeMb = Math.round(asset.size / 1_048_576)
    send({
      stage: 'downloading',
      percentage: 0,
      message: t('optimize.downloading', { size: sizeMb })
    })
    await fs.promises.mkdir(path.dirname(dir), { recursive: true })
    await downloadVerified(asset, archive, (fraction) => {
      send({
        stage: 'downloading',
        percentage: Math.round(fraction * 90),
        message: t('optimize.downloading', { size: sizeMb })
      })
    })

    send({
      stage: 'unpacking',
      percentage: 92,
      message: t('optimize.unpacking')
    })
    await fs.promises.rm(staging, { recursive: true, force: true })
    await fs.promises.mkdir(staging, { recursive: true })
    await execFileAsync(
      'tar',
      ['-xJf', archive, '-C', staging, '--strip-components=2', '--wildcards', '*/bin/ffmpeg', '*/bin/ffprobe'],
      { timeout: 600_000 }
    )
    for (const tool of ['ffmpeg', 'ffprobe']) {
      await fs.promises.chmod(path.join(staging, tool), 0o755)
    }
    await execFileAsync(path.join(staging, 'ffmpeg'), ['-version'], {
      timeout: 15_000
    })

    await fs.promises.rm(dir, { recursive: true, force: true })
    await fs.promises.rename(staging, dir)
    encoderCache.delete('downloaded')
    send({ stage: 'done', percentage: 100 })
  } catch (err) {
    send({ stage: 'error', percentage: 0, message: (err as Error).message })
    throw err
  } finally {
    downloading = false
    await fs.promises.rm(archive, { force: true })
    await fs.promises.rm(staging, { recursive: true, force: true })
  }
}

export async function removeDownloadedFfmpeg(): Promise<void> {
  await fs.promises.rm(getFfmpegDir(), { recursive: true, force: true })
  encoderCache.delete('downloaded')
}

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
  pix_fmt?: string
}

function frameRate(raw?: string): number {
  const [num, den] = (raw ?? '').split('/').map(Number)
  return num && den ? num / den : 0
}

export async function probeFile(file: string, owner?: Job): Promise<VideoInfo> {
  const source = ffprobeSource()
  if (!source) throw new Error(t('optimize.errNoFfmpeg'))
  const out = await run(
    source,
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,pix_fmt:format=duration,size',
      '-of',
      'json',
      file
    ],
    30_000,
    owner
  )
  const parsed = JSON.parse(out) as {
    streams?: FfprobeStream[]
    format?: { duration?: string; size?: string }
  }
  const video = parsed.streams?.find((s) => s.codec_type === 'video')
  if (!video?.width || !video.height) throw new OptimizeError('skip', t('optimize.errNotVideo'))
  return {
    codec: video.codec_name ?? '',
    width: video.width,
    height: video.height,
    fps: frameRate(video.avg_frame_rate) || frameRate(video.r_frame_rate),
    duration: Number(parsed.format?.duration) || 0,
    size: Number(parsed.format?.size) || (await fs.promises.stat(file)).size,
    bitDepth: /p1[0-6]|10(le|be)/.test(video.pix_fmt ?? '') ? 10 : 8,
    hasAudio: !!parsed.streams?.some((s) => s.codec_type === 'audio')
  }
}

/** Steam validates its workshop folders and puts the files back, anything inside one is off limits */
export function isSteamManagedPath(dir: string): boolean {
  const resolved = path.resolve(dir)
  const parts = resolved.split(path.sep)
  if (parts.some((part, i) => part.toLowerCase() === 'steamapps' && parts[i + 1]?.toLowerCase() === 'workshop'))
    return true
  const workshop = getConfiguredWorkshopPath()
  if (!workshop) return false
  const rel = path.relative(path.resolve(workshop), resolved)
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

function requireVideo(id: string): {
  wallpaper: WallpaperMeta
  dir: string
  file: string
} {
  const wallpaper = getWallpaper(id)
  if (!wallpaper) throw new OptimizeError('skip', t('optimize.errNotVideo'))
  if (wallpaper.type !== 'video' || !wallpaper.localPath || !wallpaper.file || wallpaper.downloading) {
    throw new OptimizeError('skip', t('optimize.errNotVideo'))
  }
  if (wallpaper.source === 'workshop' || isSteamManagedPath(wallpaper.localPath))
    throw new OptimizeError('skip', t('optimize.errSteam'))
  const dir = path.resolve(wallpaper.localPath)
  const file = path.resolve(dir, wallpaper.file)
  if (!file.startsWith(dir + path.sep)) throw new OptimizeError('skip', t('optimize.errNotVideo'))
  return { wallpaper, dir, file }
}

function screenSizes(): ScreenSize[] {
  const seen = new Set<string>()
  const sizes: ScreenSize[] = []
  for (const display of screen.getAllDisplays()) {
    const width = Math.round(display.size.width * display.scaleFactor)
    const height = Math.round(display.size.height * display.scaleFactor)
    if (seen.has(`${width}x${height}`)) continue
    seen.add(`${width}x${height}`)
    sizes.push({ name: display.label || String(display.id), width, height })
  }
  return sizes
}

export async function probeWallpaper(id: string): Promise<VideoProbe> {
  const { file, wallpaper } = requireVideo(id)
  const info = await probeFile(file)
  const playable = ['.mp4', '.webm'].includes(path.extname(file).toLowerCase())
  const previewUrl = playable ? `wallpaper://${file.split(path.sep).map(encodeURIComponent).join('/')}` : null
  return { info, screens: screenSizes(), trim: trimAsCuts(wallpaper, info.duration), previewUrl }
}

/** The videos among `ids` that have a trim an optimize can cut out (Steam's own are never offered) */
export async function quickTrims(ids: string[]): Promise<QuickTrim[]> {
  const found: QuickTrim[] = []
  for (const id of ids) {
    try {
      const { file, wallpaper } = requireVideo(id)
      if (videoSegmentsOf(wallpaper).length === 0) continue
      const cut = trimAsCut(wallpaper, (await probeFile(file)).duration)
      if (cut) found.push({ id, title: wallpaper.title, ...cut })
    } catch {}
  }
  return found
}

interface Job {
  id: string
  child?: ChildProcess
  helpers: Set<ChildProcess>
  temp?: string
  cancelled: boolean
}

interface Staged {
  id: string
  root: string
  temp: string
  original: string
  final: string
  info: VideoInfo
  cutApplied: boolean
}

let job: Job | null = null
let staged: Staged | null = null
let finishing = false

function freeFinalName(file: string, ext: string): string {
  const parsed = path.parse(file)
  const plain = path.join(parsed.dir, parsed.name + ext)
  // the same name as the video is the video itself, anything else already there is somebody else's file
  if (plain.toLowerCase() === file.toLowerCase() || !fs.existsSync(plain)) return plain
  for (let n = 2; ; n++) {
    const candidate = path.join(parsed.dir, `${parsed.name} (${n})${ext}`)
    if (!fs.existsSync(candidate)) return candidate
  }
}

const LEFTOVER_TEMP = /^\..+\.optimizing\.[^.]+$/

/** temp files of an encode that never got to clean up (crash, kill, power loss) */
function isBeingOptimized(root: string): boolean {
  const inside = (file: string): boolean => path.resolve(file).startsWith(root + path.sep)
  return (!!job?.temp && inside(job.temp)) || (!!staged && path.resolve(staged.root) === root)
}

export async function sweepOptimizeLeftovers(): Promise<void> {
  for (const w of getAllWallpapers()) {
    if (w.source === 'workshop' || w.type !== 'video' || !w.localPath || !w.file) continue
    const dir = path.dirname(path.resolve(w.localPath, w.file))
    const names = await fs.promises.readdir(dir).catch(() => [] as string[])
    for (const name of names.filter((n) => LEFTOVER_TEMP.test(n))) {
      if (isBeingOptimized(path.resolve(w.localPath))) break
      await fs.promises.rm(path.join(dir, name), { force: true }).catch(() => undefined)
    }
  }
}

function tempNameFor(file: string, ext: string): string {
  const parsed = path.parse(file)
  return path.join(parsed.dir, `.${parsed.name}.optimizing${ext}`)
}

export function validateOptions(info: VideoInfo, options: OptimizeOptions): void {
  const { scale, cut, fps } = options
  if (scale && !scaleFilter(info, scale, scale.mode)) throw new OptimizeError('skip', t('optimize.errScale'))
  if (fps !== undefined && !fpsFilter(info, fps)) throw new OptimizeError('skip', t('optimize.errFps'))
  if (cut) {
    const problem = cutRangesProblem(cutRanges(cut), info.duration)
    if (problem === 'range') throw new Error(t('optimize.errCut'))
    if (problem === 'order') throw new Error(t('optimize.errCutOrder'))
    if (cut.more?.length && cut.copy) throw new Error(t('optimize.errCut'))
  }
  if (!scale && !cut && !fps && !options.force && isHevc(info.codec)) throw new OptimizeError('skip', t('optimize.errNothing'))
}

/**
 * The start-up test only uses a small test picture, but some hardware encoders go wrong only at the video's own size.
 * A couple of seconds of the real video are encoded and compared with the source before the whole job commits to an encoder.
 */
async function trialPasses(
  current: Job,
  candidate: EncoderOption,
  file: string,
  info: VideoInfo,
  options: OptimizeOptions,
  failures: string[]
): Promise<EncoderOption | null> {
  const start = options.cut?.start ?? 0
  const length = Math.min(2, Math.max(0.5, info.duration - start))
  const trial = path.join(await scratchDir(), `trial-${process.pid}.mkv`)
  const scaled = options.scale ? scaleFilter(info, options.scale, options.scale.mode) : null
  const devices: (string | undefined)[] =
    candidate.encoder === 'hevc_vaapi'
      ? [candidate.device, ...renderDevices().filter((d) => d !== candidate.device)]
      : [undefined]
  for (const device of devices) {
    // the GPU decoder first, software decoding when that fails or draws a wrong picture
    for (const hwDecode of [true, false]) {
      if (current.cancelled) break
      const label = `${device ?? candidate.encoder}${hwDecode ? ' + hw decode' : ''}`
      try {
        const args = buildFfmpegArgs({
          source: file,
          dest: trial,
          info,
          options: { ...options, cut: { start, end: start + length } },
          encoder: candidate.encoder,
          vaapiDevice: device,
          hwDecode
        })
        await run(candidate.source, 'ffmpeg', args, 120_000, current)
        const at = Math.min(0.3, length / 2)
        const [want, got] = await Promise.all([
          frameColor(candidate.source, ['-i', file], start + at, scaled ? [scaled] : [], current),
          frameColor(candidate.source, ['-i', trial], at, [], current)
        ])
        if (want && got && colorsMatch(want, got)) return { ...candidate, device, hwDecode }
        const why = `trial failed at ${info.width}x${info.height}, ${describeColors(want, got)}`
        failures.push(`${label}: ${why}`)
        console.warn(`[VideoTools] ${candidate.encoder}${device ? ` on ${device}` : ''}${hwDecode ? ' with hw decode' : ''} ${why}`)
      } catch (err) {
        const why = (err as Error).message.split('\n')[0]
        failures.push(`${label}: ${why}`)
        console.warn(`[VideoTools] ${label} failed on a trial: ${why}`)
      } finally {
        await fs.promises.rm(trial, { force: true })
      }
    }
  }
  return null
}

class OptimizeError extends Error {
  constructor(readonly kind: 'busy' | 'cancelled' | 'skip', message: string) {
    super(message)
  }
}

class WrongPictureError extends Error {
  kept?: string

  constructor(
    readonly encoder: HevcEncoder,
    detail: string
  ) {
    super(`${t('optimize.errPicture', { encoder: ENCODER_LABELS[encoder] })} (${detail})`)
  }
}

function describeColors(want: FrameColor | null, got: FrameColor | null): string {
  const show = (c: FrameColor | null): string => (c ? `${c.y.toFixed(0)}/${c.u.toFixed(0)}/${c.v.toFixed(0)}` : 'no frame')
  return `Y/U/V source ${show(want)}, result ${show(got)}`
}

/** On "auto" an encoder whose finished file turns out wrong is dropped and the job runs again with the next one */
export async function startOptimize(
  id: string,
  options: OptimizeOptions,
  win: BrowserWindow,
  exclude: HevcEncoder[] = []
): Promise<OptimizeResult> {
  try {
    const result = await runOptimize(id, options, win, exclude)
    return { ...result, skipped: [...new Set([...exclude, ...result.skipped])] }
  } catch (err) {
    if (err instanceof WrongPictureError && options.encoder === 'auto') {
      // the next encoder's result is what counts, the rejected file would only sit in the folder
      if (err.kept) await fs.promises.rm(err.kept, { force: true }).catch(() => undefined)
      return startOptimize(id, options, win, [...exclude, err.encoder])
    }
    throw err
  }
}

async function runOptimize(
  id: string,
  options: OptimizeOptions,
  win: BrowserWindow,
  exclude: HevcEncoder[]
): Promise<OptimizeResult> {
  if (job || staged || downloading) throw new OptimizeError('busy', t('optimize.errBusy'))
  const current: Job = { id, helpers: new Set(), cancelled: quickRunning && quickCancelled }
  job = current
  try {
    return await runOptimizeJob(current, id, options, win, exclude)
  } finally {
    job = null
  }
}

async function runOptimizeJob(
  current: Job,
  id: string,
  options: OptimizeOptions,
  win: BrowserWindow,
  exclude: HevcEncoder[]
): Promise<OptimizeResult> {
  const stopIfCancelled = (): void => {
    if (current.cancelled) throw new OptimizeError('cancelled', t('optimize.errCancelled'))
  }
  const { dir, file } = requireVideo(id)
  if (getWallpapersInUse().has(id)) throw new OptimizeError('skip', t('optimize.errInUse'))
  const info = await probeFile(file, current)
  stopIfCancelled()
  validateOptions(info, options)

  const copyOnly = !!options.cut?.copy && !options.scale && !options.fps
  let chosen: EncoderOption | undefined
  const skipped: HevcEncoder[] = []
  const trialFailures: string[] = []
  if (!copyOnly) {
    const available = (await getVideoToolsStatus()).encoders
    const candidates =
      options.encoder === 'auto'
        ? ENCODER_RANKING.filter((e) => !exclude.includes(e)).flatMap((e) => available.filter((o) => o.encoder === e).slice(0, 1))
        : [pickEncoder(options.encoder, available)].filter((o): o is EncoderOption => !!o)
    if (candidates.length === 0) throw new OptimizeError('skip', t('optimize.errNoEncoder'))
    for (const candidate of candidates) {
      const passed = await trialPasses(current, candidate, file, info, options, trialFailures)
      stopIfCancelled()
      if (passed) {
        chosen = passed
        break
      }
      skipped.push(candidate.encoder)
    }
    if (!chosen) {
      const label = t('optimize.errPicture', { encoder: ENCODER_LABELS[candidates[candidates.length - 1].encoder] })
      throw new Error(trialFailures.length ? `${label} (${trialFailures.join('; ')})` : label)
    }
  }

  stopIfCancelled()
  const stats = await fs.promises.statfs(dir)
  // the copy of the original lives next to the video as well
  const room = getVideoToolSettings().backupOriginal ? 2.2 : 1.2
  if (stats.bavail * stats.bsize < info.size * room) throw new Error(t('optimize.errSpace'))

  const sourceExt = path.extname(file)
  const ext = chosen ? outputExtension(sourceExt) : sourceExt
  const temp = tempNameFor(file, ext)
  current.temp = temp
  await fs.promises.rm(temp, { force: true })

  const args = buildFfmpegArgs({
    source: file,
    dest: temp,
    info,
    options,
    encoder: chosen?.encoder,
    vaapiDevice: chosen?.device,
    hwDecode: chosen?.hwDecode
  })
  const [bin, binArgs] = command(
    chosen?.source ?? (hasSource('system') ? 'system' : 'downloaded'),
    'ffmpeg',
    args,
    true
  )
  const total = outputDuration(info, options.cut)

  const send = (progress: Omit<OptimizeProgress, 'itemId'>) => {
    if (!win.isDestroyed())
      win.webContents.send(IpcChannels.EVENT_VIDEO_TOOLS_PROGRESS, {
        itemId: id,
        ...progress
      })
  }

  try {
    await new Promise<void>((resolve, reject) => {
      if (current.cancelled) {
        reject(new OptimizeError('cancelled', t('optimize.errCancelled')))
        return
      }
      const child = spawn(bin, binArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
      current.child = child
      let errorTail = ''
      let lastSent = 0
      child.stdout.on('data', (chunk: Buffer) => {
        const seconds = parseProgressSeconds(chunk.toString())
        if (seconds === undefined || total <= 0 || Date.now() - lastSent < 400) return
        lastSent = Date.now()
        send({
          stage: 'encoding',
          percentage: Math.min(99, Math.round((seconds / total) * 100))
        })
      })
      child.stderr.on('data', (chunk: Buffer) => {
        errorTail = (errorTail + chunk.toString()).slice(-1500)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (current.cancelled) reject(new OptimizeError('cancelled', t('optimize.errCancelled')))
        else if (code === 0) resolve()
        else
          reject(
            new Error(
              t('optimize.errFailed', {
                detail: errorTail.trim().split('\n').slice(-3).join(' ')
              })
            )
          )
      })
    })
    const newSize = (await fs.promises.stat(temp)).size
    if (newSize === 0) throw new Error(t('optimize.errFailed', { detail: t('optimize.detailEmpty') }))
    if (chosen) {
      const scaled = options.scale ? scaleFilter(info, options.scale, options.scale.mode) : null
      // a hardware encoder can go wrong part way through, so three places of the finished file are compared
      for (const fraction of [0.15, 0.5, 0.85]) {
        const at = total * fraction
        const sourceAt = sourceTimeAt(options.cut, at, info.duration)
        const [want, got] = await Promise.all([
          frameColor(chosen.source, ['-i', file], sourceAt, scaled ? [scaled] : [], current).catch((err: Error) => {
            console.warn(`[VideoTools] source frame at ${sourceAt.toFixed(1)} s is unreadable: ${err.message.slice(0, 200)}`)
            return null
          }),
          frameColor(chosen.source, ['-i', temp], at, [], current)
        ])
        stopIfCancelled()
        // no source frame there (the container is longer than its video, or the source is damaged): nothing to compare against
        if (!want) continue
        if (!got || !colorsMatch(want, got)) {
          const detail = `at ${at.toFixed(1)} s, ${describeColors(want, got)}`
          console.warn(`[VideoTools] ${chosen.encoder} picture check failed ${detail}`)
          const key = badKey(chosen.source, chosen.encoder)
          const failures = (pictureFailures.get(key) ?? 0) + 1
          pictureFailures.set(key, failures)
          if (failures >= PICTURE_FAILURES_TO_BAN) badEncoders.add(key)
          throw new WrongPictureError(chosen.encoder, detail)
        }
      }
    }
    stopIfCancelled()
    if (chosen) pictureFailures.delete(badKey(chosen.source, chosen.encoder))
    await fsyncPath(temp)
    // closing the dialog during the flush cancels the job, and nobody is left to decide about a staged result
    stopIfCancelled()
    staged = {
      id,
      root: dir,
      temp,
      original: file,
      final: freeFinalName(file, ext),
      info,
      cutApplied: !!options.cut
    }
    send({ stage: 'done', percentage: 100 })
    return { originalSize: info.size, newSize, encoder: chosen?.encoder, skipped }
  } catch (err) {
    if (err instanceof WrongPictureError) {
      // kept next to the video so the file can be looked at, the picture check may be wrong as well
      const parsed = path.parse(file)
      const kept = path.join(parsed.dir, `${parsed.name} (${err.encoder} rejected)${path.extname(temp)}`)
      try {
        await fs.promises.rm(kept, { force: true })
        await fs.promises.rename(temp, kept)
        err.kept = kept
        err.message += ` ${t('optimize.keptRejected', { path: kept })}`
        console.warn(`[VideoTools] kept the rejected file as ${kept}`)
      } catch {
        await fs.promises.rm(temp, { force: true })
      }
    } else {
      await fs.promises.rm(temp, { force: true })
    }
    send({ stage: 'error', percentage: 0, message: (err as Error).message })
    throw err
  }
}

export function cancelOptimize(): void {
  if (quickRunning) quickCancelled = true
  if (!job) return
  job.cancelled = true
  job.child?.kill('SIGTERM')
  for (const helper of job.helpers) helper.kill('SIGTERM')
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.tmp`
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2))
    await fsyncPath(tmp)
    await fs.promises.rename(tmp, file)
    await syncDir(path.dirname(file)).catch(() => undefined)
  } catch (err) {
    await fs.promises.rm(tmp, { force: true })
    throw err
  }
}

/** "name (original).mp4" next to the video, flushed to disk so a crash right after the swap cannot leave a broken copy */
async function copyOriginal(file: string): Promise<string> {
  const parsed = path.parse(file)
  let target = path.join(parsed.dir, `${parsed.name} (original)${parsed.ext}`)
  for (let n = 2; fs.existsSync(target); n++) {
    target = path.join(parsed.dir, `${parsed.name} (original ${n})${parsed.ext}`)
  }
  try {
    await fs.promises.copyFile(file, target, fs.constants.COPYFILE_EXCL)
    await fsyncPath(target)
    const [want, got] = await Promise.all([fs.promises.stat(file), fs.promises.stat(target)])
    if (want.size !== got.size) throw new Error(t('optimize.detailCopySize'))
    // a directory can't be flushed on every filesystem, the file itself already is
    await syncDir(parsed.dir).catch(() => undefined)
  } catch (err) {
    await fs.promises.rm(target, { force: true })
    throw new Error(t('optimize.errBackup', { detail: (err as Error).message }), { cause: err })
  }
  return target
}

export async function finishOptimize(id: string, keep: boolean): Promise<void> {
  if (finishing) {
    if (!keep) return
    throw new OptimizeError('busy', t('optimize.errBusy'))
  }
  finishing = true
  try {
    await finishStaged(id, keep)
  } finally {
    finishing = false
  }
}

async function finishStaged(id: string, keep: boolean): Promise<void> {
  const pending = staged
  if (!pending || pending.id !== id) {
    // discarding what is already gone is fine, the dialog does it again when it closes
    if (!keep) return
    throw new Error(t('optimize.errNoResult'))
  }
  if (!keep) {
    staged = null
    await fs.promises.rm(pending.temp, { force: true })
    return
  }
  if (getWallpapersInUse().has(id)) throw new OptimizeError('skip', t('optimize.errInUse'))
  const projectFile = path.join(pending.root, 'project.json')
  const renamed = pending.final !== pending.original
  const project = renamed ? (JSON.parse(await fs.promises.readFile(projectFile, 'utf8')) as Record<string, unknown>) : null
  // nothing is replaced until the copy is on disk, a failure here leaves the result staged and the video untouched
  const originalCopy = getVideoToolSettings().backupOriginal ? await copyOriginal(pending.original) : null

  const sameName = pending.final.toLowerCase() === pending.original.toLowerCase()
  let movedToFinal = false
  try {
    if (project) {
      await fs.promises.rename(pending.temp, pending.final)
      movedToFinal = true
      await writeJsonAtomic(projectFile, {
        ...project,
        file: path.relative(pending.root, pending.final).split(path.sep).join('/')
      })
      if (!sameName) {
        await fs.promises.rm(pending.original, { force: true }).catch((err: unknown) => {
          console.warn(`[VideoTools] Could not remove ${pending.original}:`, err)
        })
      }
    } else {
      await fs.promises.rename(pending.temp, pending.original)
    }
  } catch (err) {
    // the video is still the old one, so the encode stays staged and the copy made for it goes
    if (movedToFinal && !sameName) await fs.promises.rename(pending.final, pending.temp).catch(() => undefined)
    const replacedOriginal = movedToFinal && sameName
    if (originalCopy && !replacedOriginal) await fs.promises.rm(originalCopy, { force: true }).catch(() => undefined)
    if (!fs.existsSync(pending.temp)) staged = null
    throw err
  }
  staged = null

  forgetVideoProbe(pending.original)
  forgetVideoProbe(pending.final)
  const patch: Partial<WallpaperMeta> = {
    file: path.relative(pending.root, pending.final).split(path.sep).join('/'),
    fileSize: await getDirSizeAsync(pending.root, true)
  }
  if (pending.cutApplied) {
    patch.videoSegments = undefined
    patch.videoStart = undefined
    patch.videoEnd = undefined
  }
  updateWallpaper(id, patch)
}

let quickRunning = false
let quickCancelled = false

/**
 * "Quick optimize": every given video gets the default render settings when that makes sense, one after the other,
 * and the result replaces the video (with the copy of the original when that is on). Videos it leaves alone are
 * listed with the reason. The size never grows: a video that is not larger than the target keeps its size.
 */
export async function quickOptimize(ids: string[], win: BrowserWindow, trimAnswer = false): Promise<QuickReport> {
  if (quickRunning) throw new OptimizeError('busy', t('optimize.errBusy'))
  quickRunning = true
  quickCancelled = false
  const report: QuickReport = { lines: [], optimized: 0, savedBytes: 0, originalsKept: false }
  let settings = getVideoToolSettings()
  const trim = settings.trimMode === 'auto' || (settings.trimMode === 'ask' && trimAnswer)
  try {
    const { encoders } = await getVideoToolsStatus()
    if (settings.encoder !== 'auto' && !encoders.some((o) => o.encoder === settings.encoder)) {
      settings = { ...settings, encoder: 'auto' }
    }
    for (const [index, id] of ids.entries()) {
      if (quickCancelled) break
      const title = getWallpaper(id)?.title ?? id
      const line = (kind: QuickLine['kind'], text: string): void => {
        report.lines.push({ id, title, kind, text })
      }
      const skip = (reason: string): void => {
        line('skipped', t('quick.skipped', { title, id, reason }))
      }
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.EVENT_VIDEO_TOOLS_QUICK, { done: index, total: ids.length, id, title })
      }
      if (job || staged || downloading) {
        skip(t('quick.reasonBusy'))
        continue
      }
      try {
        const { file, wallpaper } = requireVideo(id)
        if (getWallpapersInUse().has(id)) {
          skip(t('optimize.errInUse'))
          continue
        }
        const info = await probeFile(file)
        const plan = planQuickOptimize(info, settings, trim ? trimAsCut(wallpaper, info.duration) : null)
        if ('skip' in plan) {
          skip(plan.skip === 'hevc' ? t('quick.reasonHevc') : t('quick.reasonHevcSize', { size: plan.size }))
          continue
        }
        const result = await startOptimize(id, plan.options, win)
        if (result.newSize >= result.originalSize) {
          await finishOptimize(id, false)
          skip(t('quick.reasonBigger'))
          continue
        }
        await finishOptimize(id, true)
        report.optimized++
        report.savedBytes += result.originalSize - result.newSize
        if (getVideoToolSettings().backupOriginal) report.originalsKept = true
      } catch (err) {
        const message = (err as Error).message
        if (hasStagedResult() === id) await finishOptimize(id, false).catch(() => undefined)
        const kind = err instanceof OptimizeError ? err.kind : null
        if (quickCancelled && kind === 'cancelled') break
        if (kind === 'busy') skip(t('quick.reasonBusy'))
        else if (kind === 'skip') skip(message)
        else line('failed', t('quick.failed', { title, id, error: message }))
      }
    }
  } finally {
    quickRunning = false
  }
  return report
}

export function abandonOptimize(): void {
  cancelOptimize()
  if (!staged || finishing) return
  fs.rmSync(staged.temp, { force: true })
  staged = null
}

export function discardStagedOnExit(): void {
  if (job) {
    job.cancelled = true
    job.child?.kill('SIGKILL')
    for (const helper of job.helpers) helper.kill('SIGKILL')
    if (job.temp) {
      try {
        fs.rmSync(job.temp, { force: true })
      } catch {}
    }
  }
  if (!staged) return
  try {
    fs.rmSync(staged.temp, { force: true })
  } catch {}
  staged = null
}

export function hasStagedResult(): string | null {
  return staged?.id ?? null
}
