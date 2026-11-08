import { useSyncExternalStore } from 'react'

export function createStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  return {
    get: () => state,
    update(next: Partial<T>) {
      state = { ...state, ...next }
      listeners.forEach((l) => { l() })
    },
    use: () => useSyncExternalStore(subscribe, () => state),
    useSelect: <S>(select: (state: T) => S) => useSyncExternalStore(subscribe, () => select(state))
  }
}
