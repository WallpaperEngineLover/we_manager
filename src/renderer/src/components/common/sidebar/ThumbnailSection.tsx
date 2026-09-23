import { useState } from 'react'
import { Camera, ChevronDown, ChevronRight, ImageOff, ImagePlus, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { WallpaperMeta } from '@shared/types'
import { useToast } from '../Toast'

interface Props {
  wallpaper: WallpaperMeta
  canGenerate: boolean
  onUpdated: (wallpaper: WallpaperMeta) => void
}

export default function ThumbnailSection({ wallpaper, canGenerate, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'generate' | 'pick' | 'delete' | 'toggle' | null>(null)
  const { showToast } = useToast()
  const hasCustom = !!wallpaper.customPreview
  const usingCustom = hasCustom && !wallpaper.useOriginalPreview

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<WallpaperMeta | null>) {
    setBusy(kind)
    try {
      const updated = await action()
      if (updated) onUpdated(updated)
    } catch (err) {
      showToast((err as Error).message, { warning: true, durationMs: 6000 })
    } finally {
      setBusy(null)
    }
  }

  const showOriginal = (value: boolean) =>
    run('toggle', () => window.electronAPI.library.update(wallpaper.id, { useOriginalPreview: value }))

  return (
    <div className="border-t border-white/5 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Camera size={12} />
        <span className="flex-1 text-left">Thumbnail</span>
        {usingCustom && <span className="rounded-full bg-indigo-600/30 px-1.5 normal-case text-indigo-300">custom</span>}
        {busy && <Loader2 size={11} className="animate-spin" />}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          {hasCustom && (
            <div className="flex overflow-hidden rounded bg-white/5">
              {[
                { label: 'Custom', original: false },
                { label: 'Original', original: true }
              ].map(({ label, original }) => (
                <button
                  key={label}
                  onClick={() => showOriginal(original)}
                  disabled={busy !== null || usingCustom === !original}
                  className={clsx(
                    'flex-1 py-1',
                    usingCustom === !original ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-white/10'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {canGenerate && (
              <button
                onClick={() => run('generate', () => window.electronAPI.wallpaper.generateThumbnail(wallpaper.id))}
                disabled={busy !== null}
                title="Renders the wallpaper with your settings in a small window for a few seconds and saves a frame"
                className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-gray-300 hover:bg-white/10 disabled:opacity-50"
              >
                <Camera size={11} />
                {busy === 'generate' ? 'Capturing...' : 'Capture'}
              </button>
            )}
            <button
              onClick={() => run('pick', () => window.electronAPI.wallpaper.pickThumbnail(wallpaper.id))}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-gray-300 hover:bg-white/10 disabled:opacity-50"
            >
              <ImagePlus size={11} />
              Choose image
            </button>
            {hasCustom && (
              <button
                onClick={() => run('delete', () => window.electronAPI.wallpaper.deleteThumbnail(wallpaper.id))}
                disabled={busy !== null}
                className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-gray-300 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
              >
                <ImageOff size={11} />
                Remove custom
              </button>
            )}
          </div>
          {canGenerate && (
            <p className="text-[11px] text-gray-600">
              Capture opens a small window for a few seconds while the wallpaper renders.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
