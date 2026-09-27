import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('./config.service', () => ({
  getConfiguredWorkshopPath: () => null,
  getLweRepoUrl: () => null,
  getLweRepoBranch: () => null,
  getLweCmakeArgs: () => null,
  getAudioScreen: () => null,
  getAmbientVolume: () => null,
  getDefaultAudioSensitivity: () => 1,
  getDisablePuppetAnimation: () => false
}))

const { buildCleanBuildEnv, buildHotswapLines, parseCustomArgs } = await import('./lwe.service')

describe('parseCustomArgs', () => {
  it('splits on whitespace and keeps quoted values together', () => {
    expect(parseCustomArgs(`--render-debug skip-effect=726  --set-property foo="bar baz" --x 'a b'`)).toEqual([
      '--render-debug',
      'skip-effect=726',
      '--set-property',
      'foo=bar baz',
      '--x',
      'a b'
    ])
    expect(parseCustomArgs('   ')).toEqual([])
    expect(parseCustomArgs(`--title ""`)).toEqual(['--title', ''])
  })
})

describe('buildHotswapLines', () => {
  it('writes only the fields that were given', () => {
    expect(buildHotswapLines({ volume: 40, xray: false })).toEqual(['volume=40', 'xray=off'])
    expect(buildHotswapLines({})).toEqual([])
  })

  it('replaces the layer lists when either one is present, even empty', () => {
    expect(buildHotswapLines({ disabledObjects: [] })).toEqual(['layers=1'])
    expect(buildHotswapLines({ disabledObjects: ['12'], enabledObjects: ['fog'] })).toEqual([
      'layers=1',
      'disable-object=12',
      'enable-object=fog'
    ])
  })

  it('writes a full wallpaper swap in the order the engine expects', () => {
    expect(
      buildHotswapLines({
        path: '/w/1',
        fps: 30,
        offsetX: 0.5,
        propertyOverrides: { color: '1 0 0' },
        audioSensitivity: { '*': 2 },
        soundVolume: { '7': 0.5 }
      })
    ).toEqual([
      'path=/w/1',
      'fps=30',
      'offset=0.5,0',
      'property=color=1 0 0',
      'audio-sensitivity=*=2',
      'sound-volume=7=0.5'
    ])
  })
})

describe('buildCleanBuildEnv', () => {
  it('drops AppImage mount entries from path lists and the AppImage variables', () => {
    const saved = { ...process.env }
    process.env.APPDIR = '/tmp/.mount_WE-ManAbc123'
    process.env.PATH = '/tmp/.mount_WE-ManAbc123:/tmp/.mount_WE-ManAbc123/usr/sbin:/usr/local/bin:/usr/bin'
    process.env.XDG_DATA_DIRS = '/tmp/.mount_WE-ManAbc123/usr/share'
    process.env.LD_LIBRARY_PATH = '/tmp/.mount_WE-ManAbc123/usr/lib'
    process.env.HOME = '/home/user'
    try {
      const env = buildCleanBuildEnv()
      expect(env.PATH).toBe('/usr/local/bin:/usr/bin')
      expect(env.XDG_DATA_DIRS).toBeUndefined()
      expect(env.LD_LIBRARY_PATH).toBeUndefined()
      expect(env.APPDIR).toBeUndefined()
      expect(env.HOME).toBe('/home/user')
    } finally {
      process.env = saved
    }
  })
})
