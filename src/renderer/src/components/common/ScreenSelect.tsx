import { Monitor } from 'lucide-react'
import type { ScreenTarget } from '@shared/types'
import { screenLabel } from '../../utils/screens'

interface Props {
  targets: ScreenTarget[]
  value: ScreenTarget
  onChange: (screen: ScreenTarget) => void
  title?: string
}

export default function ScreenSelect({ targets, value, onChange, title = 'Screen' }: Props) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-400" title={title}>
      <Monitor size={12} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded bg-white/5 px-1.5 py-1 text-xs text-gray-200 outline-none"
      >
        <option value="*">All screens</option>
        {targets.map((t) => (
          <option key={t} value={t}>
            {screenLabel(t)}
          </option>
        ))}
      </select>
    </label>
  )
}
