import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  targets: ['DP-1', 'DP-2'],
  assignments: {} as Record<string, string>,
  splitScreens: new Set<string>(),
  playing: [] as { screen: string; playlistId: string; isPlaying: boolean }[],
  profiles: {} as Record<string, unknown>,
  library: new Set(['a', 'b']),
  splits: {} as Record<string, { slots: { wallpaperId: string }[] }>
}))

vi.mock('../utils/safeStore', () => ({ openStore: () => ({ get: () => [], set: () => {} }) }))
vi.mock('../i18n', () => ({ t: (key: string) => key }))
vi.mock('./library.service', () => ({
  getWallpaper: (id: string) => (h.library.has(id) ? { id, title: id } : undefined),
  updateWallpaper: () => {}
}))
vi.mock('./playlist.service', () => ({ getPlaylist: () => undefined }))
vi.mock('./config.service', () => ({ getSplitScreens: () => h.splits }))
vi.mock('./wallpaper-state.service', () => ({
  getAssignments: () => h.assignments,
  isSplitActive: (screen: string) => h.splitScreens.has(screen)
}))
vi.mock('./playlist-player.service', () => ({
  getPlaybackStates: () => h.playing,
  startPlaylist: vi.fn<() => void>(),
  stopPlaylist: vi.fn<() => void>()
}))

const showSplitScreen = vi.fn<(screen: string, beforeLaunch?: () => void) => Promise<void>>(async () => {})
const showWallpaper = vi.fn<(wallpaper: { id: string }, screen: string) => Promise<string>>(async () => '')
vi.mock('./display.service', () => ({
  expandScreen: (screen?: string) => (screen && screen !== '*' ? (h.targets.includes(screen) ? [screen] : []) : h.targets),
  getDisplayTargets: () => h.targets,
  isShownOn: () => false,
  showSplitScreen,
  showWallpaper,
  SplitUnavailableError: class SplitUnavailableError extends Error {},
  stopDisplay: async () => {}
}))
vi.mock('./profile.service', async () => {
  const real = await vi.importActual<typeof import('./profile.service')>('./profile.service')
  return { ...real, getProfile: (id: string) => h.profiles[id] }
})

beforeEach(() => {
  h.targets = ['DP-1', 'DP-2']
  h.assignments = {}
  h.splitScreens.clear()
  h.playing = []
  h.profiles = {}
  h.splits = {}
  showSplitScreen.mockReset()
  showWallpaper.mockClear()
})

describe('what a screen goes back to', () => {
  it('is its split when one is showing, with the first wallpaper to fall back on', async () => {
    const { currentScreenAction } = await import('./profile.service')
    h.assignments = { 'DP-1': 'a', 'DP-2': 'b' }
    h.splitScreens.add('DP-1')

    expect(currentScreenAction('DP-1')).toEqual({ type: 'split', wallpaperId: 'a' })
    expect(currentScreenAction('DP-2')).toEqual({ type: 'wallpaper', wallpaperId: 'b' })
  })

  it('stays its playlist while one plays on the split screen', async () => {
    const { currentScreenAction } = await import('./profile.service')
    h.assignments = { 'DP-1': 'a' }
    h.splitScreens.add('DP-1')
    h.playing = [{ screen: 'DP-1', playlistId: 'p', isPlaying: true }]

    expect(currentScreenAction('DP-1')).toEqual({ type: 'playlist', playlistId: 'p' })
  })
})

describe('going back to a split', () => {
  it('shows the split again', async () => {
    const { runScreenAction } = await import('./rule-actions.service')

    await runScreenAction({ type: 'split', wallpaperId: 'a' }, 'DP-1')

    expect(showSplitScreen).toHaveBeenCalledWith('DP-1', expect.any(Function), 'once', true)
    expect(showWallpaper).not.toHaveBeenCalled()
  })

  it('keeps the wallpapers of its slots from being optimized or deleted while it starts', async () => {
    const { runScreenAction, runningWallpaperIds } = await import('./rule-actions.service')
    h.splits = { 'DP-1': { slots: [{ wallpaperId: 'a' }, { wallpaperId: 'b' }] } }
    let during: string[] = []
    showSplitScreen.mockImplementationOnce(async () => { during = runningWallpaperIds() })

    await runScreenAction({ type: 'split', wallpaperId: 'a' }, 'DP-1')

    expect(during.sort()).toEqual(['a', 'b'])
    expect(runningWallpaperIds()).toEqual([])
  })

  it('shows its first wallpaper when the split can not be shown any more', async () => {
    const { runScreenAction } = await import('./rule-actions.service')
    const { SplitUnavailableError } = await import('./display.service')
    showSplitScreen.mockRejectedValueOnce(new SplitUnavailableError('split.empty'))

    await runScreenAction({ type: 'split', wallpaperId: 'a' }, 'DP-1')

    expect(showWallpaper).toHaveBeenCalledTimes(1)
    expect(showWallpaper.mock.calls[0][0].id).toBe('a')
    expect(showWallpaper.mock.calls[0][1]).toBe('DP-1')
  })

  it('fails, to be tried again, when the launch of the split failed', async () => {
    const { runScreenAction } = await import('./rule-actions.service')
    showSplitScreen.mockRejectedValueOnce(new Error('engine exited'))

    await expect(runScreenAction({ type: 'split', wallpaperId: 'a' }, 'DP-1')).rejects.toThrow('engine exited')
    expect(showWallpaper).not.toHaveBeenCalled()
  })

  it('fails when the split and its first wallpaper are both gone', async () => {
    const { runScreenAction } = await import('./rule-actions.service')
    const { SplitUnavailableError } = await import('./display.service')
    showSplitScreen.mockRejectedValueOnce(new SplitUnavailableError('split.empty'))

    await expect(runScreenAction({ type: 'split', wallpaperId: 'gone' }, 'DP-1')).rejects.toThrow('rules.wallpaperGone')
  })
})

describe('the screens an action touches', () => {
  it('are the screens a profile names, not the rule screen left over in the editor', async () => {
    const { actionScreens } = await import('./rule-actions.service')
    h.profiles.p = { id: 'p', name: 'p', screens: { 'DP-1': { type: 'stop' } } }

    expect(actionScreens({ type: 'profile', profileId: 'p' }, '*')).toEqual(['DP-1'])
    expect(actionScreens({ type: 'stop' }, '*')).toEqual(['DP-1', 'DP-2'])
    expect(actionScreens({ type: 'stop' }, 'DP-2')).toEqual(['DP-2'])
  })
})
