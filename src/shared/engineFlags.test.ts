import { describe, expect, it } from 'vitest'
import { engineFlagArgs, hasEngineFlags, resolveEngineFlags } from './engineFlags'

describe('resolveEngineFlags', () => {
  it('lets a wallpaper override the global flags, unset ones fall through', () => {
    const resolved = resolveEngineFlags(
      { disableParticles: true, fullscreenPause: 'off' },
      { disableParticles: false, disableMouse: true, fullscreenPause: undefined }
    )
    expect(resolved).toEqual({ disableParticles: false, disableMouse: true, fullscreenPause: 'off' })
  })
})

describe('engineFlagArgs', () => {
  it('maps flags to linux-wallpaperengine arguments', () => {
    expect(
      engineFlagArgs({ disableParticles: true, disableMouse: false, fullscreenPause: 'active-only', silent: true })
    ).toEqual(['--disable-particles', '--fullscreen-pause-only-active', '--silent'])
    expect(engineFlagArgs({ fullscreenPause: 'off' })).toEqual(['--no-fullscreen-pause'])
    expect(engineFlagArgs({ fullscreenPause: 'default' })).toEqual([])
  })

  it('leaves disableAnimations to the caller, it needs its own capability probe', () => {
    expect(engineFlagArgs({ disableAnimations: true })).toEqual([])
  })
})

describe('hasEngineFlags', () => {
  it('is false for nothing or only unset values', () => {
    expect(hasEngineFlags(undefined)).toBe(false)
    expect(hasEngineFlags({ disableMouse: undefined })).toBe(false)
    expect(hasEngineFlags({ disableMouse: false })).toBe(true)
  })
})
