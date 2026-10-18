import { BrowserWindow, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { WallpaperMeta } from '@shared/types'
import { t } from '../i18n'

type DependencyInstaller = (dependencyId: string) => Promise<void>

let installer: DependencyInstaller | null = null

const alreadyAsked = new Set<string>()

export function setDependencyInstaller(fn: DependencyInstaller): void {
  installer = fn
}

export function getMissingDependency(wallpaper: WallpaperMeta): string | null {
  if (!wallpaper.localPath) return null

  try {
    const project = JSON.parse(fs.readFileSync(path.join(wallpaper.localPath, 'project.json'), 'utf8'))
    const dependency = project?.dependency
    if (dependency === undefined || dependency === null || dependency === '') return null

    const dependencyId = String(dependency)
    if (!/^\d+$/.test(dependencyId)) return null

    const baseDir = path.join(path.dirname(path.resolve(wallpaper.localPath)), dependencyId)
    return fs.existsSync(path.join(baseDir, 'project.json')) ? null : dependencyId
  } catch {
    return null
  }
}

// throws unless the wallpaper can go ahead, since after "Install now" the download has only just started
export async function ensureDependencyInstalled(
  wallpaper: WallpaperMeta,
  mode: 'always' | 'once' = 'always'
): Promise<void> {
  const dependencyId = getMissingDependency(wallpaper)
  if (!dependencyId) return

  const title = wallpaper.title || wallpaper.id

  if (mode === 'once' && alreadyAsked.has(dependencyId)) {
    throw new Error(t('dependency.skipped', { title, id: dependencyId }))
  }
  alreadyAsked.add(dependencyId)

  const options = {
    type: 'warning' as const,
    title: t('dependency.title'),
    message: t('dependency.message', { title }),
    detail: `${t('dependency.detail', { id: dependencyId })}\n\n${t('dependency.question')}`,
    buttons: [t('dependency.install'), t('dependency.applyAnyway'), t('common.cancel')],
    defaultId: 0,
    cancelId: 2
  }
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)

  if (response === 1) return

  if (response === 0) {
    if (!installer) throw new Error(t('dependency.notReady', { id: dependencyId }))
    try {
      await installer(dependencyId)
    } catch (err) {
      throw new Error(t('dependency.subscribeFailed', { id: dependencyId, error: (err as Error).message }), { cause: err })
    }
    throw new Error(t('dependency.downloading', { id: dependencyId, title }))
  }

  throw new Error(t('dependency.notApplied', { title, id: dependencyId }))
}
