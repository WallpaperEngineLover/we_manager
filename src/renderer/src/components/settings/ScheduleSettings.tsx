import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Moon, Play, Sun } from 'lucide-react'
import clsx from 'clsx'
import type { ScheduleRule, ScheduleTrigger } from '@shared/types'
import { nextFireTime, parseTime } from '@shared/schedule'
import { actionProblem, useDescribeAction } from './ActionPicker'
import { AddRuleButton, RuleEditor, RuleIconButton, RuleRow } from './RuleParts'
import { inputClass } from '../common/inputClass'
import { useToast } from '../common/Toast'
import { t, currentLanguage } from '../../i18n'

// 2024-01-07 was a Sunday, day 0 like Date.getDay()
function dayLabels(): string[] {
  const format = new Intl.DateTimeFormat(currentLanguage(), { weekday: 'short' })
  return Array.from({ length: 7 }, (_, day) => format.format(new Date(2024, 0, 7 + day)))
}

type Draft = Omit<ScheduleRule, 'id'> & { id?: string }

const EMPTY_DRAFT: Draft = {
  name: '',
  enabled: true,
  trigger: { type: 'time', time: '08:00', days: [] },
  action: { type: 'stop' },
  screen: '*'
}

function describeTrigger(trigger: ScheduleTrigger): string {
  if (trigger.type === 'theme') return trigger.theme === 'dark' ? t('schedule.whenDark') : t('schedule.whenLight')
  const labels = dayLabels()
  const days = trigger.days.length === 0 || trigger.days.length === 7
    ? t('schedule.everyDay')
    : [...trigger.days].sort().map((d) => labels[d]).join(', ')
  return `${trigger.time}, ${days}`
}

const currentTime = (): Date => new Date()

export default function ScheduleSettings() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const describeAction = useDescribeAction()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [now, setNow] = useState(currentTime)

  useEffect(() => {
    let id: ReturnType<typeof setInterval>
    const first = setTimeout(() => {
      setNow(currentTime())
      id = setInterval(() => { setNow(currentTime()) }, 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])

  const { data: rules = [] } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => window.electronAPI.schedule.getAll()
  })
  function refresh() {
    setNow(currentTime())
    void queryClient.invalidateQueries({ queryKey: ['schedule'] })
  }

  async function save() {
    if (!draft) return
    if (draft.trigger.type === 'time' && !parseTime(draft.trigger.time)) {
      showToast(t('schedule.badTime'), { warning: true })
      return
    }
    const problem = actionProblem(draft.action)
    if (problem) {
      showToast(t(problem), { warning: true })
      return
    }
    await window.electronAPI.schedule.save({ ...draft, name: draft.name.trim() || describeAction(draft.action) })
    setDraft(null)
    refresh()
  }

  async function toggle(rule: ScheduleRule) {
    await window.electronAPI.schedule.save({ ...rule, enabled: !rule.enabled })
    refresh()
  }

  async function remove(id: string) {
    await window.electronAPI.schedule.delete(id)
    refresh()
  }

  async function runNow(rule: ScheduleRule) {
    try {
      await window.electronAPI.schedule.run(rule.id)
    } catch (err) {
      showToast((err as Error).message, { warning: true, durationMs: 6000 })
    }
  }

  function setTrigger(trigger: ScheduleTrigger) {
    setDraft((d) => (d ? { ...d, trigger } : d))
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('schedule.title')}</label>
      <p className="mt-1 text-xs text-gray-600">
        {t('schedule.description')}
      </p>

      <div className="mt-3 space-y-1.5">
        {rules.map((rule) => {
          const next = rule.enabled && rule.trigger.type === 'time' ? nextFireTime(rule, now) : null
          return (
            <RuleRow
              key={rule.id}
              enabled={rule.enabled}
              onToggle={() => void toggle(rule)}
              name={rule.name}
              condition={describeTrigger(rule.trigger)}
              action={rule.action}
              screen={rule.screen}
              suffix={next && t('schedule.next', { time: next.toLocaleString(currentLanguage(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })}
              extraButtons={
                <RuleIconButton title={t('schedule.runNow')} onClick={() => void runNow(rule)}>
                  <Play size={13} />
                </RuleIconButton>
              }
              onEdit={() => { setDraft(rule) }}
              onDelete={() => void remove(rule.id)}
            />
          )
        })}
      </div>

      {!draft ? (
        <AddRuleButton label={t('schedule.add')} onClick={() => { setDraft(EMPTY_DRAFT) }} />
      ) : (
        <RuleEditor
          name={draft.name}
          action={draft.action}
          screen={draft.screen}
          onChange={(patch) => { setDraft({ ...draft, ...patch }) }}
          onSave={() => void save()}
          onCancel={() => { setDraft(null) }}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
            <CalendarClock size={14} />
            <select
              value={draft.trigger.type === 'time' ? 'time' : draft.trigger.theme}
              onChange={(e) => { setTrigger(
                  e.target.value === 'time'
                    ? { type: 'time', time: '08:00', days: [] }
                    : { type: 'theme', theme: e.target.value as 'dark' | 'light' }
                ); }
              }
              className={inputClass}
            >
              <option value="time">{t('schedule.atTime')}</option>
              <option value="dark">{t('schedule.whenDark')}</option>
              <option value="light">{t('schedule.whenLight')}</option>
            </select>
            {draft.trigger.type === 'time' && (
              <input
                type="time"
                value={draft.trigger.time}
                onChange={(e) => { if (draft.trigger.type === 'time') setTrigger({ ...draft.trigger, time: e.target.value }) }}
                className={inputClass}
              />
            )}
            {draft.trigger.type === 'theme' && (draft.trigger.theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />)}
          </div>

          {draft.trigger.type === 'time' && (
            <div className="flex flex-wrap gap-1">
              {dayLabels().map((label, day) => {
                const trigger = draft.trigger as Extract<ScheduleTrigger, { type: 'time' }>
                const on = trigger.days.includes(day)
                return (
                  <button
                    key={label}
                    onClick={() => { setTrigger({ ...trigger, days: on ? trigger.days.filter((d) => d !== day) : [...trigger.days, day] }) }
                    }
                    className={clsx(
                      'rounded px-2 py-1 text-xs',
                      on ? 'bg-accent-600 text-white' : 'bg-fg/5 text-gray-400 hover:text-gray-200'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
              <span className="self-center text-xs text-gray-600">{t('schedule.noneEveryDay')}</span>
            </div>
          )}
        </RuleEditor>
      )}
    </div>
  )
}
