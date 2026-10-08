import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderPlus, HardDrive, Loader2, X } from 'lucide-react'
import type { ExtraLibrary } from '@shared/types'
import { useConfig } from '../../hooks/queries'

function folderName(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

export default function LibraryFoldersSettings() {
  const queryClient = useQueryClient()
  const libraries = useConfig()?.extraLibraries ?? []
  const [names, setNames] = useState<Record<string, string>>({})
  const [scanning, setScanning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function save(next: ExtraLibrary[]) {
    await window.electronAPI.config.setExtraLibraries(next)
    await queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  async function saveAndScan(next: ExtraLibrary[]) {
    await save(next)
    setScanning(true)
    setStatus(null)
    try {
      const result = await window.electronAPI.library.scan()
      setStatus(`Library rescanned: ${result.imported} imported, ${result.removed} removed.`)
    } catch (err) {
      setStatus(`Scan failed: ${(err as Error).message}`)
    } finally {
      setScanning(false)
      queryClient.invalidateQueries({ queryKey: ['library'] })
      queryClient.invalidateQueries({ queryKey: ['library-tags'] })
    }
  }

  async function handleAdd() {
    const picked = await window.electronAPI.config.pickFolder('Select a folder of wallpapers')
    if (!picked || libraries.some((l) => l.path === picked)) return
    await saveAndScan([...libraries, { path: picked, name: folderName(picked) }])
  }

  async function handleRename(library: ExtraLibrary) {
    const name = names[library.path]?.trim()
    setNames((prev) => {
      const next = { ...prev }
      delete next[library.path]
      return next
    })
    if (!name || name === library.name) return
    await save(libraries.map((l) => (l.path === library.path ? { ...l, name } : l)))
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
        Extra library folders
      </label>
      <p className="mt-1 text-xs text-gray-600">
        Folders on other disks holding wallpaper folders (each with a project.json), like a copied
        workshop folder. They show up in the library as "Local", and selected wallpapers can be copied
        or moved into them from the right-click menu. When the same wallpaper is also in the workshop
        or backup folder, that copy is used. Wallpapers on a drive that is not mounted stay in the
        library until the folder is removed here.
      </p>
      {libraries.length > 0 && (
        <ul className="mt-2 space-y-1">
          {libraries.map((l) => (
            <li key={l.path} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200">
              <HardDrive size={14} className="shrink-0 text-gray-500" />
              <input
                type="text"
                value={names[l.path] ?? l.name}
                onChange={(e) => setNames((prev) => ({ ...prev, [l.path]: e.target.value }))}
                onBlur={() => handleRename(l)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                title="Library name"
                className="w-32 shrink-0 rounded bg-transparent px-1 text-gray-100 outline-none focus:bg-white/5 focus:ring-1 focus:ring-indigo-500"
              />
              <span className="flex-1 truncate text-xs text-gray-500" title={l.path}>
                {l.path}
              </span>
              <button
                onClick={() => saveAndScan(libraries.filter((x) => x.path !== l.path))}
                disabled={scanning}
                title="Remove from the library"
                className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-200 disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={handleAdd}
        disabled={scanning}
        className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
      >
        {scanning ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
        {scanning ? 'Scanning...' : 'Add folder'}
      </button>
      {status && <p className="mt-2 text-xs text-gray-500">{status}</p>}
    </div>
  )
}
