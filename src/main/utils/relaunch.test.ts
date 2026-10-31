import * as os from 'os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { app, unref, spawn, runningAppImage } = vi.hoisted(() => {
  const unref = vi.fn<() => void>()
  return {
    app: {
      relaunch: vi.fn<(options: { args: string[] }) => void>(),
      quit: vi.fn<() => void>(),
      exit: vi.fn<(code: number) => void>(),
      releaseSingleInstanceLock: vi.fn<() => void>()
    },
    unref,
    spawn: vi.fn<(cmd: string, args: string[], opts: object) => { unref: () => void }>(() => ({ unref })),
    runningAppImage: vi.fn<() => string | undefined>()
  }
})

vi.mock('electron', () => ({ app }))
vi.mock('child_process', () => ({ spawn }))
vi.mock('./platform', () => ({ runningAppImage }))

import { appImageFreeEnv, relaunchApp } from './relaunch'

beforeEach(() => {
  app.relaunch.mockReset()
  app.quit.mockReset()
  app.exit.mockReset()
  spawn.mockClear()
  unref.mockClear()
  runningAppImage.mockReset()
})

describe('appImageFreeEnv', () => {
  it('drops the AppImage variables and the old mount from path lists', () => {
    const env = appImageFreeEnv({
      APPDIR: '/tmp/.mount_WE-Man123',
      APPIMAGE: '/home/u/WE-Manager.AppImage',
      ARGV0: '/home/u/WE-Manager.AppImage',
      OWD: '/home/u',
      PATH: '/tmp/.mount_WE-Man123:/tmp/.mount_WE-Man123/usr/sbin:/usr/local/bin:/usr/bin',
      LD_LIBRARY_PATH: '/tmp/.mount_WE-Man123/usr/lib',
      XDG_DATA_DIRS: '/tmp/.mount_WE-Man123/usr/share/::/usr/share/gnome:/usr/share/',
      HOME: '/home/u'
    })
    expect(env).toEqual({
      PATH: '/usr/local/bin:/usr/bin',
      XDG_DATA_DIRS: '/usr/share/gnome:/usr/share/',
      HOME: '/home/u'
    })
  })

  it('keeps a prefix-alike folder that is not inside the mount', () => {
    const env = appImageFreeEnv({ APPDIR: '/tmp/.mount_a', PATH: '/tmp/.mount_ab/bin:/usr/bin' })
    expect(env.PATH).toBe('/tmp/.mount_ab/bin:/usr/bin')
  })
})

describe('appImageFreeEnv without an AppImage mount', () => {
  it('only drops the AppImage variables and leaves the path lists alone', () => {
    const input = { APPIMAGE: '/x.AppImage', PATH: '/usr/bin:/bin', LD_LIBRARY_PATH: '/opt/lib' }
    const env = appImageFreeEnv(input)
    expect(env).toEqual({ PATH: '/usr/bin:/bin', LD_LIBRARY_PATH: '/opt/lib' })
    expect(input.APPIMAGE).toBe('/x.AppImage')
  })

  it('removes a path list that only held the mount or nothing, and skips unset ones', () => {
    const env = appImageFreeEnv({ APPDIR: '/tmp/.mount_a', LD_LIBRARY_PATH: '/tmp/.mount_a/usr/lib:/tmp/.mount_a', GSETTINGS_SCHEMA_DIR: '' })
    expect(env).toEqual({})
  })

  it('keeps entries elsewhere in a list that mentions the mount', () => {
    const env = appImageFreeEnv({ APPDIR: '/tmp/.mount_a', PATH: '/usr/bin:/tmp/.mount_a/usr/bin:/bin' })
    expect(env.PATH).toBe('/usr/bin:/bin')
  })
})

describe('relaunchApp', () => {
  it("lets Electron relaunch with the given arguments and quits outside an AppImage", () => {
    runningAppImage.mockReturnValue(undefined)
    relaunchApp(['--hidden'])
    expect(app.relaunch).toHaveBeenCalledWith({ args: ['--hidden'] })
    expect(app.quit).toHaveBeenCalledTimes(1)
    expect(app.exit).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('exits instead of quitting when asked to', () => {
    runningAppImage.mockReturnValue(undefined)
    relaunchApp([], 'exit')
    expect(app.exit).toHaveBeenCalledWith(0)
    expect(app.quit).not.toHaveBeenCalled()
  })

  it('starts an AppImage itself, detached, in the folder it was started from', () => {
    runningAppImage.mockReturnValue('/home/u/WE.AppImage')
    vi.stubEnv('OWD', '/home/u/start')
    vi.stubEnv('APPDIR', '/tmp/.mount_a')
    relaunchApp(['--minimized'])
    expect(app.relaunch).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = spawn.mock.calls[0] as unknown as [string, string[], { detached: boolean; stdio: string; cwd: string; env: NodeJS.ProcessEnv }]
    expect(cmd).toBe('bash')
    expect(args[0]).toBe('-c')
    expect(args.slice(2)).toEqual(['/home/u/WE.AppImage', '--minimized'])
    expect(opts).toMatchObject({ detached: true, stdio: 'ignore', cwd: '/home/u/start' })
    expect(opts.env.APPDIR).toBeUndefined()
    expect(opts.env.OWD).toBeUndefined()
    expect(unref).toHaveBeenCalledTimes(1)
    expect(app.releaseSingleInstanceLock.mock.invocationCallOrder[0]).toBeLessThan(spawn.mock.invocationCallOrder[0])
    expect(app.quit).toHaveBeenCalledTimes(1)
    vi.unstubAllEnvs()
  })

  it('falls back to the home folder without OWD', () => {
    runningAppImage.mockReturnValue('/home/u/WE.AppImage')
    vi.stubEnv('OWD', '')
    relaunchApp([])
    expect((spawn.mock.calls[0] as unknown as [string, string[], { cwd: string }])[2].cwd).toBe(os.homedir())
    vi.unstubAllEnvs()
  })

  it('closes inherited descriptors before it execs the AppImage', () => {
    runningAppImage.mockReturnValue('/home/u/WE.AppImage')
    relaunchApp([])
    const script = (spawn.mock.calls[0] as unknown as [string, string[]])[1][1]
    expect(script).toContain('/proc/$$/fd/*')
    expect(script).toContain('[ "$fd" -gt 2 ]')
    expect(script).toContain('exec "$0" "$@"')
  })
})
