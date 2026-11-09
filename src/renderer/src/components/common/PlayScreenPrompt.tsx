import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ScreenTarget } from '@shared/types'
import { CARD_PLAY_DEFAULT_SCREEN } from '@shared/playScreen'
import { t } from '../../i18n'
import ScreenSelect from './ScreenSelect'

type Pending = {
  targets: ScreenTarget[]
  resolve: (screen: ScreenTarget | null) => void
}

let openPrompt: ((targets: ScreenTarget[]) => Promise<ScreenTarget | null>) | null = null

/** null means cancel. The default is every screen, which is what card Play used to do. */
export function askPlayScreen(targets: ScreenTarget[]): Promise<ScreenTarget | null> {
  if (!openPrompt) return Promise.resolve(CARD_PLAY_DEFAULT_SCREEN)
  return openPrompt(targets)
}

export default function PlayScreenPrompt() {
  const [pending, setPending] = useState<Pending | null>(null)
  const [value, setValue] = useState<ScreenTarget>(CARD_PLAY_DEFAULT_SCREEN)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    openPrompt = (targets) => new Promise((resolve) => {
      setValue(CARD_PLAY_DEFAULT_SCREEN)
      setPending({ targets, resolve })
    })
    return () => { openPrompt = null }
  }, [])

  function finish(screen: ScreenTarget | null) {
    pending?.resolve(screen)
    setPending(null)
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      finish(null)
      return
    }
    if (e.key !== 'Tab') return
    const root = dialogRef.current
    if (!root) return
    const items = [...root.querySelectorAll<HTMLElement>('button, select, input, a, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hasAttribute('disabled'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!pending) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="play-screen-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-sm rounded-xl border border-fg/10 bg-popup p-4 shadow-2xl"
      >
        <h3 id="play-screen-title" className="text-sm font-semibold text-gray-100">{t('playlist.whichScreen')}</h3>
        <div className="mt-3">
          <ScreenSelect targets={pending.targets} value={value} onChange={setValue} title={t('playlist.whichScreen')} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { finish(null) }}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-300 hover:bg-fg/5"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => { finish(value) }}
            className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-500"
          >
            {t('play.wallpaper')}
          </button>
        </div>
      </div>
    </div>
  )
}
