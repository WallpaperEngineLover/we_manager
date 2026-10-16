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
import { t } from '../i18n'
import appIcon from '../../../resources/icon.png?asset'


let tray: Tray | null = null
let trayWin: BrowserWindow | null = null
let unsubscribePlayback: (() => void) | null = null

function buildMenu(): Menu {
  const state = getPlaybackState()
  const playlists = getAllPlaylists()
  const activePlaylist = playlists.find((p) => p.id === state.playlistId)

  return Menu.buildFromTemplate([
    {
      label: trayWin?.isVisible() ? t('tray.hide') : t('tray.show'),
      click: () => {
        if (!trayWin) return
        if (trayWin.isVisible()) trayWin.hide()
        else trayWin.show()
      }
    },
    { type: 'separator' },
    {
      label: activePlaylist ? t('tray.playing', { title: activePlaylist.title }) : t('tray.noPlaylist'),
      enabled: false
    },
    {
      label: state.isPlaying ? t('common.pause') : t('common.resume'),
      enabled: state.playlistId !== null,
      click: () => {
        if (state.isPlaying) pausePlaylist()
        else resumePlaylist()
        refreshTray()
      }
    },
    {
      label: t('tray.next'),
      enabled: state.playlistId !== null,
      click: () => {
        void nextItem().then(refreshTray)
      }
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => app.quit()
    }
  ])
}

export function refreshTray(): void {
  if (tray) tray.setContextMenu(buildMenu())
}

export function createTray(win: BrowserWindow): void {
  if (tray) return
  trayWin = win

  const icon = nativeImage.createFromPath(appIcon).resize({ width: 32, height: 32, quality: 'best' })
  tray = new Tray(icon)
  tray.setToolTip('WE Manager')
  tray.setContextMenu(buildMenu())
  tray.on('click', () => {
    if (!trayWin) return
    if (trayWin.isVisible()) trayWin.hide()
    else trayWin.show()
  })

  unsubscribePlayback = onPlaybackStateChanged(refreshTray)
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
