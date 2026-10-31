import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import clsx from 'clsx'
import { usePersistentState } from '../../hooks/usePersistentState'
import { t } from '../../i18n'

const DRAG_TYPE = 'text/we-reorder'

// dragover can't read the data, so the item being dragged is kept here
let dragging: { group: string; id: string } | null = null

function loadOrder(stored: unknown): string[] {
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
}

export function useReorder(storageKey: string, ids: string[]) {
  const [saved, setSaved] = usePersistentState<string[]>(storageKey, [], loadOrder)
  const idsKey = ids.join('\n')

  const order = useMemo(() => {
    const present = new Set(idsKey.split('\n'))
    const head = saved.filter((id) => present.has(id))
    const seen = new Set(head)
    return [...head, ...idsKey.split('\n').filter((id) => id && !seen.has(id))]
  }, [saved, idsKey])

  function move(fromId: string, toId: string, after: boolean) {
    if (fromId === toId) return
    const rest = order.filter((id) => id !== fromId)
    rest.splice(rest.indexOf(toId) + (after ? 1 : 0), 0, fromId)
    const shown = new Set(order)
    const queue = [...rest]
    const next = saved.map((id) => (shown.has(id) ? queue.shift() ?? id : id))
    setSaved([...next, ...queue])
  }

  function sortItems<T>(items: T[], idOf: (item: T) => string): T[] {
    const byId = new Map(items.map((item) => [idOf(item), item]))
    return order.flatMap((id) => byId.get(id) ?? [])
  }

  return { order, move, sortItems }
}

interface ReorderableProps {
  group: string
  id: string
  onMove: (fromId: string, toId: string, after: boolean) => void
  axis?: 'y' | 'x'
  handle?: boolean
  disabled?: boolean
  className?: string
  children: ReactNode
}

export function Reorderable({ group, id, onMove, axis = 'y', handle = false, disabled = false, className, children }: ReorderableProps) {
  const [armed, setArmed] = useState(false)
  const [edge, setEdge] = useState<'before' | 'after' | null>(null)

  useEffect(() => {
    if (!armed) return
    const release = () => { setArmed(false) }
    window.addEventListener('mouseup', release, { once: true })
    return () => { window.removeEventListener('mouseup', release) }
  }, [armed])

  function accepts(): boolean {
    return dragging !== null && dragging.group === group && dragging.id !== id
  }

  return (
    <div
      draggable={!disabled && (!handle || armed)}
      onDragStart={(e) => {
        if (e.target !== e.currentTarget) return
        dragging = { group, id }
        e.dataTransfer.setData(DRAG_TYPE, id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => {
        dragging = null
        setArmed(false)
        setEdge(null)
      }}
      onDragOver={(e) => {
        if (!accepts()) return
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const after = axis === 'y' ? e.clientY > rect.top + rect.height / 2 : e.clientX > rect.left + rect.width / 2
        setEdge(after ? 'after' : 'before')
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEdge(null)
      }}
      onDrop={(e) => {
        if (!accepts() || !dragging) return
        e.preventDefault()
        onMove(dragging.id, id, edge === 'after')
        setEdge(null)
      }}
      className={clsx('group/reorder relative', className)}
    >
      {handle && !disabled && (
        <span
          title={t('common.dragReorder')}
          onMouseDown={() => { setArmed(true) }}
          className="absolute -left-3 top-1.5 z-10 cursor-grab text-gray-600 opacity-0 transition-opacity hover:text-gray-300 group-hover/reorder:opacity-100"
        >
          <GripVertical size={12} />
        </span>
      )}
      {children}
      {edge && (
        <span
          aria-hidden
          className={clsx(
            'pointer-events-none absolute z-10 rounded-full bg-accent-500',
            axis === 'y'
              ? clsx('inset-x-0 h-0.5', edge === 'before' ? '-top-px' : '-bottom-px')
              : clsx('inset-y-0 w-0.5', edge === 'before' ? '-left-px' : '-right-px')
          )}
        />
      )}
    </div>
  )
}

export interface ReorderSection {
  id: string
  node: ReactNode
}

export function ReorderableSections({ storageKey, sections }: { storageKey: string; sections: ReorderSection[] }) {
  const shown = sections.filter((section) => section.node)
  const { move, sortItems } = useReorder(storageKey, shown.map((section) => section.id))
  return (
    <>
      {sortItems(shown, (section) => section.id).map((section) => (
        <Reorderable key={section.id} group={storageKey} id={section.id} onMove={move} handle>
          {section.node}
        </Reorderable>
      ))}
    </>
  )
}
