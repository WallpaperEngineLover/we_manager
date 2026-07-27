import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Plus, Check } from 'lucide-react'

interface WallpaperPickerModalProps {
  excludeIds: Set<string>
  onAdd: (wallpaperIds: string[]) => void
  onClose: () => void
}

export default function WallpaperPickerModal({
  excludeIds,
  onAdd,
  onClose
}: WallpaperPickerModalProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: wallpapers = [], isLoading } = useQuery({
    queryKey: ['library', { sortBy: 'title', sortDir: 'asc' }],
    queryFn: () => window.electronAPI.library.getAll({ sortBy: 'title', sortDir: 'asc' })
  })

  const available = useMemo(
    () => wallpapers.filter((w) => !excludeIds.has(w.id)),
    [wallpapers, excludeIds]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return available
    const q = search.toLowerCase()
    return available.filter((w) => w.title.toLowerCase().includes(q))
  }, [available, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAdd() {
    if (selected.size === 0) return
    onAdd(Array.from(selected))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div className="flex h-full max-h-[600px] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#161616] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-100">Add wallpapers to playlist</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-white/5 px-4 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus
              type="text"
              placeholder="Search library..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-white/5 py-1.5 pl-8 pr-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading && <p className="p-4 text-center text-xs text-gray-500">Loading...</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-gray-500">No wallpapers found.</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((w) => {
              const isSelected = selected.has(w.id)
              const previewSrc = w.previewLocal ? `wallpaper://${w.previewLocal}` : w.previewUrl
              return (
                <button
                  key={w.id}
                  onClick={() => toggle(w.id)}
                  className={`group relative overflow-hidden rounded-lg bg-[#1f1f1f] text-left transition-all ${
                    isSelected ? 'ring-2 ring-indigo-500' : 'hover:ring-1 hover:ring-indigo-500/50'
                  }`}
                >
                  <div className="aspect-video bg-[#111]">
                    {previewSrc ? (
                      <img
                        src={previewSrc}
                        alt={w.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-600">
                        No preview
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 p-2">
                    <span className="truncate text-xs text-gray-300" title={w.title}>
                      {w.title}
                    </span>
                    {isSelected && <Check size={12} className="shrink-0 text-indigo-400" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
          <span className="text-xs text-gray-500">{selected.size} selected</span>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus size={14} />
            Add to playlist
          </button>
        </div>
      </div>
    </div>
  )
}
