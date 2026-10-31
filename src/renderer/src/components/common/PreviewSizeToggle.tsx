import type { ReactNode } from 'react'
import { List } from 'lucide-react'
import clsx from 'clsx'
import type { PreviewSize } from '../../hooks/usePreviewSize'
import { t } from '../../i18n'
import type { MessageKey } from '@shared/i18n'

const OPTIONS: { value: PreviewSize; label: ReactNode; title: MessageKey }[] = [
  { value: 'small', label: 'S', title: 'previewSize.small' },
  { value: 'normal', label: 'M', title: 'previewSize.normal' },
  { value: 'big', label: 'L', title: 'previewSize.big' },
  { value: 'list', label: <List size={14} />, title: 'previewSize.list' }
]

export default function PreviewSizeToggle({
  value,
  onChange
}: {
  value: PreviewSize
  onChange: (size: PreviewSize) => void
}) {
  return (
    <div className="flex rounded-lg overflow-hidden text-xs" title={t('previewSize.title')}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => { onChange(opt.value) }}
          title={t(opt.title)}
          className={clsx(
            'flex items-center px-2.5 py-2 transition-colors',
            value === opt.value
              ? 'bg-accent-600 text-white'
              : 'bg-fg/5 text-gray-400 hover:text-gray-200'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
