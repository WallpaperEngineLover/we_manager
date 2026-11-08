import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Loader2, type LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  defaultOpen?: boolean
  busy?: boolean
  badge?: ReactNode
  children: ReactNode
}

export function CustomBadge({ label }: { label: string }) {
  return <span className="rounded-full bg-accent-600/30 px-1.5 normal-case text-accent-300">{label}</span>
}

export default function SidebarSection({ icon: Icon, title, defaultOpen = false, busy, badge, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-fg/5 pt-3">
      <button
        onClick={() => { setOpen((v) => !v) }}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={12} />
        <span className="flex-1 text-left">{title}</span>
        {badge}
        {busy && <Loader2 size={11} className="animate-spin" />}
      </button>
      {open && children}
    </div>
  )
}
