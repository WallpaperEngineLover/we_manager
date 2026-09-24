import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listDesktopApplications } from './shortcuts.service'

let root: string
const savedEnv = { home: process.env.XDG_DATA_HOME, dirs: process.env.XDG_DATA_DIRS }

function writeEntry(dataDir: string, name: string, body: string): void {
  const dir = path.join(root, dataDir, 'applications')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name), `[Desktop Entry]\n${body}\n`)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-apps-'))
  process.env.XDG_DATA_HOME = path.join(root, 'home')
  process.env.XDG_DATA_DIRS = path.join(root, 'system')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  process.env.XDG_DATA_HOME = savedEnv.home
  process.env.XDG_DATA_DIRS = savedEnv.dirs
})

describe('listDesktopApplications', () => {
  it('lists visible apps sorted by name', () => {
    writeEntry('system', 'zed.desktop', 'Type=Application\nName=Zed\nExec=zed')
    writeEntry('system', 'alpha.desktop', 'Type=Application\nName=Alpha\nName[de]=Alpha DE\nExec=alpha')
    writeEntry('system', 'hidden.desktop', 'Type=Application\nName=Hidden\nNoDisplay=true')
    writeEntry('system', 'link.desktop', 'Type=Link\nName=Link\nURL=https://example.org')

    expect(listDesktopApplications().map((a) => a.name)).toEqual(['Alpha', 'Zed'])
  })

  it('lets the user dir hide a system app with the same id', () => {
    writeEntry('system', 'editor.desktop', 'Type=Application\nName=System Editor\nExec=editor')
    writeEntry('home', 'editor.desktop', 'Type=Application\nName=My Editor\nExec=editor')

    const apps = listDesktopApplications()
    expect(apps).toHaveLength(1)
    expect(apps[0].name).toBe('My Editor')
    expect(apps[0].file).toBe(path.join(root, 'home', 'applications', 'editor.desktop'))
  })
})
