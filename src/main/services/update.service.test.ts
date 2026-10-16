import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { LweStatus, UpdateChecks } from '@shared/types'

let checks: UpdateChecks | null = { app: true, engine: true }
let dismissed = {}
let lweStatus: LweStatus = { installed: false }
const releases: Record<string, unknown> = {}

vi.mock('electron', () => ({ app: { getVersion: () => '0.8.4', isPackaged: false } }))
vi.mock('./config.service', () => ({
  getUpdateChecks: () => checks,
  setUpdateChecks: (next: UpdateChecks) => { checks = next },
  getDismissedUpdates: () => dismissed,
  setDismissedUpdates: (next: object) => { dismissed = next }
}))
vi.mock('./lwe.service', () => ({ getLweStatus: () => lweStatus }))
vi.mock('../utils/flatpak', () => ({ isFlatpak: () => false }))
vi.mock('../utils/github', () => ({
  fetchLatestRelease: async (repo: string) => releases[repo] ?? null
}))

const { checkForUpdates, dismissUpdate } = await import('./update.service')

function release(tag: string, publishedAt = '2026-10-12T00:00:00Z') {
  return { tag_name: tag, html_url: `https://example.invalid/${tag}`, body: 'notes', published_at: publishedAt, assets: [] }
}

beforeEach(() => {
  checks = { app: true, engine: true }
  dismissed = {}
  lweStatus = { installed: false }
  releases['WallpaperEngineLover/we_manager'] = release('v0.8.4')
  releases['WallpaperEngineLover/linux-wallpaperengine-kde'] = release('v0.8.4')
})

describe('checkForUpdates', () => {
  it('reports a newer app release', async () => {
    releases['WallpaperEngineLover/we_manager'] = release('v0.9.0')
    const status = await checkForUpdates()
    expect(status.app?.version).toBe('v0.9.0')
    expect(status.app?.current).toBe('0.8.4')
    expect(status.appInstall).toBe('source')
  })

  it('stays quiet when the app is current or the check is off', async () => {
    expect((await checkForUpdates()).app).toBeNull()
    releases['WallpaperEngineLover/we_manager'] = release('v0.9.0')
    checks = { app: false, engine: true }
    expect((await checkForUpdates()).app).toBeNull()
  })

  it('compares a prebuilt engine by its release tag', async () => {
    lweStatus = { installed: true, path: '/nonexistent/linux-wallpaperengine', version: 'v0.8.0' }
    const status = await checkForUpdates()
    expect(status.engineInstall).toBe('prebuilt')
    expect(status.engine).toMatchObject({ version: 'v0.8.4', current: 'v0.8.0' })
  })

  it('dates a source build against the release', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-test-'))
    const binary = path.join(dir, 'linux-wallpaperengine')
    fs.writeFileSync(binary, '')
    lweStatus = { installed: true, path: binary }

    fs.utimesSync(binary, new Date('2026-10-01'), new Date('2026-10-01'))
    let status = await checkForUpdates()
    expect(status.engineInstall).toBe('build')
    expect(status.engine).toMatchObject({ version: 'v0.8.4', current: null })

    fs.utimesSync(binary, new Date('2026-10-13'), new Date('2026-10-13'))
    status = await checkForUpdates()
    expect(status.engine).toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('remembers a dismissed version', async () => {
    releases['WallpaperEngineLover/we_manager'] = release('v0.9.0')
    await checkForUpdates()
    expect(dismissUpdate('app', 'v0.9.0').dismissed).toEqual({ app: 'v0.9.0' })
  })
})

describe('getUpdateStatus', () => {
  it('knows how the engine is installed before the first check', async () => {
    vi.resetModules()
    const { getUpdateStatus } = await import('./update.service')
    lweStatus = { installed: true, path: '/nonexistent/linux-wallpaperengine', version: 'v0.8.0' }
    expect(getUpdateStatus().engineInstall).toBe('prebuilt')
  })
})
