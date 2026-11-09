import { forgetAssignments } from './display.service'
import { getForgetOnKillAll, getStopPlaylistsOnKillAll } from './config.service'
import { killAllLweProcesses } from './lwe.service'
import { getPlaybackStates, pausePlaylist, stopPlaylist, suspendPlaylist } from './playlist-player.service'

type KillResult = Awaited<ReturnType<typeof killAllLweProcesses>>

/**
 * Playlists are held while the engines are killed, so their timers do not start the next item in the middle of it
 * (a launch already under way is not stopped). They are stopped (and the screens forgotten) or paused once the
 * kill worked, and go on as before when it did not
 */
export async function killAllEngines(): Promise<KillResult> {
  const forget = getForgetOnKillAll()
  if (!forget && !getStopPlaylistsOnKillAll()) return await killAllLweProcesses()

  const resumes = getPlaybackStates().filter((state) => state.isPlaying).map((state) => suspendPlaylist(state.screen))
  let result: KillResult
  try {
    result = await killAllLweProcesses()
  } catch (err) {
    for (const resume of resumes) resume()
    throw err
  }

  if (!result.ok) {
    for (const resume of resumes) resume()
  } else if (forget) {
    stopPlaylist()
    forgetAssignments()
  } else {
    pausePlaylist()
  }
  return result
}
