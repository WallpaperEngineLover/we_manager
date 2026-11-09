import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ forget: false, stopPlaylists: false }))

const killAll = vi.fn<() => Promise<{ ok: boolean; message: string }>>()
const resume = vi.fn<() => void>()
const suspendPlaylist = vi.fn<(screen: string) => () => void>(() => resume)
const pausePlaylist = vi.fn<() => void>()
const stopPlaylist = vi.fn<() => void>()
const forgetAssignments = vi.fn<() => void>()

vi.mock('./config.service', () => ({
  getForgetOnKillAll: () => h.forget,
  getStopPlaylistsOnKillAll: () => h.stopPlaylists
}))
vi.mock('./lwe.service', () => ({ killAllLweProcesses: killAll }))
vi.mock('./display.service', () => ({ forgetAssignments }))
vi.mock('./playlist-player.service', () => ({
  getPlaybackStates: () => [
    { screen: 'DP-1', isPlaying: true },
    { screen: 'DP-2', isPlaying: false }
  ],
  suspendPlaylist,
  pausePlaylist,
  stopPlaylist
}))

beforeEach(() => {
  h.forget = false
  h.stopPlaylists = false
  for (const fn of [killAll, resume, suspendPlaylist, pausePlaylist, stopPlaylist, forgetAssignments]) fn.mockClear()
  killAll.mockResolvedValue({ ok: true, message: '' })
})

async function run() {
  const { killAllEngines } = await import('./kill-all.service')
  return await killAllEngines()
}

describe('Kill All', () => {
  it('leaves the playlists alone when neither setting is on', async () => {
    await run()

    expect(killAll).toHaveBeenCalledTimes(1)
    expect(suspendPlaylist).not.toHaveBeenCalled()
    expect(pausePlaylist).not.toHaveBeenCalled()
  })

  it('pauses the playlists that played once the engines are gone', async () => {
    h.stopPlaylists = true

    await run()

    expect(suspendPlaylist).toHaveBeenCalledTimes(1)
    expect(suspendPlaylist).toHaveBeenCalledWith('DP-1')
    expect(pausePlaylist).toHaveBeenCalledTimes(1)
    expect(resume).not.toHaveBeenCalled()
  })

  it('stops the playlists and forgets the screens with forget on', async () => {
    h.forget = true

    await run()

    expect(stopPlaylist).toHaveBeenCalledTimes(1)
    expect(forgetAssignments).toHaveBeenCalledTimes(1)
    expect(pausePlaylist).not.toHaveBeenCalled()
  })

  it('lets the playlists go on when the kill did not work', async () => {
    h.stopPlaylists = true
    killAll.mockResolvedValue({ ok: false, message: 'pkill is missing' })

    const result = await run()

    expect(result.ok).toBe(false)
    expect(resume).toHaveBeenCalledTimes(1)
    expect(pausePlaylist).not.toHaveBeenCalled()
  })

  it('lets them go on and passes the error on when the kill threw', async () => {
    h.stopPlaylists = true
    killAll.mockRejectedValue(new Error('instances file'))

    await expect(run()).rejects.toThrow('instances file')
    expect(resume).toHaveBeenCalledTimes(1)
  })
})
