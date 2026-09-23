import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wifi, WifiOff, ListVideo, Play, Pause, SkipForward } from 'lucide-react'
import type { PlaylistPlaybackState } from '@shared/types'
import { screenLabel } from '../../utils/screens'

export default function StatusBar() {
  const [steamRunning, setSteamRunning] = useState(false)
  const [players, setPlayers] = useState<PlaylistPlaybackState[]>([])

  useEffect(() => {
    window.electronAPI.steam.isRunning().then(setSteamRunning).catch(() => setSteamRunning(false))

    const unsub = window.electronAPI.on.steamStatus(setSteamRunning)
    return unsub
  }, [])

  useEffect(() => {
    window.electronAPI.playlist.getState().then(setPlayers)
    return window.electronAPI.on.playlistStateChanged(setPlayers)
  }, [])

  const { data: playlists } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => window.electronAPI.playlist.getAll()
  })

  const active = players.filter((p) => p.playlistId)

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

      {active.map((playback) => (
        <span key={playback.screen} className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-white/10" />
          <ListVideo size={12} className="text-indigo-400" />
          {playlists?.find((p) => p.id === playback.playlistId)?.title ?? 'Playlist'}
          {playback.screen !== '*' && <span className="text-gray-600">on {screenLabel(playback.screen)}</span>}
          <button
            onClick={() =>
              playback.isPlaying
                ? window.electronAPI.playlist.pause(playback.screen)
                : window.electronAPI.playlist.resume(playback.screen)
            }
            title={playback.isPlaying ? 'Pause' : 'Resume'}
            className="text-gray-400 hover:text-gray-200"
          >
            {playback.isPlaying ? <Pause size={11} /> : <Play size={11} />}
          </button>
          <button
            onClick={() => window.electronAPI.playlist.next(playback.screen)}
            title="Next"
            className="text-gray-400 hover:text-gray-200"
          >
            <SkipForward size={11} />
          </button>
        </span>
      ))}
    </footer>
  )
}
