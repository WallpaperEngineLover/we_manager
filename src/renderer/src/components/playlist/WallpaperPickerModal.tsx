import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { PickerCard, PickerFrame, PickerGrid, PickerSearch } from '../common/PickerParts'
import { t } from '../../i18n'

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
    <PickerFrame title={t('picker.title')} onClose={onClose}>
      <div className="flex border-b border-fg/5 px-4 py-2">
        <PickerSearch value={search} onChange={setSearch} />
      </div>

      <PickerGrid loading={isLoading} empty={filtered.length === 0}>
        {filtered.map((w) => (
          <PickerCard
            key={w.id}
            wallpaper={w}
            selected={selected.has(w.id)}
            onClick={() => { toggle(w.id) }}
            label={
              <span className="truncate text-xs text-gray-300" title={w.title}>
                {w.title}
              </span>
            }
          />
        ))}
      </PickerGrid>

      <div className="flex items-center justify-between border-t border-fg/5 px-4 py-3">
        <span className="text-xs text-gray-500">{t('picker.selected', { count: selected.size })}</span>
        <button
          onClick={handleAdd}
          disabled={selected.size === 0}
          className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          <Plus size={14} />
          {t('picker.add')}
        </button>
      </div>
    </PickerFrame>
  )
}
