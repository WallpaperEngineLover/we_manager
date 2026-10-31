import { Monitor } from 'lucide-react'
import type { ScreenTarget } from '@shared/types'
import { screenLabel } from '../../utils/screens'
import { t } from '../../i18n'

interface Props {
  targets: ScreenTarget[]
  value: ScreenTarget
  onChange: (screen: ScreenTarget) => void
  title?: string
}

export default function ScreenSelect({ targets, value, onChange, title }: Props) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-400" title={title ?? t('common.screen')}>
      <Monitor size={12} />
      <select
        value={value}
        onChange={(e) => { onChange(e.target.value) }}
        className="rounded bg-fg/5 px-1.5 py-1 text-xs text-gray-200 outline-none"
      >
        <option value="*">{t('common.allScreens')}</option>
        {targets.map((target) => (
          <option key={target} value={target}>
            {screenLabel(target)}
          </option>
        ))}
      </select>
    </label>
  )
}
