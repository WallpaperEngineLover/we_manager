import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppWindow, Music } from 'lucide-react'
import type { AppRule, AppRuleCondition } from '@shared/types'
import { parseProcessNames } from '@shared/appRules'
import { actionProblem } from './ActionPicker'
import { AddRuleButton, RuleEditor, RuleRow } from './RuleParts'
import { inputClass } from '../common/inputClass'
import { useToast } from '../common/Toast'
import Toggle from '../common/Toggle'
import { t } from '../../i18n'

type Draft = Omit<AppRule, 'id'> & { id?: string }

const EMPTY_DRAFT: Draft = {
  name: '',
  enabled: true,
  condition: { type: 'process', names: [] },
  action: { type: 'stop' },
  screen: '*',
  revert: true
}

function describeCondition(condition: AppRuleCondition): string {
  if (condition.type === 'audio') return t('appRules.whileAudio')
  return t('appRules.whileRuns', { names: condition.names.join(', ') })
}

export default function AppRuleSettings() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [names, setNames] = useState('')

  const { data: audioAvailable } = useQuery({
    queryKey: ['app-rules-audio-available'],
    queryFn: () => window.electronAPI.appRules.audioAvailable(),
    staleTime: Infinity
  })

  const { data: rules = [] } = useQuery({
    queryKey: ['app-rules'],
    queryFn: () => window.electronAPI.appRules.getAll()
  })
  const { data: active = [] } = useQuery({
    queryKey: ['app-rules-active'],
    queryFn: () => window.electronAPI.appRules.active(),
    refetchInterval: 3000
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['app-rules'] })
    void queryClient.invalidateQueries({ queryKey: ['app-rules-active'] })
  }

  function edit(rule: Draft) {
    setDraft(rule)
    setNames(rule.condition.type === 'process' ? rule.condition.names.join(', ') : '')
  }

  async function save() {
    if (!draft) return
    const condition: AppRuleCondition =
      draft.condition.type === 'process' ? { type: 'process', names: parseProcessNames(names) } : draft.condition
    if (condition.type === 'process' && condition.names.length === 0) {
      showToast(t('appRules.pickProgram'), { warning: true })
      return
    }
    const problem = actionProblem(draft.action)
    if (problem) {
      showToast(t(problem), { warning: true })
      return
    }
    await window.electronAPI.appRules.save({
      ...draft,
      condition,
      name: draft.name.trim() || describeCondition(condition)
    })
    setDraft(null)
    refresh()
  }

  async function toggle(rule: AppRule) {
    await window.electronAPI.appRules.save({ ...rule, enabled: !rule.enabled })
    refresh()
  }

  async function remove(id: string) {
    await window.electronAPI.appRules.delete(id)
    refresh()
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('appRules.title')}</label>
      <p className="mt-1 text-xs text-gray-600">{t('appRules.description')}</p>

      <div className="mt-3 space-y-1.5">
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            enabled={rule.enabled}
            onToggle={() => void toggle(rule)}
            name={
              <>
                {rule.name}
                {active.includes(rule.id) && <span className="ml-2 text-xs text-accent-400">{t('appRules.active')}</span>}
              </>
            }
            condition={describeCondition(rule.condition)}
            action={rule.action}
            screen={rule.screen}
            onEdit={() => { edit(rule) }}
            onDelete={() => void remove(rule.id)}
          />
        ))}
      </div>

      {!draft ? (
        <AddRuleButton label={t('appRules.add')} onClick={() => { edit(EMPTY_DRAFT) }} />
      ) : (
        <RuleEditor
          name={draft.name}
          action={draft.action}
          screen={draft.screen}
          onChange={(patch) => { setDraft({ ...draft, ...patch }) }}
          onSave={() => void save()}
          onCancel={() => { setDraft(null) }}
          footer={
            <label className="flex items-center gap-3 cursor-pointer">
              <Toggle on={draft.revert} onClick={() => { setDraft({ ...draft, revert: !draft.revert }) }} />
              <span className="text-sm text-gray-300">{t('appRules.revert')}</span>
            </label>
          }
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
            {draft.condition.type === 'audio' ? <Music size={14} /> : <AppWindow size={14} />}
            <select
              value={draft.condition.type}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  condition: e.target.value === 'audio' ? { type: 'audio' } : { type: 'process', names: [] }
                })
              }}
              className={inputClass}
            >
              <option value="process">{t('appRules.runs')}</option>
              <option value="audio">{t('appRules.audio')}</option>
            </select>
          </div>

          {draft.condition.type === 'audio' && audioAvailable === false && (
            <p className="text-xs text-amber-400">{t('appRules.audioUnavailable')}</p>
          )}

          {draft.condition.type === 'process' && (
            <div>
              <input
                value={names}
                onChange={(e) => { setNames(e.target.value) }}
                placeholder={t('appRules.programsPlaceholder')}
                className={`${inputClass} w-full`}
              />
              <p className="mt-1 text-xs text-gray-600">{t('appRules.programsHint')}</p>
            </div>
          )}
        </RuleEditor>
      )}
    </div>
  )
}
