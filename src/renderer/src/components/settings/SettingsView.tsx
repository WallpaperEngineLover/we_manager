import { useState, useEffect } from 'react'
import { FolderOpen, Save, Upload, Download, CheckCircle, XCircle, Loader2, Package, Trash2 } from 'lucide-react'
import type { LweStatus, LweInstallProgress, LinuxDistro } from '../../../../shared/types'

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

  // linux-wallpaperengine state
  const [lweStatus, setLweStatus] = useState<LweStatus | null>(null)
  const [lweInstalling, setLweInstalling] = useState(false)
  const [lweProgress, setLweProgress] = useState<LweInstallProgress | null>(null)
  const [distro, setDistro] = useState<LinuxDistro | null>(null)
  const [depsInstalling, setDepsInstalling] = useState(false)
  const [uninstalling, setUninstalling] = useState(false)
  const [uninstallMsg, setUninstallMsg] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.config.get().then((cfg) => {
      setWorkshopPath(cfg.workshopPath ?? cfg.defaultWorkshopPath)
    })
    window.electronAPI.lwe.status().then(setLweStatus)
    window.electronAPI.lwe.detectDistro().then(setDistro)
  }, [])

  // Listen for install progress events
  useEffect(() => {
    const unsub = window.electronAPI.on.lweInstallProgress((progress) => {
      setLweProgress(progress)
      if (progress.stage === 'done' || progress.stage === 'error') {
        setLweInstalling(false)
        setDepsInstalling(false)
        window.electronAPI.lwe.status().then(setLweStatus)
      }
    })
    return unsub
  }, [])

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

  async function handleInstallDeps() {
    setDepsInstalling(true)
    setLweProgress({ stage: 'installing-deps', message: 'Starting dependency installation...', percentage: 0 })
    try {
      await window.electronAPI.lwe.installDeps()
    } catch (err) {
      setLweProgress({
        stage: 'error',
        message: `Dependency installation failed: ${(err as Error).message}`,
        percentage: 0
      })
      setDepsInstalling(false)
    }
  }

  async function handleInstallLwe() {
    setLweInstalling(true)
    setLweProgress({ stage: 'cloning', message: 'Starting installation...', percentage: 0 })
    try {
      await window.electronAPI.lwe.install()
    } catch (err) {
      setLweProgress({
        stage: 'error',
        message: `Installation failed: ${(err as Error).message}`,
        percentage: 0
      })
      setLweInstalling(false)
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

  const isBusy = lweInstalling || depsInstalling || uninstalling

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-semibold text-gray-100">Settings</h2>

      <div className="mt-6 max-w-lg space-y-8">
        {/* Workshop path */}
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

        {/* Import WE config */}
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

        {/* linux-wallpaperengine */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            linux-wallpaperengine
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Required for animated/scene wallpapers on Linux. Renders Wallpaper Engine
            scenes directly on your desktop.
          </p>

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
                {/* Install build deps */}
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

                {/* Build & install lwe */}
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

          {/* Install progress */}
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
        </div>
      </div>
    </div>
  )
}
