import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppWindow, File, Folder, Globe, Pencil, Terminal, X } from 'lucide-react'
import clsx from 'clsx'
import type { DesktopApplication, LweProperty } from '@shared/types'
import { t } from '../../i18n'
import type { MessageKey } from '@shared/i18n'

type ShortcutType = 'application' | 'file' | 'directory' | 'web' | 'command'

interface Shortcut {
  type: ShortcutType
  file: string
  arguments: string
}

const TYPES: { type: ShortcutType; label: MessageKey; icon: typeof File }[] = [
  { type: 'application', label: 'shortcut.app', icon: AppWindow },
  { type: 'file', label: 'shortcut.file', icon: File },
  { type: 'directory', label: 'shortcut.folder', icon: Folder },
  { type: 'web', label: 'shortcut.web', icon: Globe },
  { type: 'command', label: 'shortcut.command', icon: Terminal }
]

// the engine's format (the real Wallpaper Engine's, plus "application" for a .desktop file)
function parseShortcut(value: string): Shortcut | null {
  if (!value.trim().startsWith('{')) return null
  try {
    const json = JSON.parse(value) as { commandtype?: string; file?: string; arguments?: string }
    if (!json.file || !TYPES.some((option) => option.type === json.commandtype)) return null
    return { type: json.commandtype as ShortcutType, file: json.file, arguments: json.arguments ?? '' }
  } catch {
    return null
  }
}

function serializeShortcut(shortcut: Shortcut): string {
  return JSON.stringify({
    isbound: true,
    commandtype: shortcut.type,
    file: shortcut.file.trim(),
    ...(shortcut.arguments.trim() ? { arguments: shortcut.arguments.trim() } : {})
  })
}

function describe(shortcut: Shortcut, apps: DesktopApplication[]): string {
  if (shortcut.type === 'application') {
    return apps.find((a) => a.file === shortcut.file)?.name ?? shortcut.file.split('/').pop() ?? shortcut.file
  }
  if (shortcut.type === 'file' || shortcut.type === 'directory') return shortcut.file.split('/').pop() || shortcut.file
  return shortcut.file
}

export function ShortcutRow({
  property,
  value,
  busy,
  onCommit
}: {
  property: LweProperty
  value: string
  busy: boolean
  onCommit: (value: string) => void
}) {
  const current = parseShortcut(value)
  const [draft, setDraft] = useState<Shortcut | null>(null)
  const [search, setSearch] = useState('')
  const label = property.text || property.name

  const { data: apps = [] } = useQuery({
    queryKey: ['desktop-applications'],
    queryFn: () => window.electronAPI.lwe.listApplications(),
    staleTime: 5 * 60_000
  })

  const filteredApps = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? apps.filter((a) => a.name.toLowerCase().includes(needle)) : apps
  }, [apps, search])

  const CurrentIcon = TYPES.find((option) => option.type === current?.type)?.icon

  const pick = async (kind: 'file' | 'directory') => {
    const picked = await window.electronAPI.lwe.pickShortcutPath(kind)
    if (picked && draft) setDraft({ ...draft, file: picked })
  }

  const save = () => {
    if (!draft || !draft.file.trim()) return
    onCommit(serializeShortcut(draft))
    setDraft(null)
  }

  return (
    <div className="px-1.5 py-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-gray-300" title={property.name}>
          {label}
        </span>
        <span className="flex max-w-[45%] items-center gap-1 truncate text-gray-500">
          {current && CurrentIcon && <CurrentIcon size={12} className="shrink-0" />}
          <span className="truncate">{current ? describe(current, apps) : t('shortcut.notAssigned')}</span>
        </span>
        <button
          onClick={() => setDraft(draft ? null : (current ?? { type: 'application', file: '', arguments: '' }))}
          disabled={busy}
          title={current ? t('shortcut.change') : t('shortcut.assign')}
          className="rounded p-0.5 text-gray-400 hover:bg-fg/10 hover:text-gray-200 disabled:opacity-40"
        >
          <Pencil size={12} />
        </button>
        {current && (
          <button
            onClick={() => onCommit('')}
            disabled={busy}
            title={t('shortcut.remove')}
            className="rounded p-0.5 text-gray-400 hover:bg-fg/10 hover:text-gray-200 disabled:opacity-40"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {draft && (
        <div className="mt-1.5 space-y-1.5 rounded bg-fg/5 p-1.5">
          <div className="flex gap-1">
            {TYPES.map(({ type, label: typeLabel, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setDraft({ type, file: '', arguments: '' })}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-1 rounded px-1 py-0.5',
                  draft.type === type ? 'bg-accent-500/30 text-accent-200' : 'text-gray-400 hover:bg-fg/5'
                )}
              >
                <Icon size={11} />
                {t(typeLabel)}
              </button>
            ))}
          </div>

          {draft.type === 'application' && (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('shortcut.searchApps')}
                className="w-full rounded bg-black/20 px-1.5 py-0.5 text-gray-200 outline-none"
              />
              <div className="max-h-40 overflow-y-auto">
                {filteredApps.map((app) => (
                  <button
                    key={app.file}
                    onClick={() => setDraft({ ...draft, file: app.file })}
                    title={app.file}
                    className={clsx(
                      'block w-full truncate rounded px-1.5 py-0.5 text-left',
                      draft.file === app.file ? 'bg-accent-500/30 text-accent-200' : 'text-gray-300 hover:bg-fg/5'
                    )}
                  >
                    {app.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {(draft.type === 'file' || draft.type === 'directory') && (
            <div className="flex gap-1">
              <input
                value={draft.file}
                onChange={(e) => setDraft({ ...draft, file: e.target.value })}
                placeholder={draft.type === 'directory' ? t('shortcut.folderPlaceholder') : t('shortcut.filePlaceholder')}
                className="min-w-0 flex-1 rounded bg-black/20 px-1.5 py-0.5 text-gray-200 outline-none"
              />
              <button
                onClick={() => pick(draft.type === 'directory' ? 'directory' : 'file')}
                className="rounded bg-fg/5 px-1.5 text-gray-300 hover:bg-fg/10"
              >
                {t('common.browse')}
              </button>
            </div>
          )}

          {draft.type === 'web' && (
            <input
              value={draft.file}
              onChange={(e) => setDraft({ ...draft, file: e.target.value })}
              placeholder="https://"
              className="w-full rounded bg-black/20 px-1.5 py-0.5 text-gray-200 outline-none"
            />
          )}

          {draft.type === 'command' && (
            <>
              <input
                value={draft.file}
                onChange={(e) => setDraft({ ...draft, file: e.target.value })}
                placeholder={t('shortcut.command')}
                className="w-full rounded bg-black/20 px-1.5 py-0.5 font-mono text-gray-200 outline-none"
              />
              <p className="text-[10px] leading-snug text-amber-300/80">
                {t('shortcut.commandWarning')}
              </p>
            </>
          )}

          <div className="flex justify-end gap-1">
            <button onClick={() => setDraft(null)} className="rounded px-2 py-0.5 text-gray-400 hover:bg-fg/5">
              {t('common.cancel')}
            </button>
            <button
              onClick={save}
              disabled={!draft.file.trim() || busy}
              className="rounded bg-accent-500/80 px-2 py-0.5 text-white hover:bg-accent-500 disabled:opacity-40"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
