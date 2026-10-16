import { describe, expect, it } from 'vitest'
import { aspectFromResolutions, splitSlotRects } from './splitScreen'

const portrait = 9 / 16
const landscape = 16 / 9

describe('splitSlotRects', () => {
  it('sizes slots from the wallpapers and fills the screen', () => {
    const rects = splitSlotRects({ width: 3440, height: 1440 }, [portrait, portrait, landscape], 'aspect')
    expect(rects.map((r) => Math.round(r.width * 3440))).toEqual([667, 667, 2107])
    expect(rects[2].x + rects[2].width).toBeCloseTo(1)
  })

  it('gives every slot the same share with equal', () => {
    const rects = splitSlotRects({ width: 1920, height: 1080 }, [0.5, 2, 1], 'equal')
    expect(rects.map((r) => r.width)).toEqual([1 / 3, 1 / 3, 1 / 3])
  })

  it('centers the wallpapers in their own shape and leaves bars', () => {
    const rects = splitSlotRects({ width: 1920, height: 1080 }, [portrait, portrait], 'center')
    expect(rects[0].x * 1920).toBeCloseTo(352.5)
    expect((rects[1].x + rects[1].width) * 1920).toBeCloseTo(1567.5)
  })

  it('falls back to filling when centered wallpapers do not fit', () => {
    const rects = splitSlotRects({ width: 1920, height: 1080 }, [landscape, landscape], 'center')
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 0.5, height: 1 })
  })

  it('gives web pages the average of the others', () => {
    const rects = splitSlotRects({ width: 2000, height: 1000 }, [0.5, 0, 1.5], 'aspect')
    expect(rects.map((r) => Math.round(r.width * 2000))).toEqual([333, 667, 1000])
  })

  it('stacks the slots on a portrait screen, the first on top', () => {
    const rects = splitSlotRects({ width: 1080, height: 1920 }, [landscape, landscape], 'aspect')
    expect(rects).toEqual([
      { x: 0, y: 0, width: 1, height: 0.5 },
      { x: 0, y: 0.5, width: 1, height: 0.5 }
    ])
  })
})

describe('aspectFromResolutions', () => {
  it('reads the size out of the tag', () => {
    expect(aspectFromResolutions(['Portrait 1080 x 1920'])).toBeCloseTo(portrait)
    expect(aspectFromResolutions(['Ultrawide 3440 x 1440'])).toBeCloseTo(3440 / 1440)
    expect(aspectFromResolutions(['Portrait Standard Definition'])).toBeCloseTo(portrait)
    expect(aspectFromResolutions(undefined)).toBeCloseTo(landscape)
  })
})
