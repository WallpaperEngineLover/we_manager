import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('../utils/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/platform')>()),
  getScreenGeometry: () => '1920x0x2560x1440',
  getConnectedScreens: () => ['DP-1']
}))
const loaderSettings = { textures: true, shaders: true, threads: 0 }

vi.mock('./config.service', () => ({
  getConfiguredWorkshopPath: () => null,
  getLweRepoUrl: () => null,
  getLweRepoBranch: () => null,
  getLweCmakeArgs: () => null,
  getAudioScreen: () => null,
  getAmbientVolume: () => null,
  getLeds: () => ({ enabled: false, server: '127.0.0.1:6742', brightness: 100, boost: true, reduceFps: false }),
  getDefaultAudioSensitivity: () => 1,
  getDisablePuppetAnimation: () => false,
  getScriptLimits: () => false,
  getLoader: () => loaderSettings
}))

const {
  buildCleanBuildEnv,
  buildLweEnvVars,
  buildHotswapLines,
  buildLweArgs,
  lwePackageOwner,
  nodeDevelPackage,
  parsePacmanRepos,
  parseCustomArgs,
  parseOsReleaseIds
} = await import('./lwe.service')

const loaderVars = () => buildLweEnvVars().filter((v) => /^LWE_(NO_|PREFETCH)/.test(v))

describe('buildLweEnvVars loader settings', () => {
  it('sets nothing by default', () => {
    Object.assign(loaderSettings, { textures: true, shaders: true, threads: 0 })
    expect(loaderVars()).toEqual([])
  })

  it('turns the prefetches off and passes the thread count', () => {
    Object.assign(loaderSettings, { textures: false, shaders: false, threads: 4 })
    expect(loaderVars()).toEqual(['LWE_NO_TEXTURE_PREFETCH=1', 'LWE_NO_SHADER_WARM=1', 'LWE_PREFETCH_THREADS=4'])
  })
})

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

describe('buildLweArgs', () => {
  it('opens a window the size of the screen in windowed mode', () => {
    const args = buildLweArgs('/w/a', { screen: 'DP-1', engineFlags: { windowed: true } })
    expect(args).toContain('--window')
    expect(args[args.indexOf('--window') + 1]).toBe('1920x0x2560x1440')
    expect(args).not.toContain('--screen-root')
    expect(buildLweArgs('/w/a', { screen: 'DP-1' })).toContain('--screen-root')
  })

  it('keeps a plain window normal and only the background option makes it the desktop', () => {
    const plain = buildLweArgs('/w/a', { screen: 'DP-1', engineFlags: { windowed: true } })
    expect(plain).not.toContain('--window-background')

    const background = buildLweArgs('/w/a', { screen: 'DP-1', engineFlags: { windowBackground: true } })
    expect(background).toContain('--window')
    expect(background).not.toContain('--screen-root')
  })

  it('gives every slot of a split screen its own settings', () => {
    const args = buildLweArgs('/w/a', {
      screen: 'DP-1',
      split: {
        layout: 'center',
        slots: [
          { path: '/w/a', scalingMode: 'fit' },
          { path: '/w/b', zoom: 1.5, offsetX: 0.5 }
        ]
      },
      fps: 30
    })
    const start = args.indexOf('--screen-slot')
    expect(args.slice(start, start + 15)).toEqual([
      '--screen-slot', 'DP-1', '--bg', '/w/a', '--scaling', 'fit',
      '--screen-slot', 'DP-1', '--bg', '/w/b', '--zoom', '1.5', '--offset', '0.5,0',
      '--split-layout'
    ])
    expect(args[start + 15]).toBe('center')
    expect(args).not.toContain('--screen-root')
    expect(args.slice(-3)).toEqual(['--fps', '30', '/w/a'])
  })
})

describe('buildHotswapLines', () => {
  it('writes only the fields that were given', () => {
    expect(buildHotswapLines({ volume: 40, xray: 'normal' })).toEqual(['volume=40', 'xray=off'])
    expect(buildHotswapLines({ xray: 'full' })).toEqual(['xray=on'])
    expect(buildHotswapLines({ xray: 'disabled' })).toEqual(['xray=disabled'])
    expect(buildHotswapLines({})).toEqual([])
  })

  it('leaves out a line whose value would split into two requests', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lines = buildHotswapLines({
      propertyOverrides: { title: 'a\npath=/etc/passwd', fine: 'ok', 'bad\rkey': '1' },
      path: '/wallpapers/1\n/wallpapers/2',
      volume: 30
    })
    expect(lines).toEqual(['volume=30', 'property=fine=ok'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
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

  it('switches the video decoder live', () => {
    expect(buildHotswapLines({ hwdec: 'vaapi-copy' })).toEqual(['hwdec=vaapi-copy'])
    expect(buildHotswapLines({ hrtf: 'off' })).toEqual(['hrtf=off'])
    expect(buildHotswapLines({ batteryFps: 'pause', idlePause: '5' })).toEqual(['fps-battery=pause', 'idle-pause=5'])
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

  it('keeps an installed -devel package instead of adding a conflicting one', () => {
    // Nobara: nodejs-devel 22 from an older release next to Fedora 44's nodejs24-libs
    expect(nodeDevelPackage(['nodejs-libs', 'nodejs24-libs', 'nodejs-devel'])).toBeNull()
    expect(nodeDevelPackage(['nodejs22-libs', 'nodejs22-devel'])).toBeNull()
    expect(nodeDevelPackage(['nodejs24-libs', 'nodejs24-docs'])).toBe('nodejs24-devel')
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

describe('parseOsReleaseIds on openSUSE', () => {
  it('reads Tumbleweed ID and ID_LIKE', () => {
    const tumbleweed = 'NAME="openSUSE Tumbleweed"\nID="opensuse-tumbleweed"\nID_LIKE="opensuse suse"\n'
    expect(parseOsReleaseIds(tumbleweed)).toEqual(['opensuse-tumbleweed', 'opensuse', 'suse'])
  })
})

describe('lwePackageOwner', () => {
  it('leaves Nix store engines to Nix', () => {
    expect(lwePackageOwner('/nix/store/abc-linux-wallpaperengine-kde/bin/linux-wallpaperengine')).toBe('Nix')
  })

  it('owns nothing in a folder of ours', () => {
    expect(lwePackageOwner('/tmp/not-installed-by-anything/linux-wallpaperengine')).toBeUndefined()
  })
})

describe('parsePacmanRepos', () => {
  it('lists the repositories and leaves [options] out', () => {
    const conf = '[options]\nHoldPkg = pacman\n\n[core]\nInclude = /etc/pacman.d/mirrorlist\n  [extra]  \n#[testing]\n[garuda]\nServer = x\n'
    expect(parsePacmanRepos(conf)).toEqual(['core', 'extra', 'garuda'])
  })
})
