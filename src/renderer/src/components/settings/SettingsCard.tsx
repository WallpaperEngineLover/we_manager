import type { ReactNode } from 'react'

export default function SettingsCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{title}</label>
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}
