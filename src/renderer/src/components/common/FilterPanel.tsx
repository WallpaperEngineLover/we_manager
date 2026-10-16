import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { WE_RESOLUTION_GROUPS, setGroupSelected, type FilterItem } from '../../constants/weFilters'
import { toggle } from '../../utils/array'
import { t, tagLabel } from '../../i18n'


export function FilterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="w-52 flex-shrink-0 space-y-3 overflow-y-auto border-r border-fg/5 bg-pane px-3 py-3">
      {children}
    </div>
  )
}

export function CheckItem({
  label,
  checked,
  indeterminate = false,
  nested = false,
  count,
  title,
  onChange
}: {
  label: string
  checked: boolean
  indeterminate?: boolean
  // drawn as a CheckGroup branch
  nested?: boolean
  count?: number
  title?: string
  onChange: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <label
      title={title}
      className={clsx(
        'relative flex cursor-pointer items-center gap-2 py-0.5 text-xs text-gray-400 hover:text-gray-200',
        nested &&
          'before:absolute before:-left-2.5 before:top-1/2 before:w-2 before:border-t before:border-fg/15 after:absolute after:-left-2.5 after:top-0 after:h-full after:border-l after:border-fg/15 last:after:h-1/2'
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="cursor-pointer accent-accent-500"
      />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-[11px] text-gray-600">{count}</span>}
    </label>
  )
}

// children of a CheckItem
export function CheckGroup({ children }: { children: ReactNode }) {
  return <div className="ml-[6px] pl-2.5">{children}</div>
}

export function AllNoneButtons({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <div className="flex gap-2">
      <button onClick={onAll} className="text-[10px] text-gray-600 hover:text-gray-400">{t('filters.all')}</button>
      <button onClick={onNone} className="text-[10px] text-gray-600 hover:text-gray-400">{t('filters.none')}</button>
    </div>
  )
}

export function FilterSection({
  title,
  children,
  defaultOpen = true,
  activeCount = 0,
  onAll,
  onNone
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  activeCount?: number
  onAll?: () => void
  onNone?: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1 text-left">{title}</span>
        {activeCount > 0 && <span className="rounded-full bg-accent-600/40 px-1.5 text-accent-300">{activeCount}</span>}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 pl-1">
          {onAll && onNone && (
            <div className="pb-0.5">
              <AllNoneButtons onAll={onAll} onNone={onNone} />
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

export function TagFilterSection({
  title,
  options,
  selected,
  activeCount = selected.length,
  defaultOpen,
  onChange
}: {
  title: string
  options: FilterItem[]
  selected: string[]
  activeCount?: number
  defaultOpen?: boolean
  onChange: (tags: string[]) => void
}) {
  return (
    <FilterSection
      title={title}
      defaultOpen={defaultOpen}
      activeCount={activeCount}
      onAll={() => onChange(options.map((i) => i.tag))}
      onNone={() => onChange([])}
    >
      {options.map((item) => (
        <CheckItem
          key={item.tag}
          label={tagLabel(item.label)}
          checked={selected.includes(item.tag)}
          onChange={() => onChange(toggle(selected, item.tag))}
        />
      ))}
    </FilterSection>
  )
}

export function ResolutionFilterSection({
  selected,
  allTags,
  activeCount = selected.length,
  counts,
  onChange
}: {
  selected: string[]
  allTags: string[]
  activeCount?: number
  counts?: Map<string, number>
  onChange: (resolutions: string[]) => void
}) {
  return (
    <FilterSection
      title={t('filters.resolution')}
      defaultOpen={false}
      activeCount={activeCount}
      onAll={() => onChange(allTags)}
      onNone={() => onChange([])}
    >
      {WE_RESOLUTION_GROUPS.map((group) => (
        <div key={group.label} className="mt-2">
          <div className="mb-0.5 flex items-center justify-between pl-0.5">
            <p className="text-xs text-gray-600">{tagLabel(group.label)}</p>
            <AllNoneButtons
              onAll={() => onChange(setGroupSelected(selected, group, true))}
              onNone={() => onChange(setGroupSelected(selected, group, false))}
            />
          </div>
          {group.items.map((item) => (
            <CheckItem
              key={item.tag}
              label={tagLabel(item.label)}
              checked={selected.includes(item.tag)}
              count={counts ? (counts.get(item.tag) ?? 0) : undefined}
              onChange={() => onChange(toggle(selected, item.tag))}
            />
          ))}
        </div>
      ))}
    </FilterSection>
  )
}
