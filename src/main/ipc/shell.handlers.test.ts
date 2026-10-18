import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { IpcChannels } from '@shared/ipc-channels'

const handlers = new Map<string, (...args: unknown[]) => Promise<{ ok: boolean; error?: string }>>()
const openPath = vi.fn<(p: string) => Promise<string>>(async () => '')
const openExternal = vi.fn<(u: string) => Promise<void>>(async () => {})

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: never) => handlers.set(channel, fn) },
  shell: { openPath: (p: string) => openPath(p), openExternal: (u: string) => openExternal(u), showItemInFolder: vi.fn<(p: string) => void>() }
}))

const { registerShellHandlers } = await import('./shell.handlers')

function call(channel: string, ...args: unknown[]) {
  return handlers.get(channel)!({}, ...args)
}

describe('shell handlers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wem-shell-'))

  beforeEach(() => {
    handlers.clear()
    openPath.mockClear()
    openExternal.mockClear()
    registerShellHandlers()
  })

  it('opens an existing folder', async () => {
    expect(await call(IpcChannels.SHELL_OPEN_PATH, dir)).toEqual({ ok: true, error: undefined })
    expect(openPath).toHaveBeenCalledWith(dir)
  })

  it('does not hand a missing path or a non-string to the opener', async () => {
    expect((await call(IpcChannels.SHELL_OPEN_PATH, path.join(dir, 'nope'))).ok).toBe(false)
    expect((await call(IpcChannels.SHELL_OPEN_PATH, '')).ok).toBe(false)
    expect((await call(IpcChannels.SHELL_OPEN_PATH, { toString: () => dir })).ok).toBe(false)
    expect(openPath).not.toHaveBeenCalled()
  })

  it('opens only safe links', async () => {
    expect((await call(IpcChannels.SHELL_OPEN_EXTERNAL, 'file:///etc/passwd')).ok).toBe(false)
    expect((await call(IpcChannels.SHELL_OPEN_EXTERNAL, 'https://example.org')).ok).toBe(true)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})
