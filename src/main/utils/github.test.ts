import * as crypto from 'crypto'
import * as fs from 'fs'
import * as http from 'http'
import type { AddressInfo } from 'net'
import * as os from 'os'
import * as path from 'path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  download,
  downloadVerified,
  fetchLatestRelease,
  fetchReleaseByTag,
  fetchReleases,
  isVersionTag,
  selectableReleases,
  verifyAsset,
  type GithubAsset,
  type GithubRelease
} from './github'

const body = Buffer.from('engine archive bytes '.repeat(500))
const sha256 = crypto.createHash('sha256').update(body).digest('hex')

let server: http.Server
let url: string
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-github-'))

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Length': body.length })
    res.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/engine.tar.gz`
})

afterAll(() => {
  server.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

const asset = (extra: Partial<GithubAsset> = {}): GithubAsset => ({
  name: 'engine.tar.gz',
  browser_download_url: url,
  size: body.length,
  digest: `sha256:${sha256}`,
  ...extra
})

describe('downloadVerified', () => {
  it('keeps a download that matches the release', async () => {
    const dest = path.join(tmp, 'good')
    await downloadVerified(asset(), dest, () => {})
    expect(fs.readFileSync(dest).equals(body)).toBe(true)
  })

  it('removes a download that does not match its checksum', async () => {
    const dest = path.join(tmp, 'tampered')
    await expect(downloadVerified(asset({ digest: `sha256:${'0'.repeat(64)}` }), dest, () => {})).rejects.toThrow(/checksum/)
    expect(fs.existsSync(dest)).toBe(false)
  })

  it('removes a download that is not the size the release says', async () => {
    const dest = path.join(tmp, 'short')
    await expect(downloadVerified(asset({ size: body.length + 1 }), dest, () => {})).rejects.toThrow(/bytes/)
    expect(fs.existsSync(dest)).toBe(false)
  })

  it('accepts an asset GitHub gave no digest for when the size is right', async () => {
    const dest = path.join(tmp, 'nodigest')
    await downloadVerified(asset({ digest: null }), dest, () => {})
    expect(fs.existsSync(dest)).toBe(true)
  })
})

const release = (tag_name: string, draft = false) =>
  ({ tag_name, draft, html_url: '', body: null, published_at: '', assets: [] }) as GithubRelease

describe('selectableReleases', () => {
  it('keeps v-tagged releases and drops helper releases and drafts', () => {
    const list = [release('v0.9.8'), release('libnode-arch'), release('libnode (Arch)'), release('v0.9.7-rc1'), release('v0.9.6', true), release('vim')]
    expect(selectableReleases(list).map(r => r.tag_name)).toEqual(['v0.9.8', 'v0.9.7-rc1'])
  })
})

describe('isVersionTag', () => {
  it('wants a v followed by a digit', () => {
    expect(isVersionTag('v0.9.8')).toBe(true)
    expect(isVersionTag('v1')).toBe(true)
    expect(isVersionTag('v')).toBe(false)
    expect(isVersionTag('vim')).toBe(false)
    expect(isVersionTag('0.9.8')).toBe(false)
    expect(isVersionTag('xv1')).toBe(false)
  })
})

describe('release lookups', () => {
  const answer = (status: number, json: unknown = {}, statusText = '') =>
    vi.fn<() => Promise<Response>>(() => Promise.resolve(new Response(JSON.stringify(json), { status, statusText })))

  afterEach(() => vi.unstubAllGlobals())

  it('asks GitHub for the latest release of the repo and sends the usual headers', async () => {
    const fetchMock = answer(200, release('v1.0'))
    vi.stubGlobal('fetch', fetchMock)
    expect((await fetchLatestRelease('owner/repo'))?.tag_name).toBe('v1.0')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/owner/repo/releases/latest')
    expect(init.headers).toEqual({ Accept: 'application/vnd.github+json', 'User-Agent': 'we-manager' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('answers null for a repo without releases and throws on other failures', async () => {
    vi.stubGlobal('fetch', answer(404))
    expect(await fetchLatestRelease('owner/repo')).toBeNull()
    vi.stubGlobal('fetch', answer(500, {}, 'Server Error'))
    await expect(fetchLatestRelease('owner/repo')).rejects.toThrow('GitHub answered 500 Server Error for the latest release of owner/repo.')
  })

  it('lists up to 100 releases without drafts and helper releases', async () => {
    const fetchMock = answer(200, [release('v2'), release('libnode'), release('v1', true)])
    vi.stubGlobal('fetch', fetchMock)
    expect((await fetchReleases('owner/repo')).map(r => r.tag_name)).toEqual(['v2'])
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://api.github.com/repos/owner/repo/releases?per_page=100')
  })

  it('throws when the list cannot be read, a 404 is no empty list', async () => {
    vi.stubGlobal('fetch', answer(404, {}, 'Not Found'))
    await expect(fetchReleases('owner/repo')).rejects.toThrow('GitHub answered 404 Not Found for the releases of owner/repo.')
  })

  it('finds a release by its tag, escaping the tag', async () => {
    const fetchMock = answer(200, release('v1 beta'))
    vi.stubGlobal('fetch', fetchMock)
    expect((await fetchReleaseByTag('owner/repo', 'v1 beta'))?.tag_name).toBe('v1 beta')
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://api.github.com/repos/owner/repo/releases/tags/v1%20beta')
  })

  it('answers null for an unknown tag and throws on other failures', async () => {
    vi.stubGlobal('fetch', answer(404))
    expect(await fetchReleaseByTag('owner/repo', 'v9')).toBeNull()
    vi.stubGlobal('fetch', answer(403, {}, 'Forbidden'))
    await expect(fetchReleaseByTag('owner/repo', 'v9')).rejects.toThrow('GitHub answered 403 Forbidden for the v9 release of owner/repo.')
  })
})

describe('download', () => {
  it('reports the fraction received and writes the file', async () => {
    const dest = path.join(tmp, 'progress')
    const seen: number[] = []
    await download(url, dest, 0, (f) => seen.push(f))
    expect(fs.readFileSync(dest).equals(body)).toBe(true)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)).toBeLessThanOrEqual(1)
    expect(seen.every((f) => f > 0)).toBe(true)
  })

  it('reports nothing when neither the server nor the caller knows the size', async () => {
    const noLength = http.createServer((_req, res) => {
      res.writeHead(200)
      res.end(body)
    })
    await new Promise<void>((resolve) => noLength.listen(0, '127.0.0.1', resolve))
    const seen: number[] = []
    await download(`http://127.0.0.1:${(noLength.address() as AddressInfo).port}/x`, path.join(tmp, 'nolength'), 0, (f) => seen.push(f))
    noLength.close()
    expect(seen).toEqual([])
  })

  it('falls back to the size from the release when the server sends no length', async () => {
    const noLength = http.createServer((_req, res) => {
      res.writeHead(200)
      res.end(body)
    })
    await new Promise<void>((resolve) => noLength.listen(0, '127.0.0.1', resolve))
    const seen: number[] = []
    await download(`http://127.0.0.1:${(noLength.address() as AddressInfo).port}/x`, path.join(tmp, 'releasesize'), body.length, (f) => seen.push(f))
    noLength.close()
    expect(seen.at(-1)).toBe(1)
  })

  it('throws on an error status', async () => {
    const failing = http.createServer((_req, res) => {
      res.writeHead(404, 'Gone')
      res.end()
    })
    await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve))
    const dest = path.join(tmp, 'failed')
    await expect(download(`http://127.0.0.1:${(failing.address() as AddressInfo).port}/x`, dest, 0, () => {})).rejects.toThrow('Download failed: 404 Gone')
    failing.close()
  })
})

describe('verifyAsset', () => {
  const file = () => {
    const f = path.join(tmp, 'verify')
    fs.writeFileSync(f, body)
    return f
  }

  it('names the asset and both sizes when the size is off', async () => {
    await expect(verifyAsset(file(), asset({ size: 3 }))).rejects.toThrow(`engine.tar.gz is ${body.length} bytes, the release says 3.`)
  })

  it('compares the digest case-insensitively', async () => {
    await expect(verifyAsset(file(), asset({ digest: `SHA256:${sha256.toUpperCase()}` }))).resolves.toBeUndefined()
  })

  it('ignores a digest that is not a sha256 of 64 hex digits', async () => {
    await expect(verifyAsset(file(), asset({ digest: 'sha1:abc' }))).resolves.toBeUndefined()
    await expect(verifyAsset(file(), asset({ digest: `sha256:${sha256}00` }))).resolves.toBeUndefined()
  })

  it('names the asset when the checksum differs', async () => {
    await expect(verifyAsset(file(), asset({ digest: `sha256:${'a'.repeat(64)}` }))).rejects.toThrow("engine.tar.gz does not match the release's checksum.")
  })
})
