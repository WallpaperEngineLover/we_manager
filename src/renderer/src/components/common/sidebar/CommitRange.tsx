interface Props {
  min: number
  max: number
  step?: number
  value: number
  disabled: boolean
  title?: string
  onSlide: (value: number) => void
  onCommit: () => void
}

export default function CommitRange({ min, max, step, value, disabled, title, onSlide, onCommit }: Props) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      title={title}
      onChange={(e) => { onSlide(Number(e.target.value)) }}
      onMouseUp={onCommit}
      onTouchEnd={onCommit}
      onKeyUp={onCommit}
      className="w-full accent-accent-500 disabled:opacity-50"
    />
  )
}
