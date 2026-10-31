import { Cpu, Library, Monitor, Palette, Settings, Gauge, Wrench, type LucideIcon } from 'lucide-react'
import { t } from '../../i18n'

export type SettingsTab = 'appearance' | 'library' | 'engine' | 'display' | 'performance' | 'system' | 'troubleshooting'

const TABS: { id: SettingsTab; icon: LucideIcon }[] = [
  { id: 'appearance', icon: Palette },
  { id: 'library', icon: Library },
  { id: 'engine', icon: Cpu },
  { id: 'display', icon: Monitor },
  { id: 'performance', icon: Gauge },
  { id: 'system', icon: Settings },
  { id: 'troubleshooting', icon: Wrench }
]

const STORAGE_KEY = 'settingsTab'

export function loadSettingsTab(): SettingsTab {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (TABS.some((tab) => tab.id === stored)) return stored as SettingsTab
  } catch {
  }
  return 'appearance'
}

export function saveSettingsTab(tab: SettingsTab): void {
  try {
    localStorage.setItem(STORAGE_KEY, tab)
  } catch {
  }
}

export default function SettingsTabs({ active, onChange }: { active: SettingsTab; onChange: (tab: SettingsTab) => void }) {
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      className="flex shrink-0 gap-1 overflow-x-auto px-4 pb-2 pt-4 md:w-52 md:flex-col md:overflow-x-visible md:border-r md:border-fg/5 md:px-3 md:pb-4"
    >
      <h2 className="hidden px-3 pb-3 text-lg font-semibold text-gray-100 md:block">{t('nav.settings')}</h2>
      {TABS.map(({ id, icon: Icon }) => {
        const selected = id === active
        return (
          <button
            key={id}
            role="tab"
            aria-selected={selected}
            onClick={() => { onChange(id) }}
            className={
              'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ' +
              (selected
                ? 'bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25'
                : 'text-gray-400 hover:bg-fg/5 hover:text-gray-200')
            }
          >
            <Icon size={18} strokeWidth={selected ? 2.2 : 1.8} />
            <span className="whitespace-nowrap">{t(`settings.tab.${id}`)}</span>
          </button>
        )
      })}
    </nav>
  )
}
