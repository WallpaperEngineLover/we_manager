import { describe, expect, it } from 'vitest'
import { engineFlagArgs, filterSupportedArgs, hasEngineFlags, normalizeWallpaperFlags, resolveEngineFlags, withoutGlobalOnlyFlags } from './engineFlags'

describe('resolveEngineFlags', () => {
  it('lets a wallpaper override the global flags, unset ones fall through', () => {
    const resolved = resolveEngineFlags(
      { disableParticles: true, fullscreenPause: 'off' },
      { disableParticles: false, disableMouse: true, fullscreenPause: undefined }
    )
    expect(resolved).toEqual({ disableParticles: false, disableMouse: true, fullscreenPause: 'off' })
  })
})

describe('withoutGlobalOnlyFlags', () => {
  it('drops the settings of the whole engine and keeps the other flags', () => {
    expect(
      withoutGlobalOnlyFlags({
        silent: true,
        audioInput: 'usb-mic',
        audioInputVolume: 70,
        audioInputThreshold: 10,
        windowed: true,
        windowBackground: true,
        kdeBackgroundLayer: true
      })
    ).toEqual({ silent: true })
  })

  it('keeps a wallpaper from overriding them or counting as customized because of them', () => {
    expect(resolveEngineFlags({ audioInput: 'monitor', windowed: false }, { audioInput: 'usb-mic', windowed: true, silent: true })).toEqual({
      audioInput: 'monitor',
      windowed: false,
      silent: true
    })
    expect(hasEngineFlags({ audioInput: 'usb-mic', windowed: true })).toBe(false)
    expect(hasEngineFlags({ silent: false })).toBe(true)
  })
})

describe('normalizeWallpaperFlags', () => {
  it('keeps what a wallpaper may have and nothing when that is all gone', () => {
    expect(normalizeWallpaperFlags({ silent: true, windowed: true })).toEqual({ silent: true })
    expect(normalizeWallpaperFlags({ windowed: true, audioInput: 'usb-mic' })).toBeUndefined()
    expect(normalizeWallpaperFlags({ silent: undefined })).toBeUndefined()
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
    expect(engineFlagArgs({ audioInput: 'alsa_input.mic' })).toEqual(['--audio-input', 'alsa_input.mic'])
    expect(engineFlagArgs({ audioInput: 'default', audioInputVolume: 50, audioInputThreshold: 0 })).toEqual([])
    expect(engineFlagArgs({ audioInputVolume: 80, audioInputThreshold: 120 })).toEqual([
      '--audio-input-volume',
      '80',
      '--audio-input-threshold',
      '120'
    ])
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
