import { useState, useEffect } from 'react'
import { FolderOpen, Save, Upload } from 'lucide-react'

export default function SettingsView() {
  const [workshopPath, setWorkshopPath] = useState('')
  const [saved, setSaved] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.config.get().then((cfg) => {
      setWorkshopPath(cfg.workshopPath ?? cfg.defaultWorkshopPath)
    })
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

  return (
    <div className="p-6">
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
      </div>
    </div>
  )
}
