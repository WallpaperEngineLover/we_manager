import * as crypto from 'crypto'
import * as fs from 'fs'
import * as http from 'http'
import type { AddressInfo } from 'net'
import * as os from 'os'
import * as path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { downloadVerified, type GithubAsset } from './github'

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
