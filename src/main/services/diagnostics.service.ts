import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'
import { getAllWallpapers, getWallpaper } from './library.service'
import { compatStatus } from '@shared/compat'
import { applyWallpaperMeta } from './wallpaper.service'
import {
  getEngineHistory,
  getLweStatus,
  getRunningInstances,
  onLweExit,
  setDiagnosticStats,
  type EngineHistory
} from './lwe.service'
import { stopDisplay } from './display.service'
import { getPlaybackStates, pausePlaylist, resumePlaylist } from './playlist-player.service'
import { detectDesktopEnv, detectDisplayServer, getConnectedScreens, runningAppImage } from '../utils/platform'
import { hostCommand, hostAppPath, isFlatpak } from '../utils/flatpak'

const execFileAsync = promisify(execFile)

const DEFAULT_SECONDS = 20
const SOFTWARE_RENDERER = /llvmpipe|softpipe|swrast/i
const ENV_PREFIXES = ['XDG_', 'WAYLAND', 'DISPLAY', 'LIBGL', '__EGL', '__GLX', 'MESA', 'GBM', 'LD_', 'FLATPAK_', 'QT_QPA', 'GDK_']
const PROJECT_JSON_LIMIT = 8192
const CRASHED_LIMIT = 8

export interface DiagnosticsTarget {
  wallpaperId: string
  screen: string
}

export class NoEngineRunningError extends Error {
  constructor() {
    super('No wallpaper is running')
  }
}

async function tryRun(cmd: string, args: string[], onHost = false, lines = 60): Promise<string> {
  const [file, fileArgs] = onHost ? hostCommand(cmd, args) : [cmd, args]
  try {
    const { stdout, stderr } = await execFileAsync(file, fileArgs, { timeout: 8000, maxBuffer: 1 << 20 })
    const text = (stdout || stderr).trim()
    return text ? text.split('\n').slice(0, lines).join('\n') : '(no output)'
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string }
    if (e.code === 'ENOENT') return '(not installed)'
    return `(failed: ${e.message.split('\n')[0]})`
  }
}

function readText(file: string, limit = 4096): string {
  try {
    return fs.readFileSync(file, 'utf8').slice(0, limit).trim()
  } catch {
    return '(unreadable)'
  }
}

function section(title: string, body: string): string {
  return `\n## ${title}\n\n${body.trim() || '(empty)'}\n`
}

function pathRedactor(): (text: string) => string {
  const home = os.homedir()
  const user = os.userInfo().username
  return (text) => {
    let out = text.split(home).join('~')
    if (user.length >= 3) out = out.replace(new RegExp(`\\b${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '<user>')
    return out
  }
}

function gpuLines(lspci: string): string {
  const found = lspci.split('\n').filter((line) => /vga|3d controller|display controller/i.test(line))
  return found.length ? found.join('\n') : lspci
}

function summarize(histories: EngineHistory[]): string[] {
  const notes: string[] = []
  const all = histories.flatMap((h) => h.lines)

  const renderer = all.find((line) => line.includes('OpenGL renderer:'))
  if (renderer) {
    notes.push(`Renderer: ${renderer.replace(/^.*OpenGL renderer:\s*/, '')}`)
    if (SOFTWARE_RENDERER.test(renderer)) {
      notes.push('PROBLEM: the engine renders on the CPU (software OpenGL), not on the GPU')
    }
  } else {
    notes.push('Renderer: not logged (older engine build)')
    if (all.some((line) => /failed to create dri2 screen|driver \(null\)/.test(line))) {
      notes.push('SUSPECT: Mesa could not open the GPU driver, rendering is probably done on the CPU')
    }
  }

  for (const h of histories) {
    const stats = h.lines.filter((line) => line.includes('FRAME-STATS'))
    if (stats.length) notes.push(`${h.screen}: ${stats[stats.length - 1].replace(/^.*FRAME-STATS\s*/, '')}`)
  }
  return notes
}

async function snapshotInstances(): Promise<string> {
  const pids = getRunningInstances().map((i) => i.pid).filter((pid) => pid > 0)
  const engines = pids.length
    ? await tryRun('ps', ['-o', 'pid,pcpu,pmem,rss,nlwp,etime,args', '-p', pids.join(',')])
    : '(none)'
  const busiest = await tryRun('ps', ['-eo', 'pcpu,pmem,comm', '--sort=-pcpu'], true, 9)
  return `Engine processes (as seen by WE Manager):\n${engines}\n\nBusiest processes on the machine:\n${busiest}`
}

async function restartPlaying(): Promise<string[]> {
  const notes: string[] = []
  const library = getAllWallpapers()
  for (const inst of getRunningInstances()) {
    const wallpaper = library.find((w) => w.localPath === inst.wallpaperPath)
    if (inst.split || !wallpaper) {
      notes.push(`${inst.screen}: not restarted (${inst.split ? 'split screen' : 'not in the library'})`)
      continue
    }
    await applyWallpaperMeta(wallpaper, { screen: inst.screen, forceFresh: true })
  }
  return notes
}

function systemInfo(): string {
  const cpus = os.cpus()
  const packaging = isFlatpak() ? 'Flatpak' : runningAppImage() ? 'AppImage' : app.isPackaged ? 'native package' : 'source'
  const env = Object.entries(process.env)
    .filter(([key]) => ENV_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
  const lines = [
    `WE Manager: ${app.getVersion()} (${packaging})`,
    `OS: ${readText('/etc/os-release').split('\n').find((l) => l.startsWith('PRETTY_NAME=')) ?? os.type()}`,
    `Kernel: ${os.release()}`,
    `Desktop: ${detectDesktopEnv()} on ${detectDisplayServer()}`,
    `Screens: ${getConnectedScreens().join(', ') || '(none found)'}`,
    `CPU: ${cpus[0]?.model ?? 'unknown'} x${cpus.length}`,
    `Memory: ${Math.round(os.totalmem() / 2 ** 20)} MiB total, ${Math.round(os.freemem() / 2 ** 20)} MiB free`
  ]
  const engine = getLweStatus()
  lines.push(`Engine: ${engine.installed ? `${engine.path}${engine.version ? ` (${engine.version})` : ''}` : 'not installed'}`)
  if (isFlatpak()) {
    lines.push(`Flatpak app path: ${hostAppPath() ?? 'unknown'}`)
  }
  return `${lines.join('\n')}\n\nEnvironment:\n${env.join('\n')}`
}

async function graphicsInfo(): Promise<string> {
  const [lspci, nvidia, eglinfo, glxinfo, vulkan] = await Promise.all([
    tryRun('lspci', ['-nn'], true, 200),
    tryRun('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'], true),
    tryRun('eglinfo', ['-B'], false, 80),
    tryRun('glxinfo', ['-B'], false, 40),
    tryRun('vulkaninfo', ['--summary'], false, 40)
  ])
  const parts = [
    `GPUs (host lspci):\n${gpuLines(lspci)}`,
    `NVIDIA driver (host):\n${nvidia}`,
    `eglinfo -B (as the engine sees it):\n${eglinfo}`,
    `glxinfo -B:\n${glxinfo}`,
    `vulkaninfo --summary:\n${vulkan}`
  ]
  if (isFlatpak()) {
    const runtimes = await tryRun('flatpak', ['list', '--runtime', '--columns=application,version,branch'], true, 400)
    const gl = runtimes.split('\n').filter((line) => /\.GL\b|\.GL\.|nvidia|Platform\s/i.test(line))
    parts.push(`Flatpak runtimes and GL extensions (host):\n${gl.join('\n') || runtimes}`)
    parts.push(`/.flatpak-info:\n${readText('/.flatpak-info', 2048)}`)
  }
  return parts.join('\n\n')
}

function wallpaperInfo(histories: EngineHistory[]): string {
  return histories
    .map((h) => {
      const project = readText(`${h.wallpaperPath}/project.json`, PROJECT_JSON_LIMIT)
      return `### ${h.screen}: ${h.wallpaperPath}\n\nproject.json:\n${project}`
    })
    .join('\n\n')
}

function crashedWallpapers(): string {
  const flagged = getAllWallpapers().filter((w) => w.compat && compatStatus(w.compat) !== 'ok')
  if (flagged.length === 0) return 'none'
  const shown = flagged
    .sort((a, b) => (b.compat?.lastCrash?.at ?? 0) - (a.compat?.lastCrash?.at ?? 0))
    .slice(0, CRASHED_LIMIT)
  const entries = shown.map((w) => {
    const crash = w.compat?.lastCrash
    const head = `### ${w.id} ${w.title} (${compatStatus(w.compat)}, ${w.type}, ${w.compat?.runtimeCrashes ?? 0} runtime crashes)`
    if (!crash) return head
    const when = new Date(crash.at).toISOString()
    return `${head}\n${crash.phase} crash on ${crash.screen} at ${when}\n${crash.log.join('\n')}`
  })
  const more = flagged.length > shown.length ? `\n\n(${flagged.length - shown.length} more flagged)` : ''
  return `${flagged.length} flagged of ${getAllWallpapers().length}\n\n${entries.join('\n\n')}${more}`
}

/**
 * Restarts what is playing with per-frame timings on, lets it run, then collects its output and
 * the machine's graphics setup into one text report. The wallpapers are restarted again afterwards.
 */
async function runTarget(target: DiagnosticsTarget, seconds: number, notes: string[]): Promise<{ histories: EngineHistory[]; snapshot: string }> {
  const wallpaper = getWallpaper(target.wallpaperId)
  if (!wallpaper) throw new Error(`Wallpaper ${target.wallpaperId} is not in the library`)

  const library = getAllWallpapers()
  const before = getRunningInstances().find((i) => i.screen === target.screen)
  const previous = before && !before.split ? library.find((w) => w.localPath === before.wallpaperPath) : undefined
  const pausedPlaylists = getPlaybackStates().filter(
    (s) => s.isPlaying && (s.screen === target.screen || s.screen === '*' || target.screen === '*')
  )
  for (const state of pausedPlaylists) pausePlaylist(state.screen)

  const exits: EngineHistory[] = []
  const exit = { at: 0 }
  const stopListening = onLweExit((info) => {
    if (info.screen !== target.screen) return
    exit.at = Date.now()
    notes.push(`${info.screen}: the engine exited (${info.phase}${info.crashed ? ', crashed' : ''}): ${info.description}`)
    exits.push({ screen: info.screen, wallpaperPath: info.wallpaperPath, pid: 0, startedAt: 0, lines: info.log })
  })

  let histories: EngineHistory[] = []
  let snapshot = '(engine not running)'
  setDiagnosticStats(true)
  try {
    notes.push(`Launched "${wallpaper.title}" (${wallpaper.id}) on ${target.screen} for this run`)
    try {
      await applyWallpaperMeta(wallpaper, { screen: target.screen, forceFresh: true, dependencyPrompt: 'once' })
    } catch (err) {
      notes.push(`launch failed: ${(err as Error).message}`)
    }
    const deadline = Date.now() + seconds * 1000
    while (Date.now() < deadline && !(exit.at && Date.now() - exit.at > 1500)) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    histories = getEngineHistory().filter((h) => h.screen === target.screen)
    if (histories.length > 0) snapshot = await snapshotInstances()
  } finally {
    setDiagnosticStats(false)
    stopListening()
    try {
      if (previous) await applyWallpaperMeta(previous, { screen: target.screen, forceFresh: true })
      else await stopDisplay(target.screen)
    } catch (err) {
      notes.push(`could not restore the previous wallpaper: ${(err as Error).message}`)
    }
    for (const state of pausedPlaylists) resumePlaylist(state.screen)
  }
  return { histories: histories.length > 0 ? histories : exits, snapshot }
}

export async function collectDiagnostics(seconds = DEFAULT_SECONDS, target?: DiagnosticsTarget): Promise<string> {
  if (!target && getRunningInstances().length === 0) throw new NoEngineRunningError()

  let histories: EngineHistory[]
  let snapshot: string
  const notes: string[] = []

  if (target) {
    ;({ histories, snapshot } = await runTarget(target, seconds, notes))
  } else {
    setDiagnosticStats(true)
    try {
      notes.push(...(await restartPlaying()))
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
      histories = getEngineHistory()
      snapshot = await snapshotInstances()
    } finally {
      setDiagnosticStats(false)
      notes.push(...(await restartPlaying().catch(() => ['could not restart the wallpapers after the run'])))
    }
  }

  const graphics = await graphicsInfo()
  const summary = summarize(histories)

  const report = [
    `# WE Manager diagnostics (${new Date().toISOString()}, ${seconds}s run)`,
    section('Summary', [...summary, ...notes].join('\n')),
    section('System', systemInfo()),
    section('Graphics', graphics),
    section('CPU use during the run', snapshot),
    section('Wallpapers', wallpaperInfo(histories)),
    section('Wallpapers marked as crashed', crashedWallpapers()),
    ...histories.map((h) =>
      section(`Engine output: ${h.screen}${h.pid > 0 ? ` (pid ${h.pid})` : ' (last lines before it exited)'}`, h.lines.join('\n') || '(nothing printed)')
    )
  ].join('')

  return pathRedactor()(report)
}
