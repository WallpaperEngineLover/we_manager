import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  disk: {} as Record<string, unknown>,
  skipResume: false,
  targets: ['DP-1', 'DP-2'],
  assignments: {} as Record<string, string>,
  gate: null as Promise<string> | null,
  overtaken: false,
  release: (_value: string) => {},
  playlist: {
    id: 'p',
    title: 'p',
    items: [{ wallpaperId: 'a' }, { wallpaperId: 'b', volume: 30 }, { wallpaperId: 'c' }],
    settings: { randomize: false, sortBy: 'manual', defaultDurationSec: 60, defaultVolume: 80 },
    createdAt: 0,
    updatedAt: 0
  }
}))

vi.mock('electron', () => ({ app: { on: () => {} } }))
// the saved players outlive a "restart", which is a fresh import of the service
vi.mock('electron-store', () => ({
  default: class {
    constructor(opts: { defaults: Record<string, unknown> }) {
      h.disk.data ??= structuredClone(opts.defaults)
    }
    get(key: string): unknown {
      return (h.disk.data as Record<string, unknown>)[key]
    }
    set(key: string, value: unknown): void {
      ;(h.disk.data as Record<string, unknown>)[key] = value
    }
  }
}))
vi.mock('./playlist.service', () => ({
  getPlaylist: (id: string) => (id === 'p' ? h.playlist : null),
  getAllPlaylists: () => [h.playlist]
}))
vi.mock('./library.service', () => ({
  getWallpaper: (id: string) => ({ id, title: id, type: 'scene', localPath: `/w/${id}` }),
  updateWallpaper: () => {}
}))
vi.mock('./lwe.service', () => ({ getLweStatus: () => ({ installed: true }), ALL_SCREENS: '*' }))
vi.mock('./config.service', () => ({ getAutostartPlaylistId: () => null, getSkipPlaylistResume: () => h.skipResume }))
vi.mock('./steam.service', () => ({ getFavoriteItemIds: () => [] }))
vi.mock('./wallpaper-state.service', () => ({ getAssignments: () => h.assignments }))
vi.mock('../utils/video', () => ({ findWallpaperVideoFile: () => null, getVideoDurationSec: () => undefined }))

const showWallpaper = vi.fn<(wallpaper: { id: string }, screen: string) => Promise<string>>(async (wallpaper, screen) => {
  const path = h.gate ? await h.gate : ''
  if (!h.overtaken) h.assignments[screen] = wallpaper.id

  return path
})
vi.mock('./display.service', () => ({
  expandScreen: (screen?: string) => (screen && screen !== '*' ? [screen] : h.targets),
  getDisplayTargets: () => h.targets,
  setBusyWallpaperSource: () => {},
  setPlaylistRecovery: () => {},
  setVolumeSource: () => {},
  showWallpaper
}))

const win = { isDestroyed: () => false, webContents: { send: () => {} } } as never

async function boot() {
  vi.resetModules()
  return await import('./playlist-player.service')
}

async function pausedOnB() {
  const first = await boot()
  first.startPlaylist('p', 'DP-1')
  await vi.advanceTimersByTimeAsync(0)
  await first.nextItem('DP-1')
  first.pausePlaylist('DP-1')
  showWallpaper.mockClear()
}

async function neverLaunched() {
  h.gate = new Promise<string>(() => {})
  const first = await boot()
  first.startPlaylist('p', 'DP-1')
  first.pausePlaylist('DP-1')
  h.gate = null
  showWallpaper.mockClear()
  const second = await boot()
  second.initPlaylistPlayer(win)
  return second
}

async function savedOnDp1() {
  const first = await boot()
  first.startPlaylist('p', 'DP-1')
  await vi.advanceTimersByTimeAsync(0)
  h.skipResume = true
  const second = await boot()
  second.initPlaylistPlayer(win)
  return second
}

beforeEach(() => {
  vi.useFakeTimers()
  h.disk = {}
  h.skipResume = false
  h.targets = ['DP-1', 'DP-2']
  h.assignments = {}
  h.gate = null
  h.overtaken = false
  h.playlist.items = [{ wallpaperId: 'a' }, { wallpaperId: 'b', volume: 30 }, { wallpaperId: 'c' }]
  showWallpaper.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('after a restart', () => {
  it('a playing playlist resumes and keeps its screen away from wallpaper restore', async () => {
    const first = await boot()
    first.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    showWallpaper.mockClear()

    const second = await boot()
    second.initPlaylistPlayer(win)
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper).toHaveBeenCalledTimes(1)
    expect(second.playlistRestoreSkipScreens()).toEqual(['DP-1'])
  })

  it('a paused playlist shows nothing itself and hands restore the volume of the item it left', async () => {
    await pausedOnB()
    h.assignments = { 'DP-1': 'b' }

    const second = await boot()
    second.initPlaylistPlayer(win)
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper).not.toHaveBeenCalled()
    expect(second.getPlaybackStates()).toMatchObject([{ screen: 'DP-1', isPlaying: false, currentItemId: 'b', currentIndex: 1 }])
    expect(second.playlistRestoreSkipScreens()).toEqual([])
    expect(second.restoreVolume('DP-1', 'b')).toBe(30)
    expect(second.restoreVolume('DP-1', 'a')).toBeUndefined()
  })

  it('a wallpaper put on the screen by hand keeps its own volume, even when it is a playlist item', async () => {
    await pausedOnB()
    h.assignments = { 'DP-1': 'c' }

    const second = await boot()
    second.initPlaylistPlayer(win)

    expect(second.getPlaybackStates()).toMatchObject([{ currentItemId: null, currentIndex: 1 }])
    expect(second.restoreVolume('DP-1', 'c')).toBeUndefined()
  })

  it('keeps where the playlist was when Next moved it while it was paused', async () => {
    await pausedOnB()
    h.assignments = { 'DP-1': 'b' }
    const second = await boot()
    second.initPlaylistPlayer(win)
    await second.nextItem('DP-1')
    h.assignments = { 'DP-1': 'c' }

    const third = await boot()
    third.initPlaylistPlayer(win)

    expect(third.getPlaybackStates()).toMatchObject([{ currentItemId: 'c', currentIndex: 2 }])
    expect(third.restoreVolume('DP-1', 'c')).toBe(80)
  })

  it('keeps where the playlist was through a start where another wallpaper was on the screen', async () => {
    await pausedOnB()
    h.assignments = { 'DP-1': 'z' }
    const second = await boot()
    second.initPlaylistPlayer(win)
    h.assignments = { 'DP-1': 'b' }

    const third = await boot()
    third.initPlaylistPlayer(win)

    expect(third.getPlaybackStates()).toMatchObject([{ currentItemId: 'b', currentIndex: 1 }])
    expect(third.restoreVolume('DP-1', 'b')).toBe(30)
  })

  it('Resume shows the playlist item again after a wallpaper by hand, as it does after a restart', async () => {
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    showWallpaper.mockClear()

    service.releasePlaylistScreen('DP-1')
    h.assignments['DP-1'] = 'z'
    service.resumePlaylist('DP-1')
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['a'])
  })

  it('Resume only starts the timer when the wallpaper by hand failed to launch', async () => {
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    showWallpaper.mockClear()

    service.releasePlaylistScreen('DP-1')
    service.resumePlaylist('DP-1')
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper).not.toHaveBeenCalled()
  })

  it('does not count a launch that something newer overtook as shown', async () => {
    h.overtaken = true
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)

    expect(service.getPlaybackStates()).toMatchObject([{ currentItemId: null }])
    expect((h.disk.data as { players: Record<string, { shownId: unknown }> }).players['DP-1'].shownId).toBeNull()
  })

  it('a second Resume does not start a second apply', async () => {
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    service.releasePlaylistScreen('DP-1')
    h.assignments['DP-1'] = 'z'
    showWallpaper.mockClear()
    h.gate = new Promise<string>(() => {})

    service.resumePlaylist('DP-1')
    service.resumePlaylist('DP-1')
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper).toHaveBeenCalledTimes(1)
  })

  it('Resume only starts the timer while the playlist item is still on the screen', async () => {
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    service.pausePlaylist('DP-1')
    showWallpaper.mockClear()

    service.resumePlaylist('DP-1')
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper).not.toHaveBeenCalled()
  })

  it('finds the assigned wallpaper of the shared screen', async () => {
    h.targets = ['*']
    const first = await boot()
    first.startPlaylist('p')
    await vi.advanceTimersByTimeAsync(0)
    await first.nextItem()
    first.pausePlaylist()
    h.assignments = { '*': 'b' }

    const second = await boot()
    second.initPlaylistPlayer(win)

    expect(second.getPlaybackStates()).toMatchObject([{ screen: '*', currentItemId: 'b' }])
    expect(second.restoreVolume('DP-1', 'b')).toBe(30)
  })

  describe('and nothing was shown by the playlist', () => {
    it('Resume shows the first item before the timer moves on', async () => {
      const second = await neverLaunched()

      second.resumePlaylist('DP-1')
      await vi.advanceTimersByTimeAsync(0)

      expect(showWallpaper.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['a'])
      expect(second.getPlaybackStates()).toMatchObject([{ isPlaying: true, currentItemId: 'a' }])

      await vi.advanceTimersByTimeAsync(61_000)
      expect(showWallpaper.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['a', 'b'])
    })

    it('Next shows the first item, not the second', async () => {
      const second = await neverLaunched()

      await second.nextItem('DP-1')

      expect(showWallpaper.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['a'])
    })

    it('Next goes on from the item it showed last, also when a wallpaper by hand is on the screen', async () => {
      await pausedOnB()
      h.assignments = { 'DP-1': 'z' }
      const second = await boot()
      second.initPlaylistPlayer(win)

      await second.nextItem('DP-1')

      expect(showWallpaper.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['c'])
    })

    it('Previous shows the item the playlist is on', async () => {
      const second = await neverLaunched()

      await second.previousItem('DP-1')

      expect(showWallpaper.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['a'])
    })
  })
})

describe('playlists that are not resumed', () => {
  it('make no player but keep the playing saved screen out of wallpaper restore', async () => {
    const second = await savedOnDp1()

    expect(second.getPlaybackStates()).toEqual([])
    expect(second.playlistRestoreSkipScreens()).toEqual(['DP-1'])
  })

  it('also keep a paused one away from wallpaper restore', async () => {
    const first = await boot()
    first.startPlaylist('p', 'DP-1')
    first.pausePlaylist('DP-1')
    h.skipResume = true

    const second = await boot()
    second.initPlaylistPlayer(win)

    expect(second.playlistRestoreSkipScreens()).toEqual(['DP-1'])
  })

  it('keep the saved player for a later start with the setting off', async () => {
    await savedOnDp1()
    h.skipResume = false
    showWallpaper.mockClear()

    const third = await boot()
    third.initPlaylistPlayer(win)
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper).toHaveBeenCalledTimes(1)
  })

  it('keep it through a playlist started on another screen, also after the setting is turned off', async () => {
    const second = await savedOnDp1()
    h.skipResume = false

    second.startPlaylist('p', 'DP-2')
    await vi.advanceTimersByTimeAsync(0)
    showWallpaper.mockClear()

    const third = await boot()
    third.initPlaylistPlayer(win)
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper.mock.calls.map(([, screen]) => screen).sort()).toEqual(['DP-1', 'DP-2'])
  })

  it('are not forgotten by a pause of all of them', async () => {
    const first = await boot()
    first.startPlaylist('p')
    await vi.advanceTimersByTimeAsync(0)
    h.skipResume = true
    const second = await boot()
    second.initPlaylistPlayer(win)
    second.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)

    second.pausePlaylist()

    expect(second.playlistRestoreSkipScreens().sort()).toEqual(['DP-1', 'DP-2'])
  })

  it('give the screen back when a wallpaper is put on it by hand', async () => {
    const second = await savedOnDp1()

    second.releasePlaylistScreen('DP-1')

    expect(second.playlistRestoreSkipScreens()).toEqual([])
  })

  it('give the screen back when a wallpaper is put on it by hand while its playlist plays', async () => {
    const first = await boot()
    first.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    h.skipResume = true
    const second = await boot()
    second.initPlaylistPlayer(win)
    second.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    expect(second.playlistRestoreSkipScreens()).toEqual(['DP-1'])

    second.releasePlaylistScreen('DP-1')
    h.assignments['DP-1'] = 'z'

    expect(second.playlistRestoreSkipScreens()).toEqual([])
  })

  it('give the screen back when its playlist is stopped', async () => {
    const second = await savedOnDp1()

    second.stopPlaylist('DP-1')

    expect(second.playlistRestoreSkipScreens()).toEqual([])
  })

  it('ignore a shared screen entry in per-screen mode and a playlist without items', async () => {
    const first = await boot()
    first.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    ;(h.disk.data as { players: Record<string, unknown> }).players['*'] = { playlistId: 'p', isPlaying: true }
    h.skipResume = true

    const second = await boot()
    second.initPlaylistPlayer(win)
    expect(second.playlistRestoreSkipScreens()).toEqual(['DP-1'])

    h.playlist.items = []
    expect(second.playlistRestoreSkipScreens()).toEqual([])
  })

  it('ignore a saved screen whose playlist is gone', async () => {
    const first = await boot()
    first.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    ;(h.disk.data as { players: Record<string, { playlistId: string }> }).players['DP-1'].playlistId = 'gone'
    h.skipResume = true

    const second = await boot()
    second.initPlaylistPlayer(win)

    expect(second.playlistRestoreSkipScreens()).toEqual([])
  })
})

describe('a monitor that is not up yet', () => {
  it('keeps its saved playlist for the start where it is', async () => {
    const first = await boot()
    first.startPlaylist('p')
    await vi.advanceTimersByTimeAsync(0)
    h.targets = ['DP-2']

    const second = await boot()
    second.initPlaylistPlayer(win)
    await vi.advanceTimersByTimeAsync(0)
    h.targets = ['DP-1', 'DP-2']
    showWallpaper.mockClear()

    const third = await boot()
    third.initPlaylistPlayer(win)
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper.mock.calls.map(([, screen]) => screen).sort()).toEqual(['DP-1', 'DP-2'])
  })
})

describe('what is saved', () => {
  it('drops the players of playlists that no longer exist', async () => {
    const first = await boot()
    first.startPlaylist('p', 'DP-1')
    first.startPlaylist('p', 'DP-2')
    await vi.advanceTimersByTimeAsync(0)
    const players = (h.disk.data as { players: Record<string, { playlistId: string }> }).players
    players['DP-1'].playlistId = 'gone'

    const second = await boot()
    second.initPlaylistPlayer(win)

    expect(Object.keys((h.disk.data as { players: object }).players)).toEqual(['DP-2'])
  })
})

describe('holding a playlist for a while', () => {
  it('is not held any more after a play of one of its items', async () => {
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    const resume = service.suspendPlaylist('DP-1')

    await service.playItem('p', 'c', 'DP-1')
    showWallpaper.mockClear()
    resume()
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper).not.toHaveBeenCalled()
  })

  it('saves a held playlist as playing when something else persists', async () => {
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    service.startPlaylist('p', 'DP-2')
    await vi.advanceTimersByTimeAsync(0)

    service.suspendPlaylist('DP-1')
    service.pausePlaylist('DP-2')

    const saved = (h.disk.data as { players: Record<string, { isPlaying: boolean }> }).players
    expect(saved['DP-1'].isPlaying).toBe(true)
  })

  it('lets it go on afterwards without having saved a pause', async () => {
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)

    const resume = service.suspendPlaylist('DP-1')

    expect(service.getPlaybackStates()[0].isPlaying).toBe(false)
    expect((h.disk.data as { players: Record<string, { isPlaying: boolean }> }).players['DP-1'].isPlaying).toBe(true)

    resume()
    expect(service.getPlaybackStates()[0].isPlaying).toBe(true)
  })

  it('leaves it alone when somebody paused it meanwhile', async () => {
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)

    const resume = service.suspendPlaylist('DP-1')
    service.pausePlaylist('DP-1')
    resume()

    expect(service.getPlaybackStates()[0].isPlaying).toBe(false)
  })
})

describe('an apply that something took the player from', () => {
  it('does not go on to the next items when its launch fails after a restart', async () => {
    let fail: (reason: Error) => void = () => {}
    showWallpaper.mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { fail = reject }))
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    showWallpaper.mockClear()

    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    fail(new Error('declined'))
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper.mock.calls.map(([wallpaper]) => wallpaper.id)).toEqual(['a'])
  })

  it('does not go on after a stop either', async () => {
    let fail: (reason: Error) => void = () => {}
    showWallpaper.mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { fail = reject }))
    const service = await boot()
    service.startPlaylist('p', 'DP-1')
    await vi.advanceTimersByTimeAsync(0)
    showWallpaper.mockClear()

    service.stopPlaylist('DP-1')
    fail(new Error('declined'))
    await vi.advanceTimersByTimeAsync(0)

    expect(showWallpaper).not.toHaveBeenCalled()
  })
})

describe('stopping during an apply', () => {
  it('does not arm the timer of the player that is gone', async () => {
    h.gate = new Promise<string>((resolve) => {
      h.release = resolve
    })
    const service = await boot()

    service.startPlaylist('p', 'DP-1')
    service.stopPlaylist('DP-1')
    h.release('')
    await vi.advanceTimersByTimeAsync(3_600_000)

    expect(showWallpaper).toHaveBeenCalledTimes(1)
  })
})
