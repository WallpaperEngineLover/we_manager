import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

const sessionValues = new Map<string, unknown>()

// useState backed by localStorage. load turns the stored JSON back into a value, returning the
// fallback for anything it doesn't accept (wrong version, old shape).
export function usePersistentState<T>(
  key: string,
  fallback: T,
  load: (stored: unknown) => T = (stored) => ({ ...fallback, ...(stored as object) })
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? load(JSON.parse(raw)) : fallback
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage disabled or full, the value just won't survive a restart
    }
  }, [key, value])

  return [value, setValue]
}

// useState that survives the view unmounting (switching tabs) but not an app restart
export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (sessionValues.has(key) ? (sessionValues.get(key) as T) : initial))

  useEffect(() => {
    sessionValues.set(key, value)
  }, [key, value])

  return [value, setValue]
}

const PAGE_SIZES = [50, 100, 200]

export function loadPageSize(stored: unknown): number {
  return typeof stored === 'number' && PAGE_SIZES.includes(stored) ? stored : 50
}
