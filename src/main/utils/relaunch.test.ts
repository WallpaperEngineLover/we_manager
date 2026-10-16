import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))

import { appImageFreeEnv } from './relaunch'

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
