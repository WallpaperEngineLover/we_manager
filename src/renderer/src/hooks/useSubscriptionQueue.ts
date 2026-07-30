import { useCallback, useRef, useState } from 'react'
import type { DownloadProgressEvent } from '@shared/types'

export type SubscribeState =
  | 'queued'
  | 'subscribing'
  | 'subscribe-error'
  | 'download-queued'
  | 'downloading'
  | 'done'
  | 'download-error'

export interface SubscribeEntry {
  state: SubscribeState
  percentage?: number
}

// Subscribing on Steam and downloading the item locally are separate concerns:
// a full disk (or any other download failure) shouldn't stop someone from
// being subscribed. So there are two independent queues. Subscribing is a
// quick Steam API call and races ahead for every selected item; downloads are
// drained one at a time in their own queue (concurrent downloads is what made
// "subscribe 4+ items" unreliable), decoupled from how fast items get
// subscribed. A 'download-error' still leaves the item subscribed - only
// 'subscribe-error' means the item never actually got subscribed.
const SETTLE_TIMEOUT_MS = 90_000

export function useSubscriptionQueue(onSettled?: () => void) {
  const [entries, setEntries] = useState<Map<string, SubscribeEntry>>(new Map())
  const subscribeQueueRef = useRef<string[]>([])
  const downloadQueueRef = useRef<string[]>([])
  const activeRef = useRef<Set<string>>(new Set())
  const subscribingRef = useRef(false)
  const downloadingRef = useRef(false)

  const setEntry = useCallback((id: string, entry: SubscribeEntry | null) => {
    setEntries((prev) => {
      const next = new Map(prev)
      if (entry === null) next.delete(id)
      else next.set(id, entry)
      return next
    })
  }, [])

  const waitForSettled = useCallback((id: string) => {
    return new Promise<'completed' | 'error'>((resolve) => {
      let settled = false
      let off: () => void = () => {}
      const finish = (status: 'completed' | 'error') => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        off()
        resolve(status)
      }
      off = window.electronAPI.on.downloadProgress((progress: DownloadProgressEvent) => {
        if (progress.itemId !== id) return
        if (progress.status === 'downloading') {
          setEntry(id, { state: 'downloading', percentage: progress.percentage })
          return
        }
        finish(progress.status)
      })
      const timer = setTimeout(() => finish('error'), SETTLE_TIMEOUT_MS)
    })
  }, [setEntry])

  const processDownloadQueue = useCallback(async () => {
    if (downloadingRef.current) return
    downloadingRef.current = true
    while (downloadQueueRef.current.length > 0) {
      const id = downloadQueueRef.current.shift()!
      setEntry(id, { state: 'downloading', percentage: 0 })
      const result = await waitForSettled(id)
      setEntry(id, result === 'completed' ? { state: 'done' } : { state: 'download-error' })
      activeRef.current.delete(id)
      onSettled?.()
    }
    downloadingRef.current = false
  }, [setEntry, waitForSettled, onSettled])

  const processSubscribeQueue = useCallback(async () => {
    if (subscribingRef.current) return
    subscribingRef.current = true
    while (subscribeQueueRef.current.length > 0) {
      const id = subscribeQueueRef.current.shift()!
      setEntry(id, { state: 'subscribing' })
      try {
        await window.electronAPI.steam.subscribe(id)
        setEntry(id, { state: 'download-queued' })
        downloadQueueRef.current.push(id)
        processDownloadQueue()
      } catch {
        setEntry(id, { state: 'subscribe-error' })
        activeRef.current.delete(id)
        onSettled?.()
      }
    }
    subscribingRef.current = false
  }, [setEntry, processDownloadQueue, onSettled])

  const enqueue = useCallback(
    (ids: string[]) => {
      let added = false
      for (const id of ids) {
        if (activeRef.current.has(id)) continue
        activeRef.current.add(id)
        subscribeQueueRef.current.push(id)
        setEntry(id, { state: 'queued' })
        added = true
      }
      if (added) processSubscribeQueue()
    },
    [processSubscribeQueue, setEntry]
  )

  const clear = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        activeRef.current.delete(id)
        subscribeQueueRef.current = subscribeQueueRef.current.filter((q) => q !== id)
        downloadQueueRef.current = downloadQueueRef.current.filter((q) => q !== id)
        setEntry(id, null)
      }
    },
    [setEntry]
  )

  return { entries, enqueue, clear }
}
