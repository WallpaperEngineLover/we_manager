import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, TriangleAlert } from 'lucide-react'
import clsx from 'clsx'

interface ToastOptions {
  warning?: boolean
  durationMs?: number
}

interface ToastItem {
  id: number
  message: string
  warning: boolean
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const showToast = useCallback((message: string, options: ToastOptions = {}) => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, message, warning: !!options.warning }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, options.durationMs ?? 2000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'flex max-w-sm items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-white shadow-2xl',
              t.warning ? 'border-amber-500/30 bg-amber-600/90' : 'border-green-500/30 bg-green-600/90'
            )}
          >
            {t.warning ? <TriangleAlert size={13} className="shrink-0" /> : <CheckCircle2 size={13} className="shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
