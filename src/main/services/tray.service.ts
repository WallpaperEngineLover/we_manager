import { Tray, Menu, nativeImage, type BrowserWindow } from 'electron'
import { app } from 'electron'
import {
  getPlaybackState,
  pausePlaylist,
  resumePlaylist,
  nextItem,
  onPlaybackStateChanged
} from './playlist-player.service'
import { getAllPlaylists } from './playlist.service'

// 32x32 solid indigo circle on a transparent background, generated once and inlined so
// the app doesn't need a bundled icon asset just for the tray.
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAcklEQVR4nO3O2w3AIAxDUabrL/sPwBztArxM7ARVseTve0rJgatPe2cPC8sgaJgKscZNCFb8CMGOQwhVfBsRClDHl4hQgFd8iEhAAhIQDvBEdONXADwQ0/gVACViK65CQHE24ijOQpjiFggtjEJk4d/uAxec83TU+/bHAAAAAElFTkSuQmCC'

let tray: Tray | null = null
let trayWin: BrowserWindow | null = null
let unsubscribePlayback: (() => void) | null = null

function buildMenu(): Menu {
  const state = getPlaybackState()
  const playlists = getAllPlaylists()
  const activePlaylist = playlists.find((p) => p.id === state.playlistId)

  return Menu.buildFromTemplate([
    {
      label: trayWin?.isVisible() ? 'Hide WE Manager' : 'Show WE Manager',
      click: () => {
        if (!trayWin) return
        if (trayWin.isVisible()) trayWin.hide()
        else trayWin.show()
      }
    },
    { type: 'separator' },
    {
      label: activePlaylist
        ? `Playing: ${activePlaylist.title}`
        : 'No playlist active',
      enabled: false
    },
    {
      label: state.isPlaying ? 'Pause' : 'Resume',
      enabled: state.playlistId !== null,
      click: () => {
        if (state.isPlaying) pausePlaylist()
        else resumePlaylist()
        refreshMenu()
      }
    },
    {
      label: 'Next Wallpaper',
      enabled: state.playlistId !== null,
      click: () => {
        void nextItem().then(refreshMenu)
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ])
}

function refreshMenu(): void {
  if (tray) tray.setContextMenu(buildMenu())
}

export function createTray(win: BrowserWindow): void {
  if (tray) return
  trayWin = win

  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  tray = new Tray(icon)
  tray.setToolTip('WE Manager')
  tray.setContextMenu(buildMenu())
  tray.on('click', () => {
    if (!trayWin) return
    if (trayWin.isVisible()) trayWin.hide()
    else trayWin.show()
  })

  unsubscribePlayback = onPlaybackStateChanged(refreshMenu)
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
  unsubscribePlayback?.()
  unsubscribePlayback = null
}

export function isTrayActive(): boolean {
  return tray !== null
}
