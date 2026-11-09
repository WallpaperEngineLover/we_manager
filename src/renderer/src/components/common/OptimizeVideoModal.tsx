import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import {
  ENCODER_LABELS,
  SCALE_TARGETS,
  isHevc,
  targetSize,
  CRF_DEFAULT,
  CRF_MAX,
  CRF_MIN,
  FPS_TARGETS,
  clampCrf,
  fpsFilter,
  normalizeFps,
  FPS_MAX,
  type HevcEncoder,
  type OptimizeOptions,
  type OptimizeProgress,
  type OptimizeResult,
  type ScaleMode,
  type TrimMode,
  type VideoProbe,
  type VideoToolsStatus
} from '@shared/video-tools'
import { formatVideoTimeExact } from '@shared/videoTrim'
import CutRangesEditor, { cutProblem, parseParts, partsFromRanges, type CutPartText } from './CutRangesEditor'
import Toggle from './Toggle'
import { useToast } from './Toast'
import { formatFileSize } from '../../utils/format'
import { inputClass } from './inputClass'
import { ProgressBar } from './GridCard'
import { detachOptimize } from '../../hooks/useBackgroundOptimize'
import { t } from '../../i18n'

export const OPTIMIZE_VIDEO_EVENT = 'we:optimize-video'

export function openOptimizeVideo(id: string): void {
  window.dispatchEvent(new CustomEvent(OPTIMIZE_VIDEO_EVENT, { detail: id }))
}

const PRESETS = Object.values(SCALE_TARGETS).map((p) => ({ name: p.label, width: p.width, height: p.height }))

type Phase = 'loading' | 'ready' | 'running' | 'review' | 'error' | 'background'

export function OptimizeVideoHost() {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    const open = (e: Event): void => { setId((e as CustomEvent<string>).detail) }
    window.addEventListener(OPTIMIZE_VIDEO_EVENT, open)
    return () => { window.removeEventListener(OPTIMIZE_VIDEO_EVENT, open) }
  }, [])
  return id ? <OptimizeVideoModal key={id} id={id} onClose={() => { setId(null) }} /> : null
}

function Row({ label, hint, on, onToggle, disabled, children }: {
  label: string
  hint?: string
  on: boolean
  onToggle?: () => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg bg-fg/5 p-3">
      <div className="flex items-center gap-3">
        <Toggle on={on} onClick={() => { onToggle?.() }} disabled={disabled || !onToggle} />
        <span className="text-sm text-gray-200">{label}</span>
      </div>
      {hint && <p className="mt-1 pl-12 text-xs text-gray-500">{hint}</p>}
      {on && children && <div className="mt-3 space-y-2 pl-12">{children}</div>}
    </div>
  )
}

function OptimizeVideoModal({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [probe, setProbe] = useState<VideoProbe | null>(null)
  const [trimMode, setTrimMode] = useState<TrimMode>('ask')
  const [status, setStatus] = useState<VideoToolsStatus | null>(null)
  const [progress, setProgress] = useState<OptimizeProgress | null>(null)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [encoder, setEncoder] = useState<HevcEncoder | 'auto'>('auto')
  const [crf, setCrf] = useState(CRF_DEFAULT)
  const [force, setForce] = useState(false)
  const [convert, setConvert] = useState(true)
  const [scaleOn, setScaleOn] = useState(false)
  const [target, setTarget] = useState('')
  const [customW, setCustomW] = useState('1920')
  const [customH, setCustomH] = useState('1080')
  const [mode, setMode] = useState<ScaleMode>('fit')
  const [fpsOn, setFpsOn] = useState(false)
  const [fpsPick, setFpsPick] = useState('30')
  const [fpsText, setFpsText] = useState('30')
  const [cutOn, setCutOn] = useState(false)
  const [cutParts, setCutParts] = useState<CutPartText[]>([{ start: '0:00', end: '' }])
  const [fastCut, setFastCut] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const phaseRef = useRef<Phase>('loading')
  const jobRef = useRef<Promise<OptimizeResult> | null>(null)
  phaseRef.current = phase

  async function load() {
    setPhase('loading')
    setError('')
    try {
      const [st, defaults, pr] = await Promise.all([
        window.electronAPI.videoTools.status().then((value) => {
          setStatus(value)
          return value
        }),
        window.electronAPI.videoTools.getSettings(),
        window.electronAPI.videoTools.probe(id)
      ])
      setEncoder(defaults.encoder !== 'auto' && !st.encoders.some((o) => o.encoder === defaults.encoder) ? 'auto' : defaults.encoder)
      setCrf(defaults.crf)
      setProbe(pr)
      setTrimMode(defaults.trimMode)
      const preset = defaults.scaleTo === 'none' ? null : SCALE_TARGETS[defaults.scaleTo]
      setMode(defaults.scaleMode)
      if (preset && targetSize(pr.info, preset, defaults.scaleMode)) {
        setScaleOn(true)
        setTarget(`preset:${preset.label}`)
      }
      if (defaults.maxFps && fpsFilter(pr.info, defaults.maxFps)) {
        setFpsOn(true)
        setFpsText(String(defaults.maxFps))
        setFpsPick(FPS_TARGETS.includes(defaults.maxFps) ? String(defaults.maxFps) : 'custom')
      }
      if (pr.trim.length > 0 && defaults.trimMode !== 'never') {
        setCutParts(partsFromRanges(pr.trim))
        setCutOn(defaults.trimMode === 'auto')
      } else {
        setCutParts([{ start: '0:00', end: formatVideoTimeExact(pr.info.duration) }])
      }
      setConvert(!isHevc(pr.info.codec))
      setPhase('ready')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  useEffect(() => {
    void load()
    const off = window.electronAPI.on.videoToolsProgress((p) => {
      if (p.itemId === id || p.itemId === 'ffmpeg') setProgress(p)
    })
    return () => {
      off()
      // a result nobody decided on would keep the next job from starting
      if (phaseRef.current === 'running') {
        void window.electronAPI.videoTools.cancel().then(() => window.electronAPI.videoTools.finish(id, false)).catch(() => undefined)
      }
      if (phaseRef.current === 'review' || phaseRef.current === 'error') void window.electronAPI.videoTools.finish(id, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const info = probe?.info
  const hevc = info ? isHevc(info.codec) : false

  const choices = useMemo(() => {
    if (!probe) return []
    const list = [
      ...probe.screens.map((s) => ({ key: `screen:${s.width}x${s.height}`, label: `${s.name} (${t('optimize.dimensions', { width: s.width, height: s.height })})`, width: s.width, height: s.height })),
      ...PRESETS.map((p) => ({ key: `preset:${p.name}`, label: `${p.name} (${t('optimize.dimensions', { width: p.width, height: p.height })})`, width: p.width, height: p.height }))
    ]
    return list.filter((c) => targetSize(probe.info, c, mode))
  }, [probe, mode])

  const picked = target === 'custom' ? 'custom' : (choices.find((c) => c.key === target) ?? choices[0])?.key ?? 'custom'

  const box = useMemo(() => {
    if (picked === 'custom') return { width: Number(customW), height: Number(customH) }
    const hit = choices.find((c) => c.key === picked)
    return hit ? { width: hit.width, height: hit.height } : null
  }, [picked, choices, customW, customH])

  const outSize = info && box ? targetSize(info, box, mode) : null
  const cutValid = !!info && cutProblem(cutParts, info.duration) === null
  const cutCount = cutParts.length
  const fpsChoices = info ? FPS_TARGETS.filter((n) => fpsFilter(info, n)) : []
  const fpsCanLower = !!info && !!fpsFilter(info, 1)
  const fpsShown = fpsPick === 'custom' || fpsChoices.includes(Number(fpsPick)) ? fpsPick : fpsChoices.length > 0 ? String(fpsChoices[0]) : 'custom'
  const fpsValue = fpsShown === 'custom' ? normalizeFps(Number(fpsText)) : Number(fpsShown)
  const fpsValid = !!info && !!fpsFilter(info, fpsValue)
  const fpsActive = fpsOn && fpsCanLower && fpsValid
  const fastCutAllowed = cutOn && cutCount === 1 && !scaleOn && !fpsActive && !(hevc && force)
  const copying = fastCut && fastCutAllowed
  const reencode = !hevc && (convert || scaleOn || fpsActive || (cutOn && !copying))
  const needsEncoder = scaleOn || fpsActive || reencode || (hevc && (force || (cutOn && !copying)))
  const noEncoder = !!status && status.encoders.length === 0
  const nothingToDo = !scaleOn && !fpsActive && !cutOn && (hevc ? !force : !convert)
  const canStart =
    phase === 'ready' && !nothingToDo && !(fpsOn && fpsCanLower && !fpsValid) && (!scaleOn || !!outSize) && (!cutOn || cutValid) && !(needsEncoder && noEncoder)

  async function runJob() {
    if (!info) return
    const options: OptimizeOptions = { encoder, crf, force: hevc && force }
    if (scaleOn && box) options.scale = { ...box, mode }
    if (fpsActive) options.fps = fpsValue
    if (cutOn && cutValid) {
      const ranges = parseParts(cutParts).map((r) => ({ start: r!.start, end: Math.min(r!.end, info.duration) }))
      const [first, ...more] = ranges
      options.cut = { ...first, copy: fastCut && fastCutAllowed, ...(more.length > 0 ? { more } : {}) }
    }
    setProgress(null)
    setError('')
    setPhase('running')
    const job = window.electronAPI.videoTools.start(id, options)
    jobRef.current = job
    try {
      const res = await job
      if (phaseRef.current === 'background') return
      setResult(res)
      setPhase('review')
    } catch (err) {
      if (phaseRef.current === 'background') return
      setError((err as Error).message)
      setPhase('ready')
    }
  }

  function toBackground() {
    if (!jobRef.current) return
    phaseRef.current = 'background'
    detachOptimize(id, jobRef.current)
    onClose()
  }

  async function finish(keep: boolean) {
    if (finishing) return
    setFinishing(true)
    try {
      await window.electronAPI.videoTools.finish(id, keep)
      if (keep) {
        showToast(t('optimize.applied'))
        void queryClient.invalidateQueries({ queryKey: ['library'] })
      }
      phaseRef.current = 'ready'
      setPhase('ready')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setFinishing(false)
    }
  }

  async function download() {
    setDownloading(true)
    setProgress(null)
    try {
      await window.electronAPI.videoTools.download()
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  function close() {
    if (phase === 'running' && jobRef.current) toBackground()
    else onClose()
  }

  const grew = !!result && result.newSize >= result.originalSize
  const delta = result ? Math.abs(result.newSize - result.originalSize) : 0
  const percent = result && result.originalSize > 0 ? Math.round((delta / result.originalSize) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-fg/10 bg-popup shadow-2xl">
        <div className="flex items-center justify-between border-b border-fg/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-100">{t('optimize.title')}</h3>
          <button onClick={close} className="rounded p-1 text-gray-500 hover:bg-fg/5 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          {phase === 'loading' && (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> {t('optimize.checking')}
            </div>
          )}

          {info && (
            <p className="text-xs text-gray-400">
              {info.codec.toUpperCase()} · {t('optimize.dimensions', { width: info.width, height: info.height })} · {t('optimize.fpsValue', { fps: Math.round(info.fps) })} · {formatVideoTimeExact(info.duration)} · {formatFileSize(info.size)}
            </p>
          )}

          {status && status.wrong.length > 0 && phase !== 'running' && !downloading && (
            <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-300">
              {status.wrong.map((w) => (
                <p key={`${w.source}-${w.encoder}`}>
                  {t('optimize.wrongEncoder', {
                    encoder: ENCODER_LABELS[w.encoder],
                    source: t(w.source === 'system' ? 'optimize.srcSystem' : 'optimize.srcDownloaded')
                  })}
                </p>
              ))}
              <p className="mt-1 text-amber-300/80">{t('optimize.wrongEncoderHint')}</p>
              {status.canDownload && !status.downloaded && status.wrong.some((w) => w.source === 'system') && (
                <button
                  onClick={() => void download()}
                  className="mt-2 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500"
                >
                  {t('optimize.tryDownloaded')}
                </button>
              )}
            </div>
          )}

          {(noEncoder || phase === 'error') && !downloading && (
            <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-300">
              <p>{phase === 'error' ? error : t('optimize.noEncoder')}</p>
              {status?.canDownload && !status.downloaded && (
                <button
                  onClick={() => void download()}
                  className="mt-2 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500"
                >
                  {t('optimize.download')}
                </button>
              )}
            </div>
          )}

          {downloading && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400">{progress?.message ?? t('optimize.checking')}</p>
              <ProgressBar percentage={progress?.percentage ?? 0} className="h-1.5 rounded bg-fg/10" />
            </div>
          )}

          {phase === 'ready' && info && (
            <>
              {error && <p className="text-xs text-red-400">{error}</p>}

              {hevc && (
                <Row
                  label={t('optimize.force')}
                  hint={t('optimize.forceHint')}
                  on={force}
                  onToggle={() => { setForce(!force); if (!force) setFastCut(false) }}
                >
                  <p className="text-xs text-amber-300">{t('optimize.forceWarn')}</p>
                </Row>
              )}

              {!hevc && (
                <Row
                  label={t('optimize.convert')}
                  hint={t('optimize.convertHint')}
                  on={reencode}
                  onToggle={scaleOn || fpsActive || (cutOn && !copying) ? undefined : () => { setConvert(!convert); if (!convert) setFastCut(false) }}
                />
              )}

              <Row
                label={t('optimize.downscale')}
                hint={choices.length === 0 && picked !== 'custom' ? t('optimize.nothingSmaller') : t('optimize.downscaleHint')}
                on={scaleOn}
                onToggle={() => { setScaleOn(!scaleOn); if (!scaleOn) setFastCut(false) }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <select value={picked} onChange={(e) => { setTarget(e.target.value) }} className={inputClass}>
                    {choices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    <option value="custom">{t('optimize.custom')}</option>
                  </select>
                  {picked === 'custom' && (
                    <span className="flex items-center gap-1 text-sm text-gray-400">
                      <input value={customW} onChange={(e) => { setCustomW(e.target.value.replace(/\D/g, '')) }} className={`${inputClass} w-20`} />
                      x
                      <input value={customH} onChange={(e) => { setCustomH(e.target.value.replace(/\D/g, '')) }} className={`${inputClass} w-20`} />
                    </span>
                  )}
                </div>
                <div className="flex gap-4 text-xs text-gray-300">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={mode === 'fit'} onChange={() => { setMode('fit') }} />
                    {t('optimize.fit')}
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={mode === 'fill'} onChange={() => { setMode('fill') }} />
                    {t('optimize.fill')}
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  {outSize ? t('optimize.resultSize', { width: outSize.width, height: outSize.height }) : t('optimize.nothingSmaller')}
                </p>
              </Row>

              <Row
                label={t('optimize.fps')}
                hint={fpsCanLower ? t('optimize.fpsHint') : t('optimize.fpsNothing', { fps: Math.round(info.fps) })}
                on={fpsOn && fpsCanLower}
                onToggle={fpsCanLower ? () => { setFpsOn(!fpsOn); if (!fpsOn) setFastCut(false) } : undefined}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                  <select value={fpsShown} onChange={(e) => { setFpsPick(e.target.value) }} className={inputClass}>
                    {fpsChoices.map((n) => <option key={n} value={n}>{t('optimize.fpsValue', { fps: n })}</option>)}
                    <option value="custom">{t('optimize.custom')}</option>
                  </select>
                  {fpsShown === 'custom' && (
                    <span className="flex items-center gap-1">
                      <input value={fpsText} onChange={(e) => { setFpsText(e.target.value.replace(/\D/g, '').slice(0, 3)) }} className={`${inputClass} w-16`} />
                      {t('optimize.fpsUnit')}
                    </span>
                  )}
                </div>
                {fpsShown === 'custom' && !fpsValid && (
                  <p className="text-xs text-red-400">{t('optimize.errFpsValue', { fps: Math.round(info.fps), max: FPS_MAX })}</p>
                )}
              </Row>

              <Row
                label={t('optimize.cut')}
                hint={
                  probe && probe.trim.length > 0 && trimMode !== 'never'
                    ? probe.trim.length === 1
                      ? t('optimize.cutTrimHint', { start: formatVideoTimeExact(probe.trim[0].start), end: formatVideoTimeExact(probe.trim[0].end) })
                      : t('optimize.cutTrimPartsHint', { parts: probe.trim.length })
                    : t('optimize.cutHint')
                }
                on={cutOn}
                onToggle={() => { setCutOn(!cutOn) }}
              >
                <CutRangesEditor parts={cutParts} duration={info.duration} previewUrl={probe?.previewUrl ?? null} onChange={setCutParts} />
                {fastCutAllowed && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-300">
                    <input type="checkbox" checked={fastCut} onChange={() => { setFastCut(!fastCut); setConvert(fastCut) }} />
                    {t('optimize.fastCut')}
                  </label>
                )}
                {cutOn && cutCount > 1 && <p className="text-xs text-gray-500">{t('optimize.fastCutSingle')}</p>}
              </Row>

              {needsEncoder && status && status.encoders.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span>{t('optimize.encoder')}</span>
                  <select value={encoder} onChange={(e) => { setEncoder(e.target.value as HevcEncoder | 'auto') }} className={inputClass}>
                    <option value="auto">{t('optimize.auto')}</option>
                    {status.encoders.map((o) => <option key={o.encoder} value={o.encoder}>{ENCODER_LABELS[o.encoder]}</option>)}
                  </select>
                </div>
              )}

              {needsEncoder && status && status.encoders.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span>{t('optimize.quality')}</span>
                  <input type="range" min={CRF_MIN} max={CRF_MAX} step={1} value={crf} onChange={(e) => { setCrf(clampCrf(Number(e.target.value))) }} className="w-40" />
                  <span className="w-6 text-right tabular-nums">{crf}</span>
                </div>
              )}
              {needsEncoder && status && status.encoders.length > 0 && (
                <p className="text-xs text-gray-500">{t('optimize.qualityHint', { min: CRF_MIN, max: CRF_MAX })}</p>
              )}
            </>
          )}

          {phase === 'running' && (
            <div className="space-y-2 py-4">
              <p className="flex items-center gap-2 text-sm text-gray-300">
                <Loader2 size={14} className="animate-spin" /> {t('optimize.encoding', { percent: progress?.percentage ?? 0 })}
              </p>
              <ProgressBar percentage={progress?.percentage ?? 0} className="h-1.5 rounded bg-fg/10" />
            </div>
          )}

          {phase === 'review' && result && (
            <div className="space-y-2 py-2">
              <p className="text-sm text-gray-200">
                {formatFileSize(result.originalSize)} {'->'} {formatFileSize(result.newSize)}
              </p>
              {error && <p className="text-xs text-red-400">{error}</p>}
              {result.skipped.length > 0 && (
                <p className="text-xs text-amber-300">
                  {t('optimize.skipped', {
                    skipped: result.skipped.map((e) => ENCODER_LABELS[e]).join(', '),
                    used: result.encoder ? ENCODER_LABELS[result.encoder] : ''
                  })}
                </p>
              )}
              <p className={`text-xs ${grew ? 'text-red-300' : 'text-green-300'}`}>
                {grew ? t('optimize.bigger', { size: formatFileSize(delta) ?? '', percent }) : t('optimize.smaller', { size: formatFileSize(delta) ?? '', percent })}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-fg/5 px-4 py-3">
          {phase === 'running' && (
            <button onClick={toBackground} className="rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10">
              {t('optimize.background')}
            </button>
          )}
          {phase === 'running' && (
            <button onClick={() => void window.electronAPI.videoTools.cancel()} className="rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10">
              {t('common.cancel')}
            </button>
          )}
          {phase === 'review' && (
            <>
              <button
                onClick={() => void finish(false)}
                disabled={finishing}
                className={grew ? 'rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500' : 'rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10'}
              >
                {t('optimize.discard')}
              </button>
              <button
                onClick={() => void finish(true)}
                disabled={finishing}
                className={grew ? 'rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10' : 'rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500'}
              >
                {grew ? t('optimize.keepAnyway') : t('optimize.keep')}
              </button>
            </>
          )}
          {(phase === 'ready' || phase === 'error' || phase === 'loading') && (
            <>
              <button onClick={close} className="rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10">
                {t('common.close')}
              </button>
              {phase === 'ready' && (
                <button
                  onClick={() => void runJob()}
                  disabled={!canStart}
                  className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                >
                  {t('optimize.start')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
