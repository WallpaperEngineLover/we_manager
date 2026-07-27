import { useEffect, useState } from 'react'
import { Wifi, WifiOff, ListVideo, Play, Pause, SkipForward } from 'lucide-react'
import type { PlaylistPlaybackState } from '@shared/types'

export default function StatusBar() {
  const [steamRunning, setSteamRunning] = useState(false)
  const [playback, setPlayback] = useState<PlaylistPlaybackState | null>(null)
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.steam.isRunning().then(setSteamRunning).catch(() => setSteamRunning(false))

    const unsub = window.electronAPI.on.steamStatus(setSteamRunning)
    return unsub
  }, [])

  useEffect(() => {
    window.electronAPI.playlist.getState().then(setPlayback)
    return window.electronAPI.on.playlistStateChanged(setPlayback)
  }, [])

  useEffect(() => {
    if (!playback?.playlistId) {
      setPlaylistTitle(null)
      return
    }
    window.electronAPI.playlist.getOne(playback.playlistId).then((p) => setPlaylistTitle(p?.title ?? null))
  }, [playback?.playlistId])

  async function handlePauseResume() {
    if (playback?.isPlaying) await window.electronAPI.playlist.pause()
    else await window.electronAPI.playlist.resume()
  }

  async function handleNext() {
    await window.electronAPI.playlist.next()
  }

  return (
    <footer className="flex h-6 items-center gap-3 border-t border-white/5 bg-[#0a0a0a] px-3 text-xs text-gray-500">
      <span className="flex items-center gap-1">
        {steamRunning ? (
          <>
            <Wifi size={12} className="text-green-500" />
            Steam connected
          </>
        ) : (
          <>
            <WifiOff size={12} className="text-red-500" />
            Steam offline
          </>
        )}
      </span>

      {playback?.playlistId && (
        <>
          <span className="h-3 w-px bg-white/10" />
          <span className="flex items-center gap-1.5">
            <ListVideo size={12} className="text-indigo-400" />
            {playlistTitle ?? 'Playlist'}
          </span>
          <button
            onClick={handlePauseResume}
            title={playback.isPlaying ? 'Pause' : 'Resume'}
            className="text-gray-400 hover:text-gray-200"
          >
            {playback.isPlaying ? <Pause size={11} /> : <Play size={11} />}
          </button>
          <button onClick={handleNext} title="Next" className="text-gray-400 hover:text-gray-200">
            <SkipForward size={11} />
          </button>
        </>
      )}
    </footer>
  )
}
