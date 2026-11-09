import { createStore } from './externalStore'
import type { QuickLine, QuickProgress, QuickTrim } from '@shared/video-tools'
import { formatFileSize } from '../utils/format'
import { t } from '../i18n'

interface QuickState {
  running: boolean
  progress: QuickProgress | null
  percent: number
  lines: QuickLine[]
  summary: string | null
  error: string | null
  question: QuickTrim[] | null
}

export type TrimAnswer = 'trim' | 'keep' | 'cancel'

// Outside React so the run, its progress and its result survive switching views.
const store = createStore<QuickState>({ running: false, progress: null, percent: 0, lines: [], summary: null, error: null, question: null })
let answerTrim: ((answer: TrimAnswer) => void) | null = null
const update = store.update

export function dismissQuickOptimize() {
  if (!store.get().running) update({ lines: [], summary: null, error: null })
}

export function answerQuickTrim(answer: TrimAnswer) {
  answerTrim?.(answer)
}

function askAboutTrim(items: QuickTrim[]): Promise<TrimAnswer> {
  return new Promise((resolve) => {
    answerTrim = (answer) => {
      answerTrim = null
      update({ question: null })
      resolve(answer)
    }
    update({ question: items, lines: [], summary: null, error: null })
  })
}

let preparing = false

export async function runQuickOptimize(ids: string[], onDone: () => void) {
  if (preparing || store.get().running || store.get().question || ids.length === 0) return
  preparing = true
  let trim = false
  try {
    const { trimMode } = await window.electronAPI.videoTools.getSettings()
    const trimmed = trimMode === 'never' ? [] : await window.electronAPI.videoTools.quickTrims(ids)
    if (trimmed.length > 0) {
      const answer = trimMode === 'ask' ? await askAboutTrim(trimmed) : 'trim'
      if (answer === 'cancel') return
      trim = answer === 'trim'
    }
  } catch (err) {
    update({ lines: [], summary: null, error: (err as Error).message })
    return
  } finally {
    preparing = false
  }
  update({ running: true, progress: null, percent: 0, lines: [], summary: null, error: null })
  const offQuick = window.electronAPI.on.videoToolsQuick((progress) => { update({ progress, percent: 0 }) })
  const offProgress = window.electronAPI.on.videoToolsProgress((p) => {
    if (p.itemId === store.get().progress?.id && p.stage === 'encoding') update({ percent: p.percentage })
  })
  try {
    const report = await window.electronAPI.videoTools.quick(ids, trim)
    const summary =
      report.optimized === 0
        ? null
        : report.originalsKept
          ? t('quick.doneKept', { count: report.optimized, size: formatFileSize(report.savedBytes) ?? '' })
          : t('quick.done', { count: report.optimized, size: formatFileSize(report.savedBytes) ?? '' })
    update({ lines: report.lines, summary })
  } catch (err) {
    update({ lines: [], summary: null, error: (err as Error).message })
  } finally {
    offQuick()
    offProgress()
    update({ running: false, progress: null, percent: 0 })
    onDone()
  }
}

export const useQuickOptimize = store.use
export const useQuickOptimizeRunning = (): boolean => store.useSelect((s) => s.running)
