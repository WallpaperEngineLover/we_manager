import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { isCommandAvailable } from './platform'

const execFileAsync = promisify(execFile)

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.avi', '.mkv', '.mov', '.m4v']

/** Locate a wallpaper's video file: the project.json `file` entry, or the first video in the folder. */
export function findWallpaperVideoFile(localPath: string, projectFile?: string): string | undefined {
  if (projectFile) {
    const direct = path.join(localPath, projectFile)
    if (fs.existsSync(direct)) return direct
  }
  try {
    const files = fs.readdirSync(localPath)
    const video = files.find((f) => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    if (video) return path.join(localPath, video)
  } catch { /* unreadable dir */ }
  return undefined
}

function parseFrameRate(raw?: string): number | undefined {
  if (!raw) return undefined
  const [num, den] = raw.split('/').map(Number)
  if (!num || !den) return undefined
  const fps = num / den
  if (!isFinite(fps) || fps <= 0) return undefined
  return Math.round(fps)
}

// Probing spawns ffprobe, so cache per file for the lifetime of the process (playlists
// reapply the same wallpapers repeatedly).
const fpsCache = new Map<string, number | undefined>()

/** Read a video's native frame rate via ffprobe. Returns undefined if ffprobe is missing or fails. */
export async function getVideoFps(filePath: string): Promise<number | undefined> {
  if (fpsCache.has(filePath)) return fpsCache.get(filePath)
  if (!isCommandAvailable('ffprobe')) return undefined

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=r_frame_rate,avg_frame_rate',
      '-of', 'csv=p=0',
      filePath
    ], { timeout: 10_000, encoding: 'utf8' })

    const [rRate, avgRate] = stdout.trim().split('\n')[0]?.split(',') ?? []
    const fps = parseFrameRate(rRate) ?? parseFrameRate(avgRate)
    fpsCache.set(filePath, fps)
    return fps
  } catch {
    fpsCache.set(filePath, undefined)
    return undefined
  }
}
