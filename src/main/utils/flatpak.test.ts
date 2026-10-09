import { afterEach, describe, expect, it, vi } from 'vitest'

const savedId = process.env.FLATPAK_ID

async function load(flatpakId?: string): Promise<typeof import('./flatpak')> {
  vi.resetModules()
  if (flatpakId) process.env.FLATPAK_ID = flatpakId
  else delete process.env.FLATPAK_ID
  return import('./flatpak')
}

afterEach(() => {
  if (savedId) process.env.FLATPAK_ID = savedId
  else delete process.env.FLATPAK_ID
})

describe('hostCommand', () => {
  it('runs the program itself outside a Flatpak', async () => {
    const { hostCommand, hostShell, isFlatpak } = await load()
    expect(isFlatpak()).toBe(false)
    expect(hostCommand('kscreen-doctor', ['--outputs'])).toEqual(['kscreen-doctor', ['--outputs']])
    expect(hostShell('xrandr --query 2>/dev/null')).toBe('xrandr --query 2>/dev/null')
  })

  it('goes through flatpak-spawn inside one', async () => {
    const { hostCommand, hostShell, isFlatpak } = await load('io.github.WallpaperEngineLover.we_manager')
    expect(isFlatpak()).toBe(true)
    expect(hostCommand('qdbus', ['org.kde.plasmashell'])).toEqual(['flatpak-spawn', ['--host', 'qdbus', 'org.kde.plasmashell']])
    expect(hostShell('wlr-randr 2>/dev/null')).toBe('flatpak-spawn --host sh -c "wlr-randr 2>/dev/null"')
  })
})
