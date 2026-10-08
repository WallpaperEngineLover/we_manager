import * as fs from 'fs'
import * as path from 'path'

export interface LocalWallpaperFolder {
  id: string
  localPath: string
}

const WORKSHOP_ID = /^\d+$/

/** Numeric folder name, else project.json's workshopid, else the folder name; null without a readable project.json */
export async function localWallpaperId(dir: string): Promise<string | null> {
  let pj: { workshopid?: unknown } | null
  try {
    pj = JSON.parse(await fs.promises.readFile(path.join(dir, 'project.json'), 'utf8'))
  } catch {
    return null
  }
  const name = path.basename(dir)
  if (WORKSHOP_ID.test(name)) return name
  const fromProject = pj?.workshopid === undefined ? '' : String(pj.workshopid)
  return WORKSHOP_ID.test(fromProject) ? fromProject : name
}

/** Wallpaper folders per root, the first root wins on duplicate ids; missing roots aren't in `mounted` */
export async function findLocalWallpapers(
  roots: string[]
): Promise<{ found: LocalWallpaperFolder[]; mounted: string[] }> {
  const found: LocalWallpaperFolder[] = []
  const mounted: string[] = []
  const seen = new Set<string>()

  for (const root of roots) {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true })
    } catch {
      continue
    }
    mounted.push(root)

    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
    const ids: (string | null)[] = Array.from({ length: dirs.length }, () => null)
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < dirs.length) {
        const i = next++
        ids[i] = await localWallpaperId(path.join(root, dirs[i]))
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))

    dirs.forEach((name, i) => {
      const id = ids[i]
      if (!id || seen.has(id)) return
      seen.add(id)
      found.push({ id, localPath: path.join(root, name) })
    })
  }

  return { found, mounted }
}
