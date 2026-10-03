import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

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
