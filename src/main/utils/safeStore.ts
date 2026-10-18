import { app } from 'electron'
import Store, { type Options } from 'electron-store'
import * as fs from 'fs'
import * as path from 'path'

export interface ResetStore {
  file: string
  keptAs: string
}

const resetStores: ResetStore[] = []

export function setAsideUnreadable(file: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  let target = `${file}.corrupt-${stamp}`
  for (let n = 2; fs.existsSync(target); n++) target = `${file}.corrupt-${stamp}-${n}`
  fs.renameSync(file, target)
  return target
}

export function openStore<T extends Record<string, any>>(options?: Options<T>): Store<T> {
  try {
    return new Store<T>(options)
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
    const file = path.join(app.getPath('userData'), `${options?.name ?? 'config'}.json`)
    const keptAs = setAsideUnreadable(file)
    console.error(`[Store] ${file} is not valid JSON, starting with defaults. The old file is kept as ${keptAs}`)
    resetStores.push({ file, keptAs })
    return new Store<T>(options)
  }
}

export function takeResetStores(): ResetStore[] {
  return resetStores.splice(0)
}
