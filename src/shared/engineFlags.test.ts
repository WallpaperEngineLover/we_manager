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
    expect(engineFlagArgs({ noDesktopIcons: true })).toEqual(['--no-desktop-icons'])
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
    expect(engineFlagArgs({ hwdec: 'nvdec-copy' })).toEqual(['--hwdec', 'nvdec-copy'])
    expect(engineFlagArgs({ hwdec: 'auto' })).toEqual([])
    expect(engineFlagArgs({ webFrames: 'dmabuf' })).toEqual(['--web-frames', 'dmabuf'])
    expect(engineFlagArgs({ webFrames: 'shm' })).toEqual(['--web-frames', 'shm'])
    expect(engineFlagArgs({ webFrames: 'auto' })).toEqual([])
    expect(engineFlagArgs({ frameLimiter: 'fixed' })).toEqual(['--frame-limiter', 'fixed'])
    expect(engineFlagArgs({ frameLimiter: 'budget' })).toEqual([])
    expect(engineFlagArgs({ hrtf: 'on' })).toEqual(['--hrtf', 'on'])
    expect(engineFlagArgs({ hrtf: 'auto' })).toEqual([])
    expect(engineFlagArgs({ batteryFps: '15' })).toEqual(['--fps-battery', '15'])
    expect(engineFlagArgs({ batteryFps: 'pause' })).toEqual(['--pause-on-battery'])
    expect(engineFlagArgs({ batteryFps: 'off' })).toEqual([])
    expect(engineFlagArgs({ idlePause: '5' })).toEqual(['--idle-pause', '5'])
    expect(engineFlagArgs({ idlePause: 'off' })).toEqual([])
    expect(engineFlagArgs({ kdeBackgroundLayer: true })).toEqual(['--layer', 'background'])
    expect(engineFlagArgs({ kdeBackgroundLayer: false })).toEqual([])
    expect(engineFlagArgs({ pauseOnFocus: true, fullscreenPause: 'off' })).toEqual(['--no-fullscreen-pause', '--pause-on-focus'])
    expect(engineFlagArgs({ pauseOnFocus: false })).toEqual([])
    expect(engineFlagArgs({ pauseOnMaximized: true })).toEqual(['--pause-on-maximized'])
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

describe('transition flags', () => {
  it('sends the transition and a non default length only when a transition is set', () => {
    expect(engineFlagArgs({ transition: 'none', transitionDuration: '1000' })).toEqual([])
    expect(engineFlagArgs({ transitionDuration: '1000' })).toEqual([])
    expect(engineFlagArgs({ transition: 'fade' })).toEqual(['--transition', 'fade'])
    expect(engineFlagArgs({ transition: 'zoom', transitionDuration: '600' })).toEqual(['--transition', 'zoom'])
    expect(engineFlagArgs({ transition: 'slide-left', transitionDuration: '1500' })).toEqual([
      '--transition',
      'slide-left',
      '--transition-duration',
      '1500'
    ])
  })
})
