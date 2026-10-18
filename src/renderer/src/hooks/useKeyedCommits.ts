import { useEffect, useRef, useState } from 'react'
import { createKeyedCommitter, type KeyedCommitter } from '../utils/keyedCommitter'

interface Channel<V> {
  latest: { saved: Record<string, V>; save: (next: Record<string, V>) => Promise<void> }
  sent: Record<string, V> | null
  committer: KeyedCommitter<V>
}

export function useKeyedCommits<V>(
  scope: string,
  saved: Record<string, V>,
  save: (next: Record<string, V>) => Promise<void>
): { values: Record<string, V>; commit: (key: string, value: V) => void } {
  const [inFlight, setInFlight] = useState<{ scope: string; values: Record<string, V> }>({ scope, values: {} })
  const props = useRef({ saved, save })
  const channels = useRef(new Map<string, Channel<V>>())

  useEffect(() => {
    props.current = { saved, save }
    const channel = channels.current.get(scope)
    if (channel) channel.latest = props.current
  })

  function openChannel(): Channel<V> {
    const channel: Channel<V> = {
      latest: props.current,
      sent: null,
      committer: createKeyedCommitter<V>(
        async (changes) => {
          const next = { ...(channel.sent ?? channel.latest.saved), ...changes }
          channel.sent = next
          await channel.latest.save(next)
        },
        (keys, idle) => {
          if (idle) channel.sent = null
          setInFlight((current) => {
            if (current.scope !== scope) return current
            const rest = { ...current.values }
            for (const key of keys) delete rest[key]
            return { scope, values: rest }
          })
        }
      )
    }
    return channel
  }

  function commit(key: string, value: V): void {
    let channel = channels.current.get(scope)
    if (!channel) {
      channel = openChannel()
      channels.current.set(scope, channel)
    }
    setInFlight((current) => ({ scope, values: { ...(current.scope === scope ? current.values : {}), [key]: value } }))
    channel.committer.commit(key, value)
  }

  return { values: inFlight.scope === scope ? { ...saved, ...inFlight.values } : saved, commit }
}
