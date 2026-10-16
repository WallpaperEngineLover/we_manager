import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Play, Plus, Trash2, X } from 'lucide-react'
import type { MessageKey } from '@shared/i18n'
import type { ScalingMode, SplitLayout, SplitScreen, WallpaperMeta } from '@shared/types'
import { aspectFromResolutions, splitSlotRects } from '@shared/splitScreen'
import { useAllWallpapers, useConfig } from '../../hooks/queries'
import { useDisplayTargets } from '../../hooks/useDisplayTargets'
import { getPreviewSrc } from '../../utils/preview'
import WallpaperPickerModal from '../playlist/WallpaperPickerModal'
import { useToast } from '../common/Toast'
import { t } from '../../i18n'

const LAYOUTS: { layout: SplitLayout; label: MessageKey }[] = [
  { layout: 'aspect', label: 'split.layoutAspect' },
  { layout: 'equal', label: 'split.layoutEqual' },
  { layout: 'center', label: 'split.layoutCenter' }
]

const SCALING: { value: ScalingMode | ''; label: MessageKey }[] = [
  { value: '', label: 'split.scalingWallpaper' },
  { value: 'default', label: 'detail.scalingDefault' },
  { value: 'stretch', label: 'detail.scalingStretch' },
  { value: 'fill', label: 'detail.scalingFill' },
  { value: 'fit', label: 'detail.scalingFit' },
  { value: 'center', label: 'detail.scalingCenter' }
]

const SPLITTABLE = new Set(['scene', 'video', 'web'])

/** web pages take any size */
function aspectOf(wallpaper: WallpaperMeta | undefined): number {
  if (!wallpaper || wallpaper.type === 'web') return 0
  return aspectFromResolutions(wallpaper.resolutions)
}

export default function SplitScreenSettings() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const config = useConfig()
  const wallpapers = useAllWallpapers()
  const { targets, perScreen } = useDisplayTargets()
  const screens = targets.filter((target) => target !== '*')
  const [chosen, setChosen] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [showing, setShowing] = useState(false)

  const screen = chosen && screens.includes(chosen) ? chosen : screens[0]
  const split: SplitScreen = (screen && config?.splitScreens?.[screen]) || { layout: 'aspect', slots: [] }
  const byId = useMemo(() => new Map(wallpapers.map((w) => [w.id, w])), [wallpapers])
  const notSplittable = useMemo(
    () => new Set(wallpapers.filter((w) => !SPLITTABLE.has(w.type) || !w.localPath).map((w) => w.id)),
    [wallpapers]
  )

  if (!perScreen || !screen) {
    return (
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('split.title')}</label>
        <p className="mt-1 text-xs text-gray-600">{t('split.needsPerScreen')}</p>
      </div>
    )
  }

  const rects = splitSlotRects(
    { width: 16, height: 9 },
    split.slots.map((slot) => aspectOf(byId.get(slot.wallpaperId))),
    split.layout
  )

  async function save(next: SplitScreen) {
    await window.electronAPI.wallpaper.setSplit(screen, next)
    queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  function move(index: number, by: number) {
    const slots = [...split.slots]
    const [slot] = slots.splice(index, 1)
    slots.splice(index + by, 0, slot)
    void save({ ...split, slots })
  }

  async function show() {
    setShowing(true)
    try {
      await window.electronAPI.wallpaper.showSplit(screen)
      showToast(t('split.shown', { screen }))
    } catch (err) {
      showToast(t('split.failed', { error: (err as Error).message }))
    } finally {
      setShowing(false)
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('split.title')}</label>
      <p className="mt-1 text-xs text-gray-600">{t('split.description')}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={screen}
          onChange={(e) => setChosen(e.target.value)}
          className="rounded bg-fg/5 px-2 py-1.5 text-xs text-gray-200 outline-none"
        >
          {screens.map((target) => (
            <option key={target} value={target}>
              {target}
            </option>
          ))}
        </select>
        <div className="inline-flex overflow-hidden rounded-lg text-xs">
          {LAYOUTS.map(({ layout, label }) => (
            <button
              key={layout}
              onClick={() => save({ ...split, layout })}
              className={`px-3 py-1.5 transition-colors ${
                split.layout === layout ? 'bg-accent-600 text-white' : 'bg-fg/5 text-gray-400 hover:text-gray-200'
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-3 aspect-video w-full max-w-md overflow-hidden rounded-lg bg-black">
        {split.slots.length === 0 && (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-gray-500">
            {t('split.empty')}
          </p>
        )}
        {split.slots.map((slot, index) => {
          const rect = rects[index]
          const wallpaper = byId.get(slot.wallpaperId)
          const src = getPreviewSrc(wallpaper)
          return (
            <div
              key={index}
              className="absolute overflow-hidden border border-black/60"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`
              }}
              title={wallpaper?.title}
            >
              {src && <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />}
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{index + 1}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-xs text-gray-600">{t('split.previewNote')}</p>

      <ul className="mt-3 max-w-md space-y-1.5">
        {split.slots.map((slot, index) => {
          const wallpaper = byId.get(slot.wallpaperId)
          return (
            <li key={index} className="flex items-center gap-2 rounded-lg bg-fg/5 px-2 py-1.5 text-xs">
              <span className="w-4 shrink-0 text-gray-500">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-gray-200" title={wallpaper?.title}>
                {wallpaper?.title ?? t('split.missing')}
              </span>
              <select
                value={slot.scalingMode ?? ''}
                onChange={(e) => {
                  const slots = [...split.slots]
                  slots[index] = { ...slot, scalingMode: (e.target.value || undefined) as ScalingMode | undefined }
                  void save({ ...split, slots })
                }}
                className="rounded bg-fg/5 px-1.5 py-1 text-xs text-gray-200 outline-none"
                title={t('split.scaling')}
              >
                {SCALING.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="rounded p-1 text-gray-400 hover:bg-fg/10 disabled:opacity-30"
                title={t('split.moveEarlier')}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => move(index, 1)}
                disabled={index === split.slots.length - 1}
                className="rounded p-1 text-gray-400 hover:bg-fg/10 disabled:opacity-30"
                title={t('split.moveLater')}
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => save({ ...split, slots: split.slots.filter((_, i) => i !== index) })}
                className="rounded p-1 text-gray-400 hover:bg-fg/10 hover:text-red-400"
                title={t('split.remove')}
              >
                <X size={14} />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-fg/10"
        >
          <Plus size={14} />
          {t('split.add')}
        </button>
        <button
          onClick={show}
          disabled={showing || split.slots.length === 0}
          className="flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-1.5 text-xs text-white hover:bg-accent-500 disabled:opacity-50"
        >
          {showing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {t('split.show', { screen })}
        </button>
        {split.slots.length > 0 && (
          <button
            onClick={() => save({ ...split, slots: [] })}
            className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-fg/10"
          >
            <Trash2 size={14} />
            {t('split.clear')}
          </button>
        )}
      </div>
      {split.slots.length > 3 && <p className="mt-2 text-xs text-yellow-400">{t('split.heavyNote')}</p>}

      {picking && (
        <WallpaperPickerModal
          excludeIds={notSplittable}
          onAdd={(ids) => {
            setPicking(false)
            void save({ ...split, slots: [...split.slots, ...ids.map((wallpaperId) => ({ wallpaperId }))] })
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
