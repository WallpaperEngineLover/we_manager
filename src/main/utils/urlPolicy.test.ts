import { describe, expect, it } from 'vitest'
import { isAppUrl, isSafeExternalUrl, isServablePreview } from './urlPolicy'

describe('isSafeExternalUrl', () => {
  it('lets web links, steam and mail through', () => {
    for (const url of ['https://steamcommunity.com/id/x', 'http://example.org/a?b=c', 'steam://url/CommunityFilePage/1', 'mailto:a@b.c']) {
      expect(isSafeExternalUrl(url)).toBe(true)
    }
  })

  it('refuses what would start a program or read a file', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'smb://host/share', 'ssh://host', 'vscode://x', 'ftp://host', '', 'not a url', '//host/path']) {
      expect(isSafeExternalUrl(url)).toBe(false)
    }
  })
})

describe('isAppUrl', () => {
  const fileApp = 'file:///opt/we/out/renderer/index.html'

  it('accepts the app page, with or without a query or hash', () => {
    expect(isAppUrl(fileApp, fileApp)).toBe(true)
    expect(isAppUrl(`${fileApp}#/library`, fileApp)).toBe(true)
    expect(isAppUrl(`${fileApp}?x=1`, fileApp)).toBe(true)
  })

  it('refuses another file, another scheme and a dropped file', () => {
    expect(isAppUrl('file:///etc/passwd', fileApp)).toBe(false)
    expect(isAppUrl('file:///opt/we/out/renderer/other.html', fileApp)).toBe(false)
    expect(isAppUrl('https://example.org/', fileApp)).toBe(false)
    expect(isAppUrl('file:///home/u/Downloads/a%20b.png', fileApp)).toBe(false)
    expect(isAppUrl('garbage', fileApp)).toBe(false)
  })

  it('follows the origin of the dev server', () => {
    const dev = 'http://localhost:5173/'
    expect(isAppUrl('http://localhost:5173/index.html', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isAppUrl('http://evil.example/', dev)).toBe(false)
    expect(isAppUrl('file:///opt/we/out/renderer/index.html', dev)).toBe(false)
  })
})

describe('isServablePreview', () => {
  const roots = ['/mnt/steam/workshop/content/431960', '/home/u/.config/we-manager/thumbnails']

  it('serves media inside a root', () => {
    expect(isServablePreview('/mnt/steam/workshop/content/431960/123/preview.jpg', roots)).toBe(true)
    expect(isServablePreview('/mnt/steam/workshop/content/431960/123/sub/preview.GIF', roots)).toBe(true)
    expect(isServablePreview('/home/u/.config/we-manager/thumbnails/123.png', roots)).toBe(true)
  })

  it('refuses a path outside the roots, however it is spelled', () => {
    expect(isServablePreview('/etc/passwd', roots)).toBe(false)
    expect(isServablePreview('/home/u/.ssh/id_rsa.png', roots)).toBe(false)
    expect(isServablePreview('/mnt/steam/workshop/content/431960/../../../../../etc/shadow.png', roots)).toBe(false)
    expect(isServablePreview('/mnt/steam/workshop/content/4319601/x.png', roots)).toBe(false)
    expect(isServablePreview('/mnt/steam/workshop/content/431960', roots)).toBe(false)
  })

  it('refuses what is not a picture or video, even inside a root', () => {
    expect(isServablePreview('/mnt/steam/workshop/content/431960/123/project.json', roots)).toBe(false)
    expect(isServablePreview('/mnt/steam/workshop/content/431960/123/noextension', roots)).toBe(false)
    expect(isServablePreview('/mnt/steam/workshop/content/431960/123/page.html', roots)).toBe(false)
  })

  it('refuses relative paths and null bytes', () => {
    expect(isServablePreview('preview.jpg', roots)).toBe(false)
    expect(isServablePreview('/mnt/steam/workshop/content/431960/a\0.png', roots)).toBe(false)
    expect(isServablePreview('/mnt/steam/workshop/content/431960/123/preview.jpg', [])).toBe(false)
  })
})
