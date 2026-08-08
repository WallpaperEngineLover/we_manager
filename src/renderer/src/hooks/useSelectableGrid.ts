import { useState, useRef, useCallback, useEffect } from 'react'

export interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

interface Marquee {
  startX: number
  startY: number
  endX: number
  endY: number
}

interface UseSelectableGridOptions {
  ids: string[]
  dataAttr: string
  onOpenDetail?: (id: string) => void
}

export function useSelectableGrid({ ids, dataAttr, onOpenDetail }: UseSelectableGridOptions) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const marqueeActive = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const handleCardSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        setLastClickedId(id)
        return
      }
      if (e.shiftKey && lastClickedId) {
        const from = ids.indexOf(lastClickedId)
        const to = ids.indexOf(id)
        if (from !== -1 && to !== -1) {
          const start = Math.min(from, to)
          const end = Math.max(from, to)
          const rangeIds = ids.slice(start, end + 1)
          setSelectedIds((prev) => {
            const next = new Set(prev)
            for (const rangeId of rangeIds) next.add(rangeId)
            return next
          })
        }
        return
      }
      setSelectedIds(new Set([id]))
      setLastClickedId(id)
      onOpenDetail?.(id)
    },
    [ids, lastClickedId, onOpenDetail]
  )

  const handleMarqueeStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(`[${dataAttr}]`)) return
      if (e.button !== 0) return

      const container = gridRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left + container.scrollLeft
      const y = e.clientY - rect.top + container.scrollTop

      marqueeActive.current = true
      setMarquee({ startX: x, startY: y, endX: x, endY: y })

      if (!e.ctrlKey && !e.metaKey) {
        setSelectedIds(new Set())
      }
    },
    [dataAttr]
  )

  const handleMarqueeMove = useCallback(
    (e: React.MouseEvent) => {
      if (!marqueeActive.current || !marquee) return

      const container = gridRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left + container.scrollLeft
      const y = e.clientY - rect.top + container.scrollTop

      setMarquee((prev) => (prev ? { ...prev, endX: x, endY: y } : null))
    },
    [marquee]
  )

  const handleMarqueeEnd = useCallback(() => {
    if (!marqueeActive.current || !marquee) return
    marqueeActive.current = false

    const container = gridRef.current
    if (!container) return

    const mx1 = Math.min(marquee.startX, marquee.endX)
    const my1 = Math.min(marquee.startY, marquee.endY)
    const mx2 = Math.max(marquee.startX, marquee.endX)
    const my2 = Math.max(marquee.startY, marquee.endY)

    if (Math.abs(mx2 - mx1) < 5 && Math.abs(my2 - my1) < 5) {
      setMarquee(null)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const cards = container.querySelectorAll(`[${dataAttr}]`)
    const hits = new Set<string>()

    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect()
      const cx1 = cardRect.left - containerRect.left + container.scrollLeft
      const cy1 = cardRect.top - containerRect.top + container.scrollTop
      const cx2 = cx1 + cardRect.width
      const cy2 = cy1 + cardRect.height

      if (cx1 < mx2 && cx2 > mx1 && cy1 < my2 && cy2 > my1) {
        const id = card.getAttribute(dataAttr)
        if (id) hits.add(id)
      }
    })

    setSelectedIds((prev) => {
      const next = new Set(prev)
      hits.forEach((id) => next.add(id))
      return next
    })

    setMarquee(null)
  }, [marquee, dataAttr])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        e.preventDefault()
        setSelectedIds(new Set(ids))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ids])

  const marqueeRect: MarqueeRect | null = marquee
    ? {
        left: Math.min(marquee.startX, marquee.endX),
        top: Math.min(marquee.startY, marquee.endY),
        width: Math.abs(marquee.endX - marquee.startX),
        height: Math.abs(marquee.endY - marquee.startY)
      }
    : null

  return {
    selectedIds,
    setSelectedIds,
    lastClickedId,
    setLastClickedId,
    gridRef,
    handleCardSelect,
    handleMarqueeStart,
    handleMarqueeMove,
    handleMarqueeEnd,
    marqueeRect
  }
}
