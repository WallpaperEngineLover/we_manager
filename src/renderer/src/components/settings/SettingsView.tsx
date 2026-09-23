import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Save, Upload, Download, CheckCircle, XCircle, Loader2, Package, Trash2, Monitor, RotateCcw, Archive, LayoutGrid, Power, Skull, Film, Globe, Shield, Bug, Pause } from 'lucide-react'
import type { LweStatus, LweInstallProgress, LinuxDistro, SteamIdentity } from '../../../../shared/types'

const DISTRO_LABELS: Record<LinuxDistro, string> = {
  fedora: 'Fedora / Nobara / RHEL',
  arch: 'Arch / Manjaro / EndeavourOS',
  debian: 'Debian / Ubuntu / Mint / Pop!_OS',
  unknown: 'Unknown'
}

export default function SettingsView() {
  const [workshopPath, setWorkshopPath] = useState('')
  const [saved, setSaved] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [defaultFps, setDefaultFps] = useState<string>('')
  const [fpsSaved, setFpsSaved] = useState(false)
  const [recommendedFpsEnabled, setRecommendedFpsEnabled] = useState(false)
  const [recommendedWebFpsEnabled, setRecommendedWebFpsEnabled] = useState(true)
  const [resetFpsConfirm, setResetFpsConfirm] = useState(false)
  const [resetFpsMsg, setResetFpsMsg] = useState<string | null>(null)

  const [lweStatus, setLweStatus] = useState<LweStatus | null>(null)
  const [lweRepoUrl, setLweRepoUrl] = useState('')
  const [lweRepoBranch, setLweRepoBranch] = useState('')
  const [lweCmakeArgs, setLweCmakeArgs] = useState('')
  const [defaultLweRepo, setDefaultLweRepo] = useState('')
  const [repoSaved, setRepoSaved] = useState(false)
  const queryClient = useQueryClient()
  // Lives in the query cache (written from App.tsx's always-mounted subscriber) instead of local
  // state, so an in-progress build/install survives navigating away from Settings and back -
  // this component unmounts on navigation, the query cache doesn't.
  const { data: lweProgress = null } = useQuery<LweInstallProgress | null>({
    queryKey: ['lwe-install-progress'],
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: Infinity
  })
  const lweInstalling = lweProgress !== null && !['done', 'error', 'installing-deps'].includes(lweProgress.stage)
  const depsInstalling = lweProgress?.stage === 'installing-deps'
  const [distro, setDistro] = useState<LinuxDistro | null>(null)
  const [uninstalling, setUninstalling] = useState(false)
  const [uninstallMsg, setUninstallMsg] = useState<string | null>(null)
  const [killingLwe, setKillingLwe] = useState(false)
  const [killMsg, setKillMsg] = useState<string | null>(null)

  const [desktopIconsEnabled, setDesktopIconsEnabled] = useState(false)

  const [backupPath, setBackupPath] = useState('')
  const [backupSaved, setBackupSaved] = useState(false)
  const [autoUnsubscribeAfterBackup, setAutoUnsubscribeAfterBackup] = useState(false)

  const [trayEnabled, setTrayEnabled] = useState(false)
  const [killLweOnQuit, setKillLweOnQuit] = useState(false)
  const [steamIdentity, setSteamIdentityState] = useState<SteamIdentity>('wallpaper-engine')
  const [steamIdentitySaved, setSteamIdentitySaved] = useState(false)
  const [autostartSupported, setAutostartSupported] = useState(false)
  const [autostartEnabled, setAutostartEnabledState] = useState(false)
  const [autostartMinimized, setAutostartMinimized] = useState(false)
  const [autostartPlaylistId, setAutostartPlaylistId] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([])

  const [screens, setScreens] = useState<string[]>([])
  const [screensRefreshing, setScreensRefreshing] = useState(false)
  const [audioScreen, setAudioScreen] = useState<string | null>(null)
  const [ambientVolume, setAmbientVolume] = useState<string>('')
  const [ambientVolumeSaved, setAmbientVolumeSaved] = useState(false)
  const [defaultAudioSensitivity, setDefaultAudioSensitivity] = useState<string>('100')
  const [defaultAudioSensitivitySaved, setDefaultAudioSensitivitySaved] = useState(false)
  const [disablePuppetAnimation, setDisablePuppetAnimation] = useState(false)
  const [disableAnimations, setDisableAnimations] = useState(false)

  useEffect(() => {
    window.electronAPI.config.get().then((cfg) => {
      setWorkshopPath(cfg.workshopPath ?? cfg.defaultWorkshopPath)
      setDefaultFps(cfg.defaultFps != null ? String(cfg.defaultFps) : '')
      setRecommendedFpsEnabled(cfg.recommendedFpsEnabled)
      setRecommendedWebFpsEnabled(cfg.recommendedWebFpsEnabled)
      setLweRepoUrl(cfg.lweRepoUrl ?? '')
      setLweRepoBranch(cfg.lweRepoBranch ?? '')
      setLweCmakeArgs(cfg.lweCmakeArgs ?? '')
      setDefaultLweRepo(cfg.defaultLweRepoUrl)
      setBackupPath(cfg.backupPath ?? '')
      setAutoUnsubscribeAfterBackup(cfg.autoUnsubscribeAfterBackup)
      setTrayEnabled(cfg.trayEnabled)
      setKillLweOnQuit(cfg.killLweOnQuit)
      setSteamIdentityState(cfg.steamIdentity)
      setAutostartSupported(cfg.autostartSupported)
      setAutostartEnabledState(cfg.autostartEnabled)
      setAutostartMinimized(cfg.autostartMinimized)
      setAutostartPlaylistId(cfg.autostartPlaylistId)
      setAudioScreen(cfg.audioScreen)
      setAmbientVolume(cfg.ambientVolume != null ? String(cfg.ambientVolume) : '')
      setDefaultAudioSensitivity(String(Math.round(cfg.defaultAudioSensitivity * 100)))
      setDisablePuppetAnimation(cfg.disablePuppetAnimation)
      setDisableAnimations(cfg.disableAnimations)
    })
    window.electronAPI.lwe.status().then(setLweStatus)
    window.electronAPI.lwe.detectDistro().then(setDistro)
    window.electronAPI.desktopIcons.getEnabled().then(setDesktopIconsEnabled)
    window.electronAPI.playlist.getAll().then((all) => setPlaylists(all.map((p) => ({ id: p.id, title: p.title }))))
    window.electronAPI.lwe.listScreens().then(setScreens)
  }, [])

  // The event subscription itself lives in App.tsx (see lwe-install-progress query above) so it
  // survives navigation; this just reacts to the shared progress reaching a terminal stage to
  // refresh the installed-status display, which is fine to keep local since it's re-fetched on
  // every mount anyway.
  useEffect(() => {
    if (lweProgress?.stage === 'done' || lweProgress?.stage === 'error') {
      window.electronAPI.lwe.status().then(setLweStatus)
    }
  }, [lweProgress])

  async function handleBrowse() {
    const picked = await window.electronAPI.config.pickFolder()
    if (picked) {
      setWorkshopPath(picked)
      setSaved(false)
    }
  }

  async function handleSave() {
    await window.electronAPI.config.setWorkshopPath(workshopPath)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleImportConfig() {
    setImportStatus(null)
    try {
      const filePath = await window.electronAPI.config.pickFile()
      if (!filePath) return
      const result = await window.electronAPI.config.importWE(filePath)
      setImportStatus(
        `Imported ${result.folders} folders and ${result.playlists} playlists. Paths fixed automatically.`
      )
    } catch (err) {
      setImportStatus(`Import failed: ${(err as Error).message}`)
    }
  }

  function setLweProgress(progress: LweInstallProgress) {
    queryClient.setQueryData(['lwe-install-progress'], progress)
  }

  async function handleInstallDeps() {
    setLweProgress({ stage: 'installing-deps', message: 'Starting dependency installation...', percentage: 0 })
    try {
      await window.electronAPI.lwe.installDeps()
    } catch (err) {
      setLweProgress({
        stage: 'error',
        message: `Dependency installation failed: ${(err as Error).message}`,
        percentage: 0
      })
    }
  }

  async function handleSaveRepo() {
    await window.electronAPI.config.setLweRepo(lweRepoUrl.trim() || null, lweRepoBranch.trim() || null)
    await window.electronAPI.config.setLweCmakeArgs(lweCmakeArgs.trim() || null)
    setRepoSaved(true)
    setTimeout(() => setRepoSaved(false), 2000)
  }

  async function handleInstallLwe() {
    setLweProgress({ stage: 'cloning', message: 'Starting installation...', percentage: 0 })
    try {
      // Persist the repo/cmake-args fields first so the build uses what's on screen
      await window.electronAPI.config.setLweRepo(lweRepoUrl.trim() || null, lweRepoBranch.trim() || null)
      await window.electronAPI.config.setLweCmakeArgs(lweCmakeArgs.trim() || null)
      await window.electronAPI.lwe.install()
    } catch (err) {
      setLweProgress({
        stage: 'error',
        message: `Installation failed: ${(err as Error).message}`,
        percentage: 0
      })
    }
  }

  async function handleUninstallLwe() {
    if (!confirm('Are you sure you want to uninstall linux-wallpaperengine?')) return
    setUninstalling(true)
    setUninstallMsg(null)
    try {
      const result = await window.electronAPI.lwe.uninstall()
      setUninstallMsg(result.message)
      window.electronAPI.lwe.status().then(setLweStatus)
    } catch (err) {
      setUninstallMsg(`Uninstall failed: ${(err as Error).message}`)
    } finally {
      setUninstalling(false)
    }
  }

  async function handleKillAllLwe() {
    setKillingLwe(true)
    setKillMsg(null)
    try {
      const result = await window.electronAPI.lwe.killAll()
      setKillMsg(result.message)
    } catch (err) {
      setKillMsg(`Failed: ${(err as Error).message}`)
    } finally {
      setKillingLwe(false)
    }
  }

  async function handleSaveDefaultFps() {
    const parsed = defaultFps.trim() === '' ? null : parseInt(defaultFps, 10)
    if (parsed !== null && (isNaN(parsed) || parsed < 1)) return
    await window.electronAPI.config.setDefaultFps(parsed)
    setFpsSaved(true)
    setTimeout(() => setFpsSaved(false), 2000)
  }

  async function handleRecommendedFpsToggle() {
    const newVal = !recommendedFpsEnabled
    setRecommendedFpsEnabled(newVal)
    await window.electronAPI.config.setRecommendedFpsEnabled(newVal)
  }

  async function handleRecommendedWebFpsToggle() {
    const newVal = !recommendedWebFpsEnabled
    setRecommendedWebFpsEnabled(newVal)
    await window.electronAPI.config.setRecommendedWebFpsEnabled(newVal)
  }

  async function handleResetFpsOverrides() {
    if (!resetFpsConfirm) { setResetFpsConfirm(true); return }
    setResetFpsConfirm(false)
    const result = await window.electronAPI.library.resetFpsOverrides()
    setResetFpsMsg(`Reset FPS for ${result.count} wallpaper${result.count !== 1 ? 's' : ''}.`)
    setTimeout(() => setResetFpsMsg(null), 3000)
  }

  async function handleDesktopIconsToggle() {
    const newVal = !desktopIconsEnabled
    setDesktopIconsEnabled(newVal)
    await window.electronAPI.desktopIcons.setEnabled(newVal)
  }

  async function handleBrowseBackup() {
    const picked = await window.electronAPI.config.pickFolder()
    if (picked) {
      setBackupPath(picked)
      setBackupSaved(false)
    }
  }

  async function handleSaveBackup() {
    await window.electronAPI.config.setBackupPath(backupPath)
    setBackupSaved(true)
    setTimeout(() => setBackupSaved(false), 2000)
  }

  async function handleAutoUnsubscribeToggle() {
    const newVal = !autoUnsubscribeAfterBackup
    setAutoUnsubscribeAfterBackup(newVal)
    await window.electronAPI.config.setAutoUnsubscribeAfterBackup(newVal)
  }

  async function handleTrayToggle() {
    const newVal = !trayEnabled
    setTrayEnabled(newVal)
    await window.electronAPI.config.setTrayEnabled(newVal)
  }

  async function handleKillLweOnQuitToggle() {
    const newVal = !killLweOnQuit
    setKillLweOnQuit(newVal)
    await window.electronAPI.config.setKillLweOnQuit(newVal)
  }

  async function handleDisablePuppetAnimationToggle() {
    const newVal = !disablePuppetAnimation
    setDisablePuppetAnimation(newVal)
    await window.electronAPI.config.setDisablePuppetAnimation(newVal)
  }

  async function handleDisableAnimationsToggle() {
    const newVal = !disableAnimations
    setDisableAnimations(newVal)
    await window.electronAPI.config.setDisableAnimations(newVal)
  }

  async function handleSteamIdentityChange(identity: SteamIdentity) {
    setSteamIdentityState(identity)
    await window.electronAPI.config.setSteamIdentity(identity)
    setSteamIdentitySaved(true)
    setTimeout(() => setSteamIdentitySaved(false), 3000)
  }

  async function handleAudioScreenChange(screen: string | null) {
    setAudioScreen(screen)
    await window.electronAPI.config.setAudioScreen(screen)
    // Push live so a currently running instance updates without a relaunch
    await window.electronAPI.lwe.hotswapSettings({ audioScreen: screen ?? '' })
  }

  async function handleRefreshScreens() {
    setScreensRefreshing(true)
    try {
      setScreens(await window.electronAPI.lwe.listScreens())
    } finally {
      setScreensRefreshing(false)
    }
  }

  async function handleSaveAmbientVolume() {
    const parsed = ambientVolume.trim() === '' ? null : parseInt(ambientVolume, 10)
    if (parsed !== null && (isNaN(parsed) || parsed < 0 || parsed > 128)) return
    await window.electronAPI.config.setAmbientVolume(parsed)
    if (parsed !== null) {
      await window.electronAPI.lwe.hotswapSettings({ ambientVolume: parsed })
    }
    setAmbientVolumeSaved(true)
    setTimeout(() => setAmbientVolumeSaved(false), 2000)
  }

  async function handleSaveDefaultAudioSensitivity() {
    const percent = parseInt(defaultAudioSensitivity, 10)
    if (isNaN(percent) || percent < 0 || percent > 200) return
    const multiplier = percent / 100
    await window.electronAPI.config.setDefaultAudioSensitivity(multiplier)
    // Push live so a currently running instance updates without a relaunch - "*" is the engine's
    // wildcard default, per-wallpaper overrides still win over it.
    await window.electronAPI.lwe.hotswapSettings({ audioSensitivity: { '*': multiplier } })
    setDefaultAudioSensitivitySaved(true)
    setTimeout(() => setDefaultAudioSensitivitySaved(false), 2000)
  }

  async function saveAutostart(patch: {
    enabled?: boolean
    minimized?: boolean
    playlistId?: string | null
  }) {
    const enabled = patch.enabled ?? autostartEnabled
    const minimized = patch.minimized ?? autostartMinimized
    const playlistId = 'playlistId' in patch ? patch.playlistId! : autostartPlaylistId
    setAutostartEnabledState(enabled)
    setAutostartMinimized(minimized)
    setAutostartPlaylistId(playlistId)
    await window.electronAPI.config.setAutostart(enabled, minimized, playlistId)
  }

  const isBusy = lweInstalling || depsInstalling || uninstalling

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-semibold text-gray-100">Settings</h2>

      <div className="mt-6 max-w-lg space-y-8">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Workshop folder
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Path to the Wallpaper Engine workshop content directory.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={workshopPath}
              onChange={(e) => {
                setWorkshopPath(e.target.value)
                setSaved(false)
              }}
              className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={handleBrowse}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
            >
              <FolderOpen size={16} />
              Browse
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={!workshopPath}
            className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={14} />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Backup folder
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Local folder for keeping your own copies of wallpapers, independent of the
            Steam Workshop. Point this at an existing folder to load wallpapers already
            backed up there.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={backupPath}
              onChange={(e) => {
                setBackupPath(e.target.value)
                setBackupSaved(false)
              }}
              placeholder="Not configured"
              className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={handleBrowseBackup}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
            >
              <FolderOpen size={16} />
              Browse
            </button>
          </div>
          <button
            onClick={handleSaveBackup}
            disabled={!backupPath}
            className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={14} />
            {backupSaved ? 'Saved!' : 'Save'}
          </button>

          <label className="mt-4 flex items-center gap-3 cursor-pointer">
            <button
              onClick={handleAutoUnsubscribeToggle}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                autoUnsubscribeAfterBackup ? 'bg-indigo-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  autoUnsubscribeAfterBackup ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="flex items-center gap-2 text-sm text-gray-300">
              <Archive size={16} />
              Unsubscribe from Steam Workshop after backup
            </span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Wallpaper Engine Options
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Launch options passed to linux-wallpaperengine.
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Default FPS limit</label>
              <p className="text-xs text-gray-600 mb-2">
                Limits frame rate for all wallpapers. Leave empty for unlimited. Can be overridden per wallpaper.
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={1}
                  max={360}
                  placeholder="unlimited"
                  value={defaultFps}
                  onChange={(e) => { setDefaultFps(e.target.value); setFpsSaved(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveDefaultFps()}
                  className="w-28 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSaveDefaultFps}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  <Save size={14} />
                  {fpsSaved ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>
            <div>
              <label className="mt-1 flex items-center gap-3 cursor-pointer">
                <button
                  onClick={handleRecommendedFpsToggle}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    recommendedFpsEnabled ? 'bg-indigo-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      recommendedFpsEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="flex items-center gap-2 text-sm text-gray-300">
                  <Film size={16} />
                  Recommended video settings
                </span>
              </label>
              <p className="mt-2 text-xs text-gray-600">
                Reads each video wallpaper's actual frame rate and launches it at that FPS
                instead of the default limit, which fixes stutter on videos that don't
                match it. Wallpapers with a manual FPS override are unaffected. Requires
                ffprobe (part of ffmpeg).
              </p>
            </div>
            <div>
              <label className="mt-1 flex items-center gap-3 cursor-pointer">
                <button
                  onClick={handleRecommendedWebFpsToggle}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    recommendedWebFpsEnabled ? 'bg-indigo-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      recommendedWebFpsEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="flex items-center gap-2 text-sm text-gray-300">
                  <Globe size={16} />
                  Recommended web wallpaper settings
                </span>
              </label>
              <p className="mt-2 text-xs text-gray-600">
                Launches web (CEF-based) wallpapers at 60 FPS instead of the default limit.
                The page produces a new frame each time the engine presents one (up to
                about 60 per second), so a lower default makes HTML/Live2D wallpapers
                animate at that lower rate. Wallpapers with a manual FPS override are
                unaffected.
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Reset per-wallpaper FPS</label>
              <p className="text-xs text-gray-600 mb-2">
                Remove all per-wallpaper FPS overrides so they use the default.
              </p>
              {resetFpsConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Are you sure?</span>
                  <button
                    onClick={handleResetFpsOverrides}
                    className="rounded-lg bg-red-600/80 px-3 py-1.5 text-xs text-white hover:bg-red-600"
                  >
                    Yes, reset all
                  </button>
                  <button
                    onClick={() => setResetFpsConfirm(false)}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleResetFpsOverrides}
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
                >
                  <RotateCcw size={14} />
                  Reset all FPS overrides
                </button>
              )}
              {resetFpsMsg && (
                <p className="mt-2 text-xs text-gray-400">{resetFpsMsg}</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Audio
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Global audio behavior for all wallpapers, across every monitor.
          </p>
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Play sound only on</label>
              <p className="text-xs text-gray-600 mb-2">
                Restricts sound to a single monitor so wallpapers on other screens stay silent,
                even if they have their own sound.
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={audioScreen ?? ''}
                  onChange={(e) => handleAudioScreenChange(e.target.value || null)}
                  className="w-56 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 [&>option]:bg-[#1a1a1a] [&>option]:text-gray-200"
                >
                  <option value="">All screens (default)</option>
                  {screens.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleRefreshScreens}
                  disabled={screensRefreshing}
                  className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 outline-none hover:bg-white/10 disabled:opacity-50"
                  title="Redetect connected screens"
                >
                  {screensRefreshing ? '...' : 'Redetect'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ambient wallpaper volume</label>
              <p className="text-xs text-gray-600 mb-2">
                Separate volume (0-128) for non-video wallpapers (scene sound effects/music and
                web wallpapers), instead of each wallpaper's own volume. Video wallpapers are
                unaffected. Leave empty to use each wallpaper's normal volume. Web wallpapers only
                support 0 (muted) vs. any other value (normal volume).
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={0}
                  max={128}
                  placeholder="same as wallpaper volume"
                  value={ambientVolume}
                  onChange={(e) => { setAmbientVolume(e.target.value); setAmbientVolumeSaved(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveAmbientVolume()}
                  className="w-44 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSaveAmbientVolume}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  <Save size={14} />
                  {ambientVolumeSaved ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Default audio reactivity sensitivity</label>
              <p className="text-xs text-gray-600 mb-2">
                Default strength (0-200%) for wallpaper elements that pulse to music, applied to
                every audio-reactive object that doesn't have its own override set in a
                wallpaper's detail panel. 0% locks all of them (no pulse), 100% is each
                wallpaper's original authored behavior.
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={defaultAudioSensitivity}
                  onChange={(e) => { setDefaultAudioSensitivity(e.target.value); setDefaultAudioSensitivitySaved(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveDefaultAudioSensitivity()}
                  className="w-44 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-500">%</span>
                <button
                  onClick={handleSaveDefaultAudioSensitivity}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  <Save size={14} />
                  {defaultAudioSensitivitySaved ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Wallpaper Engine Config
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Import your old Wallpaper Engine config.json to restore folders and
            playlists. All paths will be automatically updated to your current workshop
            folder.
          </p>
          <button
            onClick={handleImportConfig}
            className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
          >
            <Upload size={14} />
            Import config.json
          </button>
          {importStatus && (
            <p className="mt-2 text-xs text-gray-400">{importStatus}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            linux-wallpaperengine
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Required for animated/scene wallpapers on Linux. Renders Wallpaper Engine
            scenes directly on your desktop.
          </p>

          <div className="mt-3 space-y-2">
            <label className="block text-xs text-gray-400">Source repository</label>
            <p className="text-xs text-gray-600">
              Build from a custom fork instead of the official repo. Accepts a git URL or a
              local path. Leave empty to use the official repository.
            </p>
            <input
              type="text"
              value={lweRepoUrl}
              onChange={(e) => { setLweRepoUrl(e.target.value); setRepoSaved(false) }}
              placeholder={defaultLweRepo}
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={lweRepoBranch}
                onChange={(e) => { setLweRepoBranch(e.target.value); setRepoSaved(false) }}
                placeholder="branch (default)"
                className="w-44 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleSaveRepo}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
              >
                <Save size={14} />
                {repoSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
            <label className="block text-xs text-gray-400">Extra cmake arguments</label>
            <p className="text-xs text-gray-600">
              Passed to cmake when configuring the build, e.g. -DENABLE_KDE_EXPERIMENTAL_FEATURES=ON
            </p>
            <input
              type="text"
              value={lweCmakeArgs}
              onChange={(e) => { setLweCmakeArgs(e.target.value); setRepoSaved(false) }}
              placeholder="-DENABLE_KDE_EXPERIMENTAL_FEATURES=ON"
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          {lweStatus === null ? (
            <p className="mt-3 text-xs text-gray-500">Checking...</p>
          ) : lweStatus.installed ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle size={16} />
                Installed
              </div>
              {lweStatus.path && (
                <p className="text-xs text-gray-500">Path: {lweStatus.path}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleInstallLwe}
                  disabled={isBusy}
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
                >
                  {lweInstalling ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {lweInstalling ? 'Building...' : 'Rebuild & install'}
                </button>
                <button
                  onClick={handleUninstallLwe}
                  disabled={isBusy}
                  className="flex items-center gap-2 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                >
                  {uninstalling ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {uninstalling ? 'Uninstalling...' : 'Uninstall'}
                </button>
              </div>
              {uninstallMsg && (
                <p className="text-xs text-gray-400">{uninstallMsg}</p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-sm text-yellow-400">
                <XCircle size={16} />
                Not installed
              </div>

              {distro && distro !== 'unknown' && (
                <p className="text-xs text-gray-500">
                  Detected: {DISTRO_LABELS[distro]}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleInstallDeps}
                  disabled={isBusy || !distro || distro === 'unknown'}
                  title={
                    !distro || distro === 'unknown'
                      ? 'Could not detect your distro. Install dependencies manually.'
                      : undefined
                  }
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
                >
                  {depsInstalling ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Package size={14} />
                  )}
                  {depsInstalling ? 'Installing deps...' : 'Install build dependencies'}
                </button>

                <button
                  onClick={handleInstallLwe}
                  disabled={isBusy}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {lweInstalling ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {lweInstalling ? 'Building...' : 'Build & install'}
                </button>
              </div>

              <p className="text-xs text-gray-600">
                First install build dependencies for your distro, then build & install
                linux-wallpaperengine from GitHub. Both steps require sudo.
              </p>

              {distro === 'unknown' && (
                <p className="text-xs text-yellow-500/80">
                  Could not detect your distro. Please install build dependencies
                  manually (cmake, OpenGL, SDL2, FFmpeg, MPV, GLFW, GLEW, FFTW, PulseAudio dev packages).
                </p>
              )}
            </div>
          )}

          {lweProgress && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                {lweProgress.stage === 'error' ? (
                  <XCircle size={14} className="text-red-400 shrink-0" />
                ) : lweProgress.stage === 'done' ? (
                  <CheckCircle size={14} className="text-green-400 shrink-0" />
                ) : (
                  <Loader2 size={14} className="animate-spin text-indigo-400 shrink-0" />
                )}
                <p className="text-xs text-gray-300 whitespace-pre-wrap break-all">{lweProgress.message}</p>
              </div>
              {lweProgress.stage !== 'error' && lweProgress.stage !== 'done' && (
                <div className="h-1.5 w-full rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${lweProgress.percentage}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={handleKillAllLwe}
              disabled={killingLwe}
              className="flex items-center gap-2 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30 disabled:opacity-50"
            >
              {killingLwe ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Skull size={14} />
              )}
              {killingLwe ? 'Killing...' : 'Kill all linux-wallpaperengine processes'}
            </button>
            <p className="mt-1 text-xs text-gray-600">
              Force-kills every running instance, including ones not launched by WE Manager.
            </p>
            {killMsg && (
              <p className="mt-2 text-xs text-gray-400">{killMsg}</p>
            )}

            <label className="mt-3 flex items-center gap-3 cursor-pointer">
              <button
                onClick={handleKillLweOnQuitToggle}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  killLweOnQuit ? 'bg-indigo-600' : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    killLweOnQuit ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="flex items-center gap-2 text-sm text-gray-300">
                <Skull size={16} />
                Kill all linux-wallpaperengine processes when WE Manager quits
              </span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Effects &amp; Animation
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Freezes every wallpaper's scene time - scripts, particles, effects and puppet meshes all stop
            advancing and stay on whatever frame they were on. Only applies to wallpapers played after enabling
            this; a wallpaper already running needs to be replayed to pick it up. To disable a specific effect
            (bloom, fog, glow, etc) on one wallpaper instead of freezing everything everywhere, use the Effects
            panel on that wallpaper's detail page.
          </p>
          <label className="mt-3 flex items-center gap-3 cursor-pointer">
            <button
              onClick={handleDisableAnimationsToggle}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                disableAnimations ? 'bg-indigo-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  disableAnimations ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="flex items-center gap-2 text-sm text-gray-300">
              <Pause size={16} />
              Disable wallpaper animation
            </span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Troubleshooting
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Freezes puppet (.mdl) meshes - rigged 2D character parts like eyes, hair, or limbs - at their bind
            pose instead of animating them. Only applies to wallpapers played after enabling this; a wallpaper
            already running needs to be replayed to pick it up.
          </p>
          <label className="mt-3 flex items-center gap-3 cursor-pointer">
            <button
              onClick={handleDisablePuppetAnimationToggle}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                disablePuppetAnimation ? 'bg-indigo-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  disablePuppetAnimation ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="flex items-center gap-2 text-sm text-gray-300">
              <Bug size={16} />
              Disable puppet mesh animation
            </span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Desktop Icons
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Show desktop icons on top of the animated wallpaper. Uses a transparent overlay
            that reads your KDE Folder View layout. Clicks pass through to the desktop underneath.
          </p>
          <label className="mt-3 flex items-center gap-3 cursor-pointer">
            <button
              onClick={handleDesktopIconsToggle}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                desktopIconsEnabled ? 'bg-indigo-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  desktopIconsEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="flex items-center gap-2 text-sm text-gray-300">
              <Monitor size={16} />
              {desktopIconsEnabled ? 'Desktop icons visible' : 'Desktop icons hidden'}
            </span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            System Tray &amp; Startup
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Keep WE Manager running in the background and optionally launch it automatically.
          </p>

          <label className="mt-3 flex items-center gap-3 cursor-pointer">
            <button
              onClick={handleTrayToggle}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                trayEnabled ? 'bg-indigo-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  trayEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="flex items-center gap-2 text-sm text-gray-300">
              <LayoutGrid size={16} />
              Enable system tray (closing the window minimizes to tray instead of quitting)
            </span>
          </label>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                onClick={() => autostartSupported && saveAutostart({ enabled: !autostartEnabled })}
                disabled={!autostartSupported}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
                  autostartEnabled ? 'bg-indigo-600' : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    autostartEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="flex items-center gap-2 text-sm text-gray-300">
                <Power size={16} />
                Launch on system startup
              </span>
            </label>
            {!autostartSupported && (
              <p className="text-xs text-yellow-500/80">
                Only available in a packaged build (AppImage/deb), not in development mode.
              </p>
            )}

            <label className="flex items-center gap-3 cursor-pointer pl-12">
              <button
                onClick={() =>
                  trayEnabled && autostartEnabled && saveAutostart({ minimized: !autostartMinimized })
                }
                disabled={!trayEnabled || !autostartEnabled}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
                  autostartMinimized ? 'bg-indigo-600' : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    autostartMinimized ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-300">
                Start minimized to tray
                {!trayEnabled && <span className="text-gray-600"> (enable system tray first)</span>}
              </span>
            </label>

            <div className="pl-12">
              <label className="block text-xs text-gray-400 mb-1">Auto-play playlist on startup</label>
              <select
                value={autostartPlaylistId ?? ''}
                onChange={(e) => saveAutostart({ playlistId: e.target.value || null })}
                className="w-56 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 [&>option]:bg-[#1a1a1a] [&>option]:text-gray-200"
              >
                <option value="">None</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Steam Integration
          </label>
          <p className="mt-1 text-xs text-gray-600">
            How WE Manager identifies itself to Steam. Takes effect after restarting WE Manager.
          </p>

          <div className="mt-3 flex rounded-lg overflow-hidden text-sm w-fit">
            <button
              onClick={() => handleSteamIdentityChange('wallpaper-engine')}
              className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                steamIdentity === 'wallpaper-engine'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:text-gray-200'
              }`}
            >
              <Shield size={14} />
              Steam app (Wallpaper Engine)
            </button>
            <button
              onClick={() => handleSteamIdentityChange('standalone')}
              className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                steamIdentity === 'standalone'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:text-gray-200'
              }`}
            >
              <Shield size={14} />
              Own app (standalone)
            </button>
          </div>
          {steamIdentitySaved && (
            <p className="mt-2 text-xs text-green-400">Saved - restart WE Manager for this to take effect.</p>
          )}
          <p className="mt-2 text-xs text-gray-600">
            {steamIdentity === 'wallpaper-engine' ? (
              <>
                Registers this process with Steam under Wallpaper Engine's own app id. Steam
                considers WE Manager to be Wallpaper Engine itself, so it will offer to close it
                when you log out or shut down Steam - the same as the official Windows app would
                if you ran it standalone.
              </>
            ) : (
              <>
                Registers this process under a neutral, unrelated Steam app id instead, so Steam
                doesn't associate WE Manager with Wallpaper Engine and won't try to close it on
                logout. Workshop browsing, subscribing and voting still target Wallpaper Engine's
                own workshop either way. This mode is less tested than the default - if
                subscribing or voting misbehaves, switch back.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
