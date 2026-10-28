import * as crypto from 'crypto'
import * as fs from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

export interface GithubAsset {
  name: string
  browser_download_url: string
  size: number
  /** "sha256:<hex>", GitHub fills it for assets uploaded since mid 2025 */
  digest?: string | null
}

export interface GithubRelease {
  tag_name: string
  html_url: string
  body: string | null
  published_at: string
  draft?: boolean
  prerelease?: boolean
  assets: GithubAsset[]
}

/** The repos also publish helper releases (libnode for Arch); only "v0.9.8" style tags are versions of the program */
export function isVersionTag(tag: string): boolean {
  return /^v\d/.test(tag)
}

export function selectableReleases(releases: GithubRelease[]): GithubRelease[] {
  return releases.filter((r) => !r.draft && isVersionTag(r.tag_name))
}

export async function fetchLatestRelease(repo: string): Promise<GithubRelease | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'we-manager' },
    signal: AbortSignal.timeout(20_000)
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub answered ${res.status} ${res.statusText} for the latest release of ${repo}.`)
  return (await res.json()) as GithubRelease
}

export async function fetchReleases(repo: string): Promise<GithubRelease[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'we-manager' },
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status} ${res.statusText} for the releases of ${repo}.`)
  return selectableReleases((await res.json()) as GithubRelease[])
}

export async function fetchReleaseByTag(repo: string, tag: string): Promise<GithubRelease | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'we-manager' },
    signal: AbortSignal.timeout(20_000)
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub answered ${res.status} ${res.statusText} for the ${tag} release of ${repo}.`)
  return (await res.json()) as GithubRelease
}

export async function download(url: string, dest: string, total: number, onProgress: (fraction: number) => void): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': 'we-manager' } })
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`)

  const size = Number(res.headers.get('content-length')) || total
  let received = 0
  let lastReport = 0
  const body = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    const now = Date.now()
    if (size > 0 && now - lastReport > 250) {
      lastReport = now
      onProgress(received / size)
    }
  })
  await pipeline(body, fs.createWriteStream(dest))
}

/** download() and verifyAsset(): a file that doesn't match its release asset is removed and never reaches the caller */
export async function downloadVerified(asset: GithubAsset, dest: string, onProgress: (fraction: number) => void): Promise<void> {
  await download(asset.browser_download_url, dest, asset.size, onProgress)
  try {
    await verifyAsset(dest, asset)
  } catch (err) {
    fs.rmSync(dest, { force: true })
    throw err
  }
}

export async function verifyAsset(file: string, asset: GithubAsset): Promise<void> {
  const size = fs.statSync(file).size
  if (size !== asset.size) throw new Error(`${asset.name} is ${size} bytes, the release says ${asset.size}.`)
  const expected = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '')?.[1]
  if (!expected) return
  const hash = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(file), hash)
  if (hash.digest('hex') !== expected.toLowerCase()) throw new Error(`${asset.name} does not match the release's checksum.`)
}
