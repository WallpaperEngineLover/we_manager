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
let failing = false
vi.mock('../utils/github', () => ({
  fetchLatestRelease: async (repo: string) => {
    if (failing) throw new Error('offline')
    return releases[repo] ?? null
  },
  fetchReleaseByTag: async () => null,
  fetchReleases: async (repo: string) => (releases[`${repo}#all`] as unknown[]) ?? [],
  isVersionTag: (tag: string) => /^v\d/.test(tag),
  download: async () => {},
  verifyAsset: async () => {}
}))

const { checkForUpdates, checkNow, dismissUpdate, installAppUpdate, listVersions } = await import('./update.service')

function withAsset(tag: string, publishedAt: string, name: string) {
  return { ...release(tag, publishedAt), assets: [{ name }] }
}

function release(tag: string, publishedAt = '2026-10-12T00:00:00Z') {
  return { tag_name: tag, html_url: `https://example.invalid/${tag}`, body: 'notes', published_at: publishedAt, assets: [] }
}

beforeEach(() => {
  failing = false
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

  it('remembers a version the user does not want to hear about again', async () => {
    releases['WallpaperEngineLover/we_manager'] = release('v0.9.0')
    await checkForUpdates()
    const status = dismissUpdate('app', 'v0.9.0', true)
    expect(status.dismissed).toEqual({ app: 'v0.9.0' })
    expect(status.snoozed).toEqual({})
  })

  it('looks at everything on a manual check even with automatic checks off', async () => {
    checks = { app: false, engine: false }
    releases['WallpaperEngineLover/we_manager'] = release('v0.9.0')
    expect((await checkForUpdates()).app).toBeNull()
    const status = await checkNow()
    expect(status.app).toMatchObject({ version: 'v0.9.0' })
    expect(status.checked).toEqual({ app: true, engine: true })
  })

  it('only snoozes a version closed with the X', async () => {
    releases['WallpaperEngineLover/we_manager'] = release('v0.9.0')
    await checkForUpdates()
    const status = dismissUpdate('app', 'v0.9.0', false)
    expect(status.dismissed).toEqual({})
    expect(status.snoozed).toEqual({ app: 'v0.9.0' })
  })
})

describe('getUpdateStatus', () => {
  it('knows how the engine is installed before the first check', async () => {
    vi.resetModules()
    const { getUpdateStatus } = await import('./update.service')
    lweStatus = { installed: true, path: '/nonexistent/linux-wallpaperengine', version: 'v0.8.0' }
    expect(getUpdateStatus().engineInstall).toBe('prebuilt')
  })

  it('does not call a failed check up to date', async () => {
    failing = true
    const status = await checkForUpdates(true)
    expect(status.error).toBe('offline offline')
    expect(status.checked).toEqual({ app: false, engine: false })
  })
})

describe('other versions', () => {
  it('lists the newest release first and only those with an asset for this install', async () => {
    releases['WallpaperEngineLover/we_manager#all'] = [
      withAsset('v0.7.0', '2026-01-01T00:00:00Z', 'WE-Manager-0.7.0.AppImage'),
      withAsset('v0.8.0', '2026-03-01T00:00:00Z', 'WE-Manager-0.8.0.AppImage'),
      withAsset('v0.7.5', '2026-02-01T00:00:00Z', 'notes.txt')
    ]
    const list = await listVersions('app')
    expect(list.map((r) => r.tag)).toEqual(['v0.8.0', 'v0.7.0'])
  })

  it('reports a tag that is not a version instead of ignoring it', async () => {
    const status = await installAppUpdate('libnode-arch')
    expect(status.appProgress).toMatchObject({ stage: 'error' })
  })
})
