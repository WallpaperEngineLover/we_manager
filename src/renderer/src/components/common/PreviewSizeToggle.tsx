import clsx from 'clsx'
import type { PreviewSize } from '../../hooks/usePreviewSize'

const OPTIONS: { value: PreviewSize; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'normal', label: 'M' },
  { value: 'big', label: 'L' }
]

export default function PreviewSizeToggle({
  value,
  onChange
}: {
  value: PreviewSize
  onChange: (size: PreviewSize) => void
}) {
  return (
    <div className="flex rounded-lg overflow-hidden text-xs" title="Preview size">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.value[0].toUpperCase() + opt.value.slice(1)}
          className={clsx(
            'px-2.5 py-2 transition-colors',
            value === opt.value
              ? 'bg-indigo-600 text-white'
              : 'bg-white/5 text-gray-400 hover:text-gray-200'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
