import { describe, expect, it } from 'vitest'
import { finderWallpaperArgs, fileUri, plasmaWallpaperScript } from './wallpaperScripts'

function configuredImage(script: string): string {
  const calls: string[] = []
  const d = {
    writeConfig: (key: string, value: string) => {
      if (key === 'Image') calls.push(value)
    }
  }
  new Function('desktops', script)(() => [d])
  return calls[0]
}

describe('fileUri', () => {
  it('encodes what a plain file:// prefix would leave raw', () => {
    expect(fileUri('/home/u/My Wallpapers/a#b?c.jpg')).toBe('file:///home/u/My%20Wallpapers/a%23b%3Fc.jpg')
    expect(fileUri('/home/u/100%/x.png')).toBe('file:///home/u/100%25/x.png')
  })
})

describe('plasmaWallpaperScript', () => {
  it('hands a normal path to the script as its file URI', () => {
    expect(configuredImage(plasmaWallpaperScript('/home/u/pics/a b.png'))).toBe('file:///home/u/pics/a%20b.png')
  })

  it('does not let an apostrophe end the string and run the rest', () => {
    const hostile = `/tmp/x');globalThis.pwned = 1;//.png`
    const script = plasmaWallpaperScript(hostile)
    expect(configuredImage(script)).toBe(fileUri(hostile))
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('survives quotes, backslashes, line breaks and line separators', () => {
    for (const name of [`/tmp/a"b.png`, `/tmp/a\\b.png`, '/tmp/a\nb.png', '/tmp/a\u2028b.png', '/tmp/a\u2029b.png', `/tmp/'.png`]) {
      expect(configuredImage(plasmaWallpaperScript(name))).toBe(fileUri(name))
    }
  })
})

describe('plasmaWallpaperScript settings', () => {
  it('sets the image plugin and writes into every desktop', () => {
    const seen: { plugin?: string; group?: string[]; key?: string }[] = []
    const make = () => {
      const entry: { plugin?: string; group?: string[]; key?: string } = {}
      seen.push(entry)
      return {
        set wallpaperPlugin(v: string) {
          entry.plugin = v
        },
        set currentConfigGroup(v: string[]) {
          entry.group = v
        },
        writeConfig: (key: string) => {
          entry.key = key
        }
      }
    }
    new Function('desktops', plasmaWallpaperScript('/a.png'))(() => [make(), make(), make()])
    expect(seen).toHaveLength(3)
    for (const entry of seen) {
      expect(entry).toEqual({ plugin: 'org.kde.image', group: ['Wallpaper', 'org.kde.image', 'General'], key: 'Image' })
    }
  })
})

describe('finderWallpaperArgs', () => {
  it('is an osascript program with the path as argv', () => {
    expect(finderWallpaperArgs('/x.png')).toEqual([
      '-e',
      'on run argv',
      '-e',
      'tell application "Finder" to set desktop picture to POSIX file (item 1 of argv)',
      '-e',
      'end run',
      '/x.png'
    ])
  })

  it('passes the path as an argument, not inside the AppleScript', () => {
    const path = '/Users/u/a" & (do shell script "id") & ".png'
    const args = finderWallpaperArgs(path)
    expect(args.at(-1)).toBe(path)
    expect(args.filter((_, i) => args[i - 1] === '-e').join('\n')).not.toContain(path)
  })
})
