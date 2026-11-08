import { hostCommand, isFlatpak } from './flatpak'
import { parentPid, parentSnapshot } from './processes'
import { execFileAsync } from './exec'

interface SinkInput {
  corked?: boolean
  mute?: boolean
  properties?: Record<string, string>
}

/** The streams that are playing right now, with the process each belongs to (0 when the server does not say) */
export function playingStreams(json: string): { pid: number; binary: string }[] {
  let inputs: unknown
  try {
    inputs = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(inputs)) return []

  return (inputs as SinkInput[])
    .filter((input) => input.corked === false && input.mute !== true)
    .map((input) => ({
      pid: Number(input.properties?.['application.process.id']) || 0,
      binary: input.properties?.['application.process.binary'] ?? input.properties?.['application.name'] ?? ''
    }))
}

async function descendsFrom(pid: number, owners: ReadonlySet<number>, snapshot: Map<number, number> | null): Promise<boolean> {
  let current = pid
  for (let depth = 0; depth < 12 && current > 1; depth++) {
    if (owners.has(current)) return true
    current = snapshot ? (snapshot.get(current) ?? 0) : await parentPid(current)
  }
  return false
}

let warned = false

const SINK_INPUT_ARGS = ['--format=json', 'list', 'sink-inputs']

function pactl(): [string, string[]] {
  return hostCommand('pactl', SINK_INPUT_ARGS)
}

export async function isAudioDetectionAvailable(): Promise<boolean> {
  try {
    await execFileAsync(...pactl(), { timeout: 3000, maxBuffer: 4 * 1024 * 1024 })
    return true
  } catch {
    return false
  }
}

/**
 * Whether anything but the wallpaper engines (and this app) is playing sound. `owners` are the pids whose sound does not
 * count, their children are skipped too (the web wallpaper host, Chromium's audio process).
 */
export async function isAudioPlaying(owners: ReadonlySet<number>): Promise<boolean> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync(...pactl(), {
      timeout: 3000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8'
    }))
  } catch (err) {
    if (!warned) {
      warned = true
      console.warn('[AppRules] cannot ask the sound server for playing streams (pactl):', (err as Error).message)
    }
    return false
  }

  const snapshot = isFlatpak() ? await parentSnapshot() : null
  for (const stream of playingStreams(stdout)) {
    if (/wallpaperengine/i.test(stream.binary)) continue
    if (stream.pid > 0 && (await descendsFrom(stream.pid, owners, snapshot))) continue
    return true
  }
  return false
}
