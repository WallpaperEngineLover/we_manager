import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export default function StatusBar() {
  const [steamRunning, setSteamRunning] = useState(false)

  useEffect(() => {
    window.electronAPI.steam.isRunning().then(setSteamRunning).catch(() => setSteamRunning(false))

    const unsub = window.electronAPI.on.steamStatus(setSteamRunning)
    return unsub
  }, [])

  return (
    <footer className="flex h-6 items-center gap-2 border-t border-white/5 bg-[#0a0a0a] px-3 text-xs text-gray-500">
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
    </footer>
  )
}
