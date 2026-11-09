import { useMemo, useState } from 'react'
import type { ScheduleAction, ScreenTarget } from '@shared/types'
import ScreenSelect from '../common/ScreenSelect'
import { inputClass } from '../common/inputClass'
import { useDisplayTargets } from '../../hooks/useDisplayTargets'
import { useAllWallpapers, usePlaylists, useProfiles } from '../../hooks/queries'
import { t } from '../../i18n'
import type { MessageKey } from '@shared/i18n'

/** The sentence a rule shows for its action */
export function useDescribeAction(): (action: ScheduleAction) => string {
  const wallpapers = useAllWallpapers()
  const playlists = usePlaylists()
  const profiles = useProfiles()

  return (action) => {
    if (action.type === 'wallpaper') {
      const title = wallpapers.find((w) => w.id === action.wallpaperId)?.title ?? t('schedule.missingWallpaper')
      return t('schedule.show', { title })
    }
    if (action.type === 'playlist') {
      const title = playlists.find((p) => p.id === action.playlistId)?.title ?? t('schedule.missingPlaylist')
      return t('schedule.play', { title })
    }
    if (action.type === 'profile') {
      const name = profiles.find((p) => p.id === action.profileId)?.name ?? t('profiles.missing')
      return t('profiles.load', { name })
    }
    return t('schedule.stop')
  }
}

/** The message to show when the action is not finished, null when it is */
export function actionProblem(action: ScheduleAction): MessageKey | null {
  if (action.type === 'wallpaper' && !action.wallpaperId) return 'schedule.pickWallpaper'
  if (action.type === 'playlist' && !action.playlistId) return 'schedule.pickPlaylist'
  if (action.type === 'profile' && !action.profileId) return 'profiles.pick'
  return null
}

interface Props {
  action: ScheduleAction
  screen: ScreenTarget
  onAction: (action: ScheduleAction) => void
  onScreen: (screen: ScreenTarget) => void
}

export default function ActionPicker({ action, screen, onAction, onScreen }: Props) {
  const { targets, perScreen } = useDisplayTargets()
  const wallpapers = useAllWallpapers()
  const playlists = usePlaylists()
  const profiles = useProfiles()
  const [wallpaperFilter, setWallpaperFilter] = useState('')

  const selectedWallpaperId = action.type === 'wallpaper' ? action.wallpaperId : ''
  const wallpaperOptions = useMemo(() => {
    const needle = wallpaperFilter.trim().toLowerCase()
    const matches = wallpapers
      .filter((w) => w.localPath && (!needle || w.title.toLowerCase().includes(needle)))
      .slice(0, 100)
    const selected = wallpapers.find((w) => w.id === selectedWallpaperId)
    return selected && !matches.includes(selected) ? [selected, ...matches] : matches
  }, [wallpapers, wallpaperFilter, selectedWallpaperId])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={action.type}
          onChange={(e) => {
            const type = e.target.value as ScheduleAction['type']
            onAction(
              type === 'wallpaper'
                ? { type, wallpaperId: '' }
                : type === 'playlist'
                  ? { type, playlistId: playlists[0]?.id ?? '' }
                  : type === 'profile'
                    ? { type, profileId: profiles[0]?.id ?? '' }
                    : { type }
            )
          }}
          className={inputClass}
        >
          <option value="wallpaper">{t('schedule.showWallpaper')}</option>
          <option value="playlist">{t('schedule.playPlaylist')}</option>
          <option value="profile">{t('profiles.loadProfile')}</option>
          <option value="stop">{t('schedule.stop')}</option>
        </select>
        {perScreen && action.type !== 'profile' && (
          <ScreenSelect targets={targets} value={screen} onChange={onScreen} />
        )}
      </div>

      {action.type === 'playlist' && (
        <select
          value={action.playlistId}
          onChange={(e) => { onAction({ type: 'playlist', playlistId: e.target.value }) }}
          className={`${inputClass} w-full`}
        >
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      )}

      {action.type === 'profile' && (
        <select
          value={action.profileId}
          onChange={(e) => { onAction({ type: 'profile', profileId: e.target.value }) }}
          className={`${inputClass} w-full`}
        >
          {profiles.length === 0 && <option value="">{t('profiles.none')}</option>}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {action.type === 'wallpaper' && (
        <div className="space-y-1.5">
          <input
            value={wallpaperFilter}
            onChange={(e) => { setWallpaperFilter(e.target.value) }}
            placeholder={t('schedule.searchLibrary')}
            className={`${inputClass} w-full`}
          />
          <select
            value={action.wallpaperId}
            onChange={(e) => { onAction({ type: 'wallpaper', wallpaperId: e.target.value }) }}
            size={6}
            className={`${inputClass} w-full`}
          >
            {wallpaperOptions.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  )
}
