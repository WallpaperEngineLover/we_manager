import { describe, expect, it } from 'vitest'
import { engineFlagArgs, filterSupportedArgs, hasEngineFlags, resolveEngineFlags } from './engineFlags'

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
    expect(engineFlagArgs({ hdr: true })).toEqual(['--hdr'])
    expect(engineFlagArgs({ postProcessing: 'ultra', volumetrics: 'high', shadows: 'disabled' })).toEqual([
      '--post-processing',
      'ultra',
      '--volumetrics',
      'high',
      '--shadows',
      'disabled'
    ])
    expect(engineFlagArgs({ postProcessing: 'enabled', volumetrics: 'medium', shadows: 'medium' })).toEqual([])
    expect(engineFlagArgs({ msaa: 'x4' })).toEqual(['--msaa', 'x4'])
    expect(engineFlagArgs({ msaa: 'none' })).toEqual([])
    expect(engineFlagArgs({ ssaa: 'x2' })).toEqual(['--ssaa', 'x2'])
    expect(engineFlagArgs({ ssaa: 'none' })).toEqual([])
    expect(engineFlagArgs({ kdeBackgroundLayer: true })).toEqual(['--layer', 'background'])
    expect(engineFlagArgs({ kdeBackgroundLayer: false })).toEqual([])
  })

  it('leaves disableAnimations to the caller, it needs its own capability probe', () => {
    expect(engineFlagArgs({ disableAnimations: true })).toEqual([])
  })
})

describe('filterSupportedArgs', () => {
  it('drops unknown options along with their values', () => {
    const supported = new Set(['--hdr', '--shadows'])
    expect(
      filterSupportedArgs(['--volumetrics', 'high', '--hdr', '--shadows', 'low'], (flag) => supported.has(flag))
    ).toEqual(['--hdr', '--shadows', 'low'])
  })
})

describe('hasEngineFlags', () => {
  it('is false for nothing or only unset values', () => {
    expect(hasEngineFlags(undefined)).toBe(false)
    expect(hasEngineFlags({ disableMouse: undefined })).toBe(false)
    expect(hasEngineFlags({ disableMouse: false })).toBe(true)
  })
})
