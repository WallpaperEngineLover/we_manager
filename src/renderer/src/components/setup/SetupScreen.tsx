import { useState } from 'react'
import { FolderOpen, Check, Upload, FilePlus, Loader2, ArrowRight } from 'lucide-react'

interface SetupScreenProps {
  defaultPath: string
  onComplete: (path: string) => void
}

export default function SetupScreen({ defaultPath, onComplete }: SetupScreenProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedPath, setSelectedPath] = useState(defaultPath)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  async function handleBrowse() {
    const picked = await window.electronAPI.config.pickFolder()
    if (picked) setSelectedPath(picked)
  }

  async function handleConfirmPath() {
    setSaving(true)
    await window.electronAPI.config.setWorkshopPath(selectedPath)
    setSaving(false)
    setStep(2)
  }

  async function handleImportConfig() {
    setImporting(true)
    setImportResult(null)
    try {
      const filePath = await window.electronAPI.config.pickFile()
      if (!filePath) {
        setImporting(false)
        return
      }
      const result = await window.electronAPI.config.importWE(filePath)
      setImportResult(
        `Imported ${result.folders} folders and ${result.playlists} playlists. All paths updated automatically.`
      )
    } catch (err) {
      setImportResult(`Import failed: ${(err as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleCreateFresh() {
    setImporting(true)
    try {
      await window.electronAPI.config.createFresh()
      setImportResult('Created a fresh configuration.')
    } catch (err) {
      setImportResult(`Failed: ${(err as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleFinish() {
    onComplete(selectedPath)
  }

  const platformHint =
    navigator.userAgent.includes('Win')
      ? 'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960'
      : '~/.steam/steam/steamapps/workshop/content/431960'

  return (
    <div className="flex h-full items-center justify-center bg-[#0f0f0f]">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#1a1a1a] p-8">
        <h1 className="text-xl font-semibold text-gray-100">Welcome to WE Manager</h1>

        {/* Step indicator */}
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
          <span className={step === 1 ? 'text-indigo-400' : 'text-gray-500'}>
            1. Workshop folder
          </span>
          <ArrowRight size={10} />
          <span className={step === 2 ? 'text-indigo-400' : 'text-gray-500'}>
            2. Import config
          </span>
        </div>

        {step === 1 && (
          <>
            <p className="mt-4 text-sm text-gray-400">
              Select your Wallpaper Engine workshop folder so the app can find your
              wallpapers.
            </p>

            <div className="mt-6">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                Workshop folder
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
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
              <p className="mt-1 text-xs text-gray-600">
                Typically{' '}
                <span className="font-mono">{platformHint}</span>
              </p>
            </div>

            <button
              onClick={handleConfirmPath}
              disabled={!selectedPath || saving}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              Next
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="mt-4 text-sm text-gray-400">
              Do you have an existing Wallpaper Engine{' '}
              <span className="font-mono text-gray-300">config.json</span>? Importing
              it will bring over your folders and playlists with all paths automatically
              fixed.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleImportConfig}
                disabled={importing}
                className="flex items-center gap-3 rounded-lg border border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                <Upload size={20} className="text-indigo-400" />
                <div>
                  <p className="text-sm font-medium text-gray-200">
                    Import existing config.json
                  </p>
                  <p className="text-xs text-gray-500">
                    From your old Wallpaper Engine installation
                  </p>
                </div>
              </button>

              <button
                onClick={handleCreateFresh}
                disabled={importing}
                className="flex items-center gap-3 rounded-lg border border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                <FilePlus size={20} className="text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-200">Start fresh</p>
                  <p className="text-xs text-gray-500">
                    Create a new empty configuration
                  </p>
                </div>
              </button>
            </div>

            {importResult && (
              <div className="mt-4 rounded-lg bg-white/5 px-4 py-3 text-xs text-gray-300">
                {importResult}
              </div>
            )}

            <button
              onClick={handleFinish}
              disabled={importing}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Check size={16} />
              {importResult ? 'Done' : 'Skip & Finish'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
