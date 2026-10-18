export interface KeyedCommitter<V> {
  commit: (key: string, value: V) => void
  hasPending: (key: string) => boolean
}

export function createKeyedCommitter<V>(
  save: (changes: Record<string, V>) => Promise<void>,
  onSettled: (keys: string[], idle: boolean) => void
): KeyedCommitter<V> {
  const waiting = new Map<string, V>()
  let running = false

  async function drain(): Promise<void> {
    running = true
    try {
      while (waiting.size > 0) {
        const changes = Object.fromEntries(waiting) as Record<string, V>
        waiting.clear()
        try {
          await save(changes)
        } catch (err) {
          console.error('Saving a change failed:', err)
        }
        onSettled(Object.keys(changes).filter((key) => !waiting.has(key)), waiting.size === 0)
      }
    } finally {
      running = false
    }
  }

  return {
    commit(key, value) {
      waiting.set(key, value)
      if (!running) void drain()
    },
    hasPending: (key) => waiting.has(key)
  }
}
