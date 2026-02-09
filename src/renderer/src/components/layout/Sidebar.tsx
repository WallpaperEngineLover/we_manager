import { Globe, Library, Settings } from 'lucide-react'
import clsx from 'clsx'

type View = 'workshop' | 'library' | 'settings'

interface SidebarProps {
  activeView: View
  onNavigate: (view: View) => void
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const items = [
    { id: 'workshop' as View, label: 'Workshop', icon: Globe },
    { id: 'library' as View, label: 'Library', icon: Library }
  ]

  return (
    <aside className="flex w-14 flex-col items-center gap-2 border-r border-white/5 bg-[#0a0a0a] py-4">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          title={label}
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            activeView === id
              ? 'bg-indigo-600 text-white'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
          )}
        >
          <Icon size={20} />
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => onNavigate('settings')}
        title="Settings"
        className={clsx(
          'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
          activeView === 'settings'
            ? 'bg-indigo-600 text-white'
            : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
        )}
      >
        <Settings size={20} />
      </button>
    </aside>
  )
}
