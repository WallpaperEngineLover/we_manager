import type { ChangeEvent, KeyboardEvent, PointerEvent } from 'react'
import { useRef } from 'react'
import { isRangeKey } from '../../utils/dom'
import { createRangeCommit } from '../../utils/rangeCommit'

interface Props {
  min: number
  max: number
  step?: number
  value: number
  disabled?: boolean
  title?: string
  className?: string
  onLive?: (value: number) => void
  onCommit: (value: number) => void
}

/** One commit path for every detail-panel slider. The value comes from the drag, not a later read of the input. */
export default function RangeInput({ min, max, step, value, disabled, title, className, onLive, onCommit }: Props) {
  const machine = useRef(createRangeCommit())

  function end() {
    const next = machine.current.end()
    if (next !== null) onCommit(next)
  }

  function pointerDown(e: PointerEvent<HTMLInputElement>) {
    machine.current.pointerDown()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // the pointer can already be gone; the drag flag still tracks moves over the input
    }
  }

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      title={title}
      className={`w-full touch-none accent-accent-500 disabled:opacity-50 ${className ?? ''}`}
      onPointerDown={pointerDown}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { machine.current.keyDown(e.key) }}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const next = machine.current.change(e.target.value)
        if (next !== null) onLive?.(next)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onBlur={end}
      onKeyUp={(e: KeyboardEvent<HTMLInputElement>) => { if (isRangeKey(e.key)) end() }}
    />
  )
}
