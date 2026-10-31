import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useConfig } from '../../hooks/queries'

// previewAnimation 'hover': a still frame on a canvas, the animated image laid over it on hover

const HOVER_DELAY_MS = 120

// Steam preview URLs have no extension, so every remote preview takes the still path
function mayBeAnimated(src: string): boolean {
  if (src.startsWith('wallpaper://')) return /\.(gif|webp)$/i.test(src)
  return /^https?:\/\//.test(src)
}

type StillSource = { source: CanvasImageSource; width: number; height: number }

function drawCover(canvas: HTMLCanvasElement, still: StillSource): void {
  const box = canvas.getBoundingClientRect()
  if (box.width === 0 || box.height === 0 || still.width === 0) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(box.width * dpr)
  canvas.height = Math.round(box.height * dpr)
  const scale = Math.max(canvas.width / still.width, canvas.height / still.height)
  const w = still.width * scale
  const h = still.height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(still.source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
}

function sniffType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to))
  if (ascii(0, 4) === 'GIF8') return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

function isNearlyBlack(frame: VideoFrame): boolean {
  const probe = new OffscreenCanvas(16, 16)
  const ctx = probe.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(frame, 0, 0, 16, 16)
  const px = ctx.getImageData(0, 0, 16, 16).data
  let sum = 0
  for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
  return sum / (px.length / 4) < 12
}

const MAX_STILL_WIDTH = 960

// a black first frame (fade-in previews) is swapped for one a third of the way in
async function decodeStill(src: string): Promise<ImageBitmap | null> {
  if (typeof ImageDecoder === 'undefined') return null
  const data = await (await fetch(src)).arrayBuffer()
  const type = sniffType(new Uint8Array(data, 0, Math.min(12, data.byteLength)))
  if (!type) return null
  const decoder = new ImageDecoder({ data, type })
  try {
    await decoder.tracks.ready
    const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 1
    let { image } = await decoder.decode({ frameIndex: 0 })
    if (frameCount > 1 && isNearlyBlack(image)) {
      image.close()
      image = (await decoder.decode({ frameIndex: Math.floor(frameCount / 3) })).image
    }
    const width = Math.min(image.displayWidth, MAX_STILL_WIDTH)
    const bitmap = await createImageBitmap(image, {
      resizeWidth: width,
      resizeHeight: Math.round((image.displayHeight * width) / image.displayWidth),
      resizeQuality: 'high'
    })
    image.close()
    return bitmap
  } finally {
    decoder.close()
  }
}

// a detached image doesn't animate, so drawing it gives the first frame
function loadFirstFrame(src: string): Promise<StillSource> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.addEventListener('load', () => { resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight }) })
    img.addEventListener('error', reject)
    img.src = src
  })
}

async function loadStill(src: string): Promise<StillSource> {
  const bitmap = await decodeStill(src).catch(() => null)
  if (bitmap) return { source: bitmap, width: bitmap.width, height: bitmap.height }
  return loadFirstFrame(src)
}

export default function PreviewImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const onHover = useConfig()?.appearance.previewAnimation === 'hover'
  if (!onHover || !mayBeAnimated(src)) {
    return <img src={src} alt={alt} className={clsx('h-full w-full object-cover', className)} loading="lazy" draggable={false} />
  }
  return <HoverAnimatedImage key={src} src={src} alt={alt} className={className} />
}

function HoverAnimatedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [live, setLive] = useState(false)
  const [liveLoaded, setLiveLoaded] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])

  useEffect(() => {
    if (!nearViewport) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let resize: ResizeObserver | null = null
    let bitmap: ImageBitmap | null = null
    loadStill(src)
      .then((still) => {
        if (still.source instanceof ImageBitmap) bitmap = still.source
        if (cancelled) {
          bitmap?.close()
          return
        }
        drawCover(canvas, still)
        resize = new ResizeObserver(() => { drawCover(canvas, still) })
        resize.observe(canvas)
      })
      .catch(() => {
        // broken preview, keep the empty background
      })
    return () => {
      cancelled = true
      resize?.disconnect()
      bitmap?.close()
    }
  }, [nearViewport, src])

  useEffect(() => {
    const card = wrapRef.current?.closest<HTMLElement>('[data-preview-hover]') ?? wrapRef.current
    if (!card) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const stop = (): void => {
      if (timer) clearTimeout(timer)
      timer = null
      setLive(false)
      setLiveLoaded(false)
    }
    const enter = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { setLive(true) }, HOVER_DELAY_MS)
    }
    const visibility = (): void => {
      if (document.hidden) stop()
    }
    card.addEventListener('pointerenter', enter)
    card.addEventListener('pointerleave', stop)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      if (timer) clearTimeout(timer)
      card.removeEventListener('pointerenter', enter)
      card.removeEventListener('pointerleave', stop)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  return (
    <div ref={wrapRef} className={clsx('relative h-full w-full', className)} role="img" aria-label={alt}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {live && (
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={() => { setLiveLoaded(true) }}
          className={clsx(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-150',
            liveLoaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </div>
  )
}
