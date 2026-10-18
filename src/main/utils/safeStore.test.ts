import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

let userData = ''

vi.mock('electron', () => ({ app: { getPath: () => userData } }))
vi.mock('electron-store', async () => {
  const { default: Conf } = await import('conf')
  return {
    default: class extends Conf<Record<string, unknown>> {
      constructor({ name = 'config', ...options }: { name?: string; defaults?: Record<string, unknown> } = {}) {
        super({ ...options, configName: name, cwd: userData, projectName: 'we-manager-test' })
      }
    }
  }
})

const { openStore, setAsideUnreadable, takeResetStores } = await import('./safeStore')

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-store-'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  takeResetStores()
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('openStore', () => {
  it('opens a healthy store untouched', () => {
    fs.writeFileSync(path.join(userData, 'library.json'), JSON.stringify({ wallpapers: { 1: 'a' } }))
    const store = openStore<{ wallpapers: Record<string, string> }>({ name: 'library', defaults: { wallpapers: {} } })
    expect(store.get('wallpapers')).toEqual({ 1: 'a' })
    expect(takeResetStores()).toEqual([])
    expect(fs.readdirSync(userData)).toEqual(['library.json'])
  })

  it('starts with defaults and keeps the unreadable file next to it', () => {
    const file = path.join(userData, 'playlists.json')
    fs.writeFileSync(file, '{"playlists": [{"id": "a"')
    const store = openStore<{ playlists: unknown[] }>({ name: 'playlists', defaults: { playlists: [] } })

    expect(store.get('playlists')).toEqual([])
    const kept = fs.readdirSync(userData).filter((name) => name.startsWith('playlists.json.corrupt-'))
    expect(kept).toHaveLength(1)
    expect(fs.readFileSync(path.join(userData, kept[0]), 'utf8')).toBe('{"playlists": [{"id": "a"')

    store.set('playlists', [{ id: 'b' }])
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ playlists: [{ id: 'b' }] })
    expect(takeResetStores()).toEqual([{ file, keptAs: path.join(userData, kept[0]) }])
    expect(takeResetStores()).toEqual([])
  })

  it('treats an empty file the same way', () => {
    fs.writeFileSync(path.join(userData, 'schedule.json'), '')
    const store = openStore<{ rules: unknown[] }>({ name: 'schedule', defaults: { rules: [] } })
    expect(store.get('rules')).toEqual([])
    expect(takeResetStores()).toHaveLength(1)
  })

  it('uses config as the default name', () => {
    fs.writeFileSync(path.join(userData, 'config.json'), 'nope')
    openStore<{ a: number }>({ defaults: { a: 1 } })
    expect(fs.readdirSync(userData).some((name) => name.startsWith('config.json.corrupt-'))).toBe(true)
  })

  it('does not hide other errors', () => {
    fs.mkdirSync(path.join(userData, 'library.json'))
    expect(() => openStore({ name: 'library' })).toThrow(/EISDIR/)
    expect(takeResetStores()).toEqual([])
  })
})

describe('setAsideUnreadable', () => {
  it('never overwrites an earlier copy', () => {
    const file = path.join(userData, 'x.json')
    const now = new Date('2026-10-17T10:00:00Z')
    fs.writeFileSync(file, 'one')
    const first = setAsideUnreadable(file, now)
    fs.writeFileSync(file, 'two')
    const second = setAsideUnreadable(file, now)
    expect(first).not.toBe(second)
    expect(fs.readFileSync(first, 'utf8')).toBe('one')
    expect(fs.readFileSync(second, 'utf8')).toBe('two')
  })
})
