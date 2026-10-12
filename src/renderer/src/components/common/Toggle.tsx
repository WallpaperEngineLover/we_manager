import clsx from 'clsx'

export default function Toggle({
  on,
  onClick,
  disabled = false,
  title
}: {
  on: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        on ? 'bg-accent-600 shadow-[0_0_10px_-2px] shadow-accent-500/60' : 'bg-fg/10 hover:bg-fg/15'
      )}
    >
      <span
        className={clsx(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
          on ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
