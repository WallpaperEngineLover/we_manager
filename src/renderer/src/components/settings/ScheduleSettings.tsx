import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Moon, Pencil, Play, Plus, Sun, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { ScheduleAction, ScheduleRule, ScheduleTrigger } from '@shared/types'
import { nextFireTime, parseTime } from '@shared/schedule'
import ScreenSelect from '../common/ScreenSelect'
import { useDisplayTargets } from '../../hooks/useDisplayTargets'
import { screenLabel } from '../../utils/screens'
import { useToast } from '../common/Toast'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Draft = Omit<ScheduleRule, 'id'> & { id?: string }

const EMPTY_DRAFT: Draft = {
  name: '',
  enabled: true,
  trigger: { type: 'time', time: '08:00', days: [] },
  action: { type: 'stop' },
  screen: '*'
}

const inputClass = 'rounded-lg bg-white/5 px-2 py-1.5 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500'

function describeTrigger(trigger: ScheduleTrigger): string {
  if (trigger.type === 'theme') return trigger.theme === 'dark' ? 'When the system goes dark' : 'When the system goes light'
  const days = trigger.days.length === 0 || trigger.days.length === 7
    ? 'every day'
    : [...trigger.days].sort().map((d) => DAY_LABELS[d]).join(', ')
  return `${trigger.time}, ${days}`
}

export default function ScheduleSettings() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { targets, perScreen } = useDisplayTargets()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [wallpaperFilter, setWallpaperFilter] = useState('')

  const { data: rules = [] } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => window.electronAPI.schedule.getAll()
  })
  const { data: wallpapers = [] } = useQuery({
    queryKey: ['library-all'],
    queryFn: () => window.electronAPI.library.getAll()
  })
  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => window.electronAPI.playlist.getAll()
  })

  const wallpaperTitle = (id: string) => wallpapers.find((w) => w.id === id)?.title ?? 'missing wallpaper'
  const playlistTitle = (id: string) => playlists.find((p) => p.id === id)?.title ?? 'missing playlist'

  function describeAction(action: ScheduleAction): string {
    if (action.type === 'wallpaper') return `Show ${wallpaperTitle(action.wallpaperId)}`
    if (action.type === 'playlist') return `Play ${playlistTitle(action.playlistId)}`
    return 'Stop the wallpaper'
  }

  const selectedWallpaperId = draft?.action.type === 'wallpaper' ? draft.action.wallpaperId : ''
  const wallpaperOptions = useMemo(() => {
    const needle = wallpaperFilter.trim().toLowerCase()
    const matches = wallpapers
      .filter((w) => w.localPath && (!needle || w.title.toLowerCase().includes(needle)))
      .slice(0, 100)
    const selected = wallpapers.find((w) => w.id === selectedWallpaperId)
    return selected && !matches.includes(selected) ? [selected, ...matches] : matches
  }, [wallpapers, wallpaperFilter, selectedWallpaperId])

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['schedule'] })
  }

  async function save() {
    if (!draft) return
    if (draft.trigger.type === 'time' && !parseTime(draft.trigger.time)) {
      showToast('Enter the time as HH:MM', { warning: true })
      return
    }
    if (draft.action.type === 'wallpaper' && !draft.action.wallpaperId) {
      showToast('Pick a wallpaper', { warning: true })
      return
    }
    if (draft.action.type === 'playlist' && !draft.action.playlistId) {
      showToast('Pick a playlist', { warning: true })
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

  function setAction(action: ScheduleAction) {
    setDraft((d) => (d ? { ...d, action } : d))
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Schedule</label>
      <p className="mt-1 text-xs text-gray-600">
        Switch wallpapers or playlists at set times, or when the system switches between dark and light. A time
        that passed while WE Manager was closed still runs when it starts, only the latest one per screen.
      </p>

      <div className="mt-3 space-y-1.5">
        {rules.map((rule) => {
          const next = rule.enabled && rule.trigger.type === 'time' ? nextFireTime(rule, new Date()) : null
          return (
            <div
              key={rule.id}
              className={clsx('flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2', !rule.enabled && 'opacity-50')}
            >
              <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule)} className="accent-indigo-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-200">{rule.name}</p>
                <p className="truncate text-xs text-gray-500">
                  {describeTrigger(rule.trigger)} · {describeAction(rule.action)}
                  {perScreen && ` · ${screenLabel(rule.screen)}`}
                  {next && ` · next ${next.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}
                </p>
              </div>
              <button onClick={() => runNow(rule)} title="Run now" className="rounded p-1 text-gray-500 hover:text-gray-200">
                <Play size={13} />
              </button>
              <button onClick={() => setDraft(rule)} title="Edit" className="rounded p-1 text-gray-500 hover:text-gray-200">
                <Pencil size={13} />
              </button>
              <button onClick={() => remove(rule.id)} title="Delete" className="rounded p-1 text-gray-500 hover:text-red-400">
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>

      {!draft ? (
        <button
          onClick={() => setDraft(EMPTY_DRAFT)}
          className="mt-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
        >
          <Plus size={14} />
          Add schedule
        </button>
      ) : (
        <div className="mt-2 space-y-3 rounded-lg border border-white/10 p-3">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name (optional)"
            className={`${inputClass} w-full`}
          />

          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
            <CalendarClock size={14} />
            <select
              value={draft.trigger.type === 'time' ? 'time' : draft.trigger.theme}
              onChange={(e) =>
                setTrigger(
                  e.target.value === 'time'
                    ? { type: 'time', time: '08:00', days: [] }
                    : { type: 'theme', theme: e.target.value as 'dark' | 'light' }
                )
              }
              className={inputClass}
            >
              <option value="time">At a time</option>
              <option value="dark">When the system goes dark</option>
              <option value="light">When the system goes light</option>
            </select>
            {draft.trigger.type === 'time' && (
              <input
                type="time"
                value={draft.trigger.time}
                onChange={(e) => draft.trigger.type === 'time' && setTrigger({ ...draft.trigger, time: e.target.value })}
                className={inputClass}
              />
            )}
            {draft.trigger.type === 'theme' && (draft.trigger.theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />)}
          </div>

          {draft.trigger.type === 'time' && (
            <div className="flex flex-wrap gap-1">
              {DAY_LABELS.map((label, day) => {
                const trigger = draft.trigger as Extract<ScheduleTrigger, { type: 'time' }>
                const on = trigger.days.includes(day)
                return (
                  <button
                    key={label}
                    onClick={() =>
                      setTrigger({ ...trigger, days: on ? trigger.days.filter((d) => d !== day) : [...trigger.days, day] })
                    }
                    className={clsx(
                      'rounded px-2 py-1 text-xs',
                      on ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:text-gray-200'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
              <span className="self-center text-xs text-gray-600">none picked = every day</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={draft.action.type}
              onChange={(e) => {
                const type = e.target.value as ScheduleAction['type']
                setAction(
                  type === 'wallpaper'
                    ? { type, wallpaperId: '' }
                    : type === 'playlist'
                      ? { type, playlistId: playlists[0]?.id ?? '' }
                      : { type }
                )
              }}
              className={inputClass}
            >
              <option value="wallpaper">Show a wallpaper</option>
              <option value="playlist">Play a playlist</option>
              <option value="stop">Stop the wallpaper</option>
            </select>
            {perScreen && (
              <ScreenSelect targets={targets} value={draft.screen} onChange={(screen) => setDraft({ ...draft, screen })} />
            )}
          </div>

          {draft.action.type === 'playlist' && (
            <select
              value={draft.action.playlistId}
              onChange={(e) => setAction({ type: 'playlist', playlistId: e.target.value })}
              className={`${inputClass} w-full`}
            >
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}

          {draft.action.type === 'wallpaper' && (
            <div className="space-y-1.5">
              <input
                value={wallpaperFilter}
                onChange={(e) => setWallpaperFilter(e.target.value)}
                placeholder="Search the library"
                className={`${inputClass} w-full`}
              />
              <select
                value={draft.action.wallpaperId}
                onChange={(e) => setAction({ type: 'wallpaper', wallpaperId: e.target.value })}
                size={6}
                className={`${inputClass} w-full`}
              >
                {wallpaperOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              Save
            </button>
            <button onClick={() => setDraft(null)} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
