import { createStore } from './externalStore'

export type LibraryTask = 'scan-library' | 'backup-selection' | 'scan-backups' | 'check-unavailable' | 'backup-unavailable' | 'verify-files'

interface TaskState {
  running: ReadonlySet<LibraryTask>
  status: string | null
}

// Lives outside the component so a task started in the library view still shows as running,
// and its result still lands, after switching to another view and back.
const store = createStore<TaskState>({ running: new Set(), status: null })
const update = store.update

export function setLibraryTaskStatus(status: string | null) {
  update({ status })
}

export function clearFinishedLibraryTaskStatus() {
  if (store.get().running.size === 0) update({ status: null })
}

export async function runLibraryTask(task: LibraryTask, work: () => Promise<string>) {
  update({ running: new Set(store.get().running).add(task), status: null })
  try {
    setLibraryTaskStatus(await work())
  } finally {
    const running = new Set(store.get().running)
    running.delete(task)
    update({ running })
  }
}

export const useLibraryTasks = store.use
