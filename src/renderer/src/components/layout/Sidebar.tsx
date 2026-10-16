import { Globe, Library, ListVideo, Settings, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { t } from '../../i18n'

type View = 'workshop' | 'library' | 'playlists' | 'settings'

interface SidebarProps {
  activeView: View
  onNavigate: (view: View) => void
}

function NavButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        'relative flex h-10 w-10 items-center justify-center rounded-xl transition-all',
        active
          ? 'bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25'
          : 'text-gray-500 hover:bg-fg/5 hover:text-gray-300'
      )}
    >
      <span
        className={clsx(
          'absolute -left-2 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-accent-500 transition-all',
          active ? 'h-5 opacity-100' : 'h-0 opacity-0'
        )}
      />
      <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
    </button>
  )
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const items = [
    { id: 'workshop' as View, label: t('nav.workshop'), icon: Globe },
    { id: 'library' as View, label: t('nav.library'), icon: Library },
    { id: 'playlists' as View, label: t('nav.playlists'), icon: ListVideo }
  ]

  return (
    <aside className="flex w-14 flex-col items-center gap-1.5 border-r border-fg/5 bg-chrome py-3">
      {items.map(({ id, label, icon }) => (
        <NavButton key={id} active={activeView === id} label={label} icon={icon} onClick={() => onNavigate(id)} />
      ))}
      <div className="flex-1" />
      <NavButton
        active={activeView === 'settings'}
        label={t('nav.settings')}
        icon={Settings}
        onClick={() => onNavigate('settings')}
      />
    </aside>
  )
}
