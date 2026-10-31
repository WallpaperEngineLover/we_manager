import { execFile, execFileSync, spawn, type ChildProcess } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { promisify } from 'util'
import { hostCommand, isHostCommandAvailable } from '../utils/flatpak'

const execFileAsync = promisify(execFile)

export interface CommandResult {
  ok: boolean
  output: string
}

export type CommandRunner = (cmd: string, args: string[]) => Promise<CommandResult>
export type DaemonStarter = (cmd: string, args: string[]) => ChildProcess | void

/** never throws */
const runHostCommand: CommandRunner = async (cmd, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(...hostCommand(cmd, args), { timeout: 10000 })
    return { ok: true, output: `${stdout}${stderr}`.trim() }
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; message: string }
    return { ok: false, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}`.trim() || failed.message }
  }
}

const startHostDaemon: DaemonStarter = (cmd, args) => {
  const [file, fileArgs] = hostCommand(cmd, args)
  const child = spawn(file, fileArgs, { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
  return child
}

/** swww was renamed to awww, distributions ship either */
export function swwwCommand(has: (cmd: string) => boolean = isHostCommandAvailable): 'awww' | 'swww' | undefined {
  if (has('awww')) return 'awww'
  if (has('swww')) return 'swww'
  return undefined
}

export async function applySwww(
  imagePath: string,
  command = swwwCommand(),
  run: CommandRunner = runHostCommand,
  start: DaemonStarter = startHostDaemon
): Promise<void> {
  if (!command) throw new Error('Neither awww nor swww is installed')

  // img only talks to the daemon, nothing draws without it
  if (!(await run(command, ['query'])).ok) {
    start(`${command}-daemon`, [])
    for (let i = 0; i < 25 && !(await run(command, ['query'])).ok; i++) await sleep(200)
  }

  const result = await run(command, ['img', imagePath, '--transition-type', 'fade'])
  if (!result.ok) throw new Error(`${command} img failed: ${result.output}`)
}

const HYPRPAPER_NOT_RUNNING = /is it running|failed to connect|couldn't connect|connection refused/i
// hyprctl's hyprwire handshake with a hyprpaper that is still starting
const HYPRPAPER_STARTING = /wire error|doesn't have the spec/i

// 0.8 answers nothing on success, older ones "ok"
const hyprpaperAccepted = (result: CommandResult) => result.ok && (result.output === '' || result.output === 'ok')

/** 0.8: "monitor,path,fit" in one request; 0.7: preload, no fit. Empty monitor = all */
export async function applyHyprpaper(
  imagePath: string,
  run: CommandRunner = runHostCommand,
  start: DaemonStarter = startHostDaemon
): Promise<void> {
  const current = () => run('hyprctl', ['hyprpaper', 'wallpaper', `,${imagePath},cover`])

  let result = await current()
  if (HYPRPAPER_NOT_RUNNING.test(result.output)) {
    start('hyprpaper', [])
    for (let i = 0; i < 25 && (HYPRPAPER_NOT_RUNNING.test(result.output) || HYPRPAPER_STARTING.test(result.output)); i++) {
      await sleep(200)
      result = await current()
    }
  }
  if (hyprpaperAccepted(result)) return
  if (HYPRPAPER_NOT_RUNNING.test(result.output)) throw new Error(`hyprpaper did not start: ${result.output}`)

  const preload = await run('hyprctl', ['hyprpaper', 'preload', imagePath])
  const legacy = await run('hyprctl', ['hyprpaper', 'wallpaper', `,${imagePath}`])
  if (!hyprpaperAccepted(legacy)) {
    throw new Error(`hyprpaper refused the wallpaper: ${legacy.output || preload.output || result.output}`)
  }
  await run('hyprctl', ['hyprpaper', 'unload', 'unused'])
}

let swaybgProcess: ChildProcess | undefined

/** swaybg draws while it runs: start the new one, then stop the old */
export async function applySwaybg(imagePath: string, start: DaemonStarter = startHostDaemon): Promise<void> {
  const child = start('swaybg', ['-i', imagePath, '-m', 'fill'])
  if (!child) return

  const exitCode = await new Promise<number | null | undefined>((resolve) => {
    const timer = setTimeout(() => { resolve(undefined) }, 700)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    child.once('error', () => {
      clearTimeout(timer)
      resolve(-1)
    })
  })
  if (exitCode !== undefined) throw new Error(`swaybg exited right away (code ${exitCode})`)

  const previous = swaybgProcess
  swaybgProcess = child
  if (previous?.pid && previous.exitCode === null) {
    // own process group, so a wrapper script's swaybg is reached too
    try {
      process.kill(-previous.pid, 'SIGTERM')
    } catch {
      previous.kill('SIGTERM')
    }
  }
}

export function hasHyprpaper(has: (cmd: string) => boolean = isHostCommandAvailable): boolean {
  return has('hyprpaper') && has('hyprctl')
}

function isHostProcessRunning(name: string): boolean {
  try {
    execFileSync(...hostCommand('pgrep', ['-x', name]), { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/** a running awww/swww daemon wins over hyprpaper, they would fight */

export function prefersHyprpaper(
  has: (cmd: string) => boolean = isHostCommandAvailable,
  running: (name: string) => boolean = isHostProcessRunning
): boolean {
  if (!hasHyprpaper(has)) return false
  if (running('hyprpaper')) return true
  return !(swwwCommand(has) && (running('awww-daemon') || running('swww-daemon')))
}
