import { createStore } from './externalStore'
import type { OptimizeResult } from '@shared/video-tools'

interface BackgroundState {
  id: string | null
  phase: 'running' | 'review' | null
  percent: number
  result: OptimizeResult | null
  error: string | null
  finishing: boolean
}

const idle: BackgroundState = { id: null, phase: null, percent: 0, result: null, error: null, finishing: false }

// Outside React so a job handed over from the dialog keeps going after the dialog is gone.
const store = createStore<BackgroundState>(idle)
let cancelRequested = false

export function detachOptimize(id: string, job: Promise<OptimizeResult>) {
  cancelRequested = false
  store.update({ ...idle, id, phase: 'running' })
  const off = window.electronAPI.on.videoToolsProgress((p) => {
    if (p.itemId === id && p.stage === 'encoding') store.update({ percent: p.percentage })
  })
  job.then(
    (result) => { store.update({ phase: 'review', result }) },
    (err: Error) => { store.update(cancelRequested ? idle : { ...idle, error: err.message }) }
  ).finally(off)
}

export function cancelBackgroundOptimize() {
  cancelRequested = true
  void window.electronAPI.videoTools.cancel()
}

export async function finishBackgroundOptimize(keep: boolean, onDone: () => void) {
  const { id, finishing } = store.get()
  if (!id || finishing) return
  store.update({ finishing: true })
  try {
    await window.electronAPI.videoTools.finish(id, keep)
    store.update(idle)
    if (keep) onDone()
  } catch (err) {
    store.update({ finishing: false, error: (err as Error).message })
  }
}

export function dismissBackgroundError() {
  if (store.get().phase === null) store.update({ error: null })
}

export const useBackgroundOptimize = store.use
