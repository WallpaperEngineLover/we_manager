import type { ReactNode } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { ScheduleAction } from '@shared/types'
import ActionPicker, { useDescribeAction } from './ActionPicker'
import { inputClass } from '../common/inputClass'
import { useDisplayTargets } from '../../hooks/useDisplayTargets'
import { screenLabel } from '../../utils/screens'
import { t } from '../../i18n'

const iconButton = 'rounded p-1 text-gray-500'

interface RuleRowProps {
  enabled: boolean
  onToggle: () => void
  name: ReactNode
  condition: string
  action: ScheduleAction
  screen: string
  suffix?: string | null
  extraButtons?: ReactNode
  onEdit: () => void
  onDelete: () => void
}

export function RuleRow({ enabled, onToggle, name, condition, action, screen, suffix, extraButtons, onEdit, onDelete }: RuleRowProps) {
  const describeAction = useDescribeAction()
  const { perScreen } = useDisplayTargets()
  return (
    <div className={clsx('flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2', !enabled && 'opacity-50')}>
      <input type="checkbox" checked={enabled} onChange={onToggle} className="accent-accent-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-200">{name}</p>
        <p className="truncate text-xs text-gray-500">
          {condition} · {describeAction(action)}
          {perScreen && action.type !== 'profile' && ` · ${screenLabel(screen)}`}
          {suffix && ` · ${suffix}`}
        </p>
      </div>
      {extraButtons}
      <button onClick={onEdit} title={t('common.edit')} className={`${iconButton} hover:text-gray-200`}>
        <Pencil size={13} />
      </button>
      <button onClick={onDelete} title={t('common.delete')} className={`${iconButton} hover:text-red-400`}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export function RuleIconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} title={title} className={`${iconButton} hover:text-gray-200`}>
      {children}
    </button>
  )
}

export function AddRuleButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-2 flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-300 hover:bg-fg/10"
    >
      <Plus size={14} />
      {label}
    </button>
  )
}

interface RuleEditorProps {
  name: string
  action: ScheduleAction
  screen: string
  onChange: (patch: { name?: string; action?: ScheduleAction; screen?: string }) => void
  onSave: () => void
  onCancel: () => void
  children: ReactNode
  footer?: ReactNode
}

export function RuleEditor({ name, action, screen, onChange, onSave, onCancel, children, footer }: RuleEditorProps) {
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-fg/10 p-3">
      <input
        value={name}
        onChange={(e) => { onChange({ name: e.target.value }) }}
        placeholder={t('schedule.namePlaceholder')}
        className={`${inputClass} w-full`}
      />

      {children}

      <ActionPicker
        action={action}
        screen={screen}
        onAction={(next) => { onChange({ action: next }) }}
        onScreen={(next) => { onChange({ screen: next }) }}
      />

      {footer}

      <div className="flex gap-2">
        <button onClick={onSave} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500">
          {t('common.save')}
        </button>
        <button onClick={onCancel} className="rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
