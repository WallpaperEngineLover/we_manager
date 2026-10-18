import { beforeEach, describe, expect, it, vi } from 'vitest'

const workshopCall = vi.fn<(method: string, ...args: unknown[]) => Promise<unknown>>()

vi.mock('./steam.service', () => ({
  workshopCall: (method: string, ...args: unknown[]) => workshopCall(method, ...args),
  getSubscribedItems: async () => []
}))

const { isWallpaperEngineItem } = await import('./workshop.service')

describe('isWallpaperEngineItem', () => {
  beforeEach(() => workshopCall.mockReset())

  it('accepts an item made for Wallpaper Engine', async () => {
    workshopCall.mockResolvedValue({ items: [{ publishedFileId: 5n, consumerAppId: 431960 }] })
    expect(await isWallpaperEngineItem('5')).toBe(true)
    expect(workshopCall).toHaveBeenCalledWith('getItems', [5n])
  })

  it('refuses an item of another app and one Steam does not know', async () => {
    workshopCall.mockResolvedValue({ items: [{ publishedFileId: 5n, consumerAppId: 730 }] })
    expect(await isWallpaperEngineItem('5')).toBe(false)
    workshopCall.mockResolvedValue({ items: [null] })
    expect(await isWallpaperEngineItem('5')).toBe(false)
  })

  it('does not guess when Steam reports no app', async () => {
    workshopCall.mockResolvedValue({ items: [{ publishedFileId: 5n }] })
    expect(await isWallpaperEngineItem('5')).toBe(true)
  })
})
