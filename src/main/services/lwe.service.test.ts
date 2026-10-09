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

const { buildCleanBuildEnv, buildHotswapLines, nodeDevelPackage, parseCustomArgs, parseOsReleaseIds } = await import('./lwe.service')

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
    expect(buildHotswapLines({ volume: 40, xray: 'normal' })).toEqual(['volume=40', 'xray=off'])
    expect(buildHotswapLines({ xray: 'full' })).toEqual(['xray=on'])
    expect(buildHotswapLines({ xray: 'disabled' })).toEqual(['xray=disabled'])
    expect(buildHotswapLines({})).toEqual([])
  })

  it('sends the video parts and seeks after setting them', () => {
    expect(
      buildHotswapLines({
        videoSegments: [
          { start: 120, end: 180 },
          { start: 240 }
        ],
        videoSeek: 177
      })
    ).toEqual(['video-segments=120-180,240-', 'video-seek=177'])
  })

  it('plays the whole video again with no parts', () => {
    expect(buildHotswapLines({ videoSegments: [] })).toEqual(['video-segments=none'])
  })

  it('replaces the effect lists the same way and switches animations live', () => {
    expect(buildHotswapLines({ disabledEffects: [] })).toEqual(['effects=1'])
    expect(buildHotswapLines({ disabledEffects: ['51', '74'], disableAnimations: false })).toEqual([
      'effects=1',
      'disable-effect=51',
      'disable-effect=74',
      'disable-animations=off'
    ])
    expect(buildHotswapLines({ enabledEffects: ['glow'], disableAnimations: true })).toEqual([
      'effects=1',
      'enable-effect=glow',
      'disable-animations=on'
    ])
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

describe('nodeDevelPackage', () => {
  it('takes the headers of the installed libnode', () => {
    expect(nodeDevelPackage(['nodejs24-libs', ''])).toBe('nodejs24-devel')
    expect(nodeDevelPackage(['nodejs-libs'])).toBe('nodejs-devel')
  })

  it('picks the newest of several installed versions', () => {
    expect(nodeDevelPackage(['nodejs22-libs', 'nodejs24-libs', 'nodejs20-libs'])).toBe('nodejs24-devel')
  })

  it('leaves the choice to dnf without an installed libnode', () => {
    expect(nodeDevelPackage([])).toBe('nodejs-devel')
    expect(nodeDevelPackage(['nodejs24-docs'])).toBe('nodejs-devel')
  })
})

describe('parseOsReleaseIds', () => {
  it('lists ID before ID_LIKE', () => {
    const bazzite = 'NAME="Bazzite"\nVERSION_ID="44"\nID=bazzite\nID_LIKE="fedora"\nVARIANT_ID=bazzite-deck\n'
    expect(parseOsReleaseIds(bazzite)).toEqual(['bazzite', 'fedora'])
  })

  it('splits several parents and ignores VARIANT_ID', () => {
    expect(parseOsReleaseIds('ID=pop\nID_LIKE="ubuntu debian"\nVARIANT_ID=x')).toEqual(['pop', 'ubuntu', 'debian'])
  })
})
