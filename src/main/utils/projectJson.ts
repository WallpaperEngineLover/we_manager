import * as fs from 'fs'
import * as path from 'path'
import type { ProjectJson } from '../services/library.service'

const projectFile = (dir: string): string => path.join(dir, 'project.json')

export function readProjectJsonSync(dir: string): ProjectJson | null {
  try {
    return JSON.parse(fs.readFileSync(projectFile(dir), 'utf8')) as ProjectJson
  } catch {
    return null
  }
}

export async function readProjectJson(dir: string): Promise<ProjectJson | null> {
  try {
    return JSON.parse(await fs.promises.readFile(projectFile(dir), 'utf8')) as ProjectJson
  } catch {
    return null
  }
}
