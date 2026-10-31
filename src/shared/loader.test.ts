import { describe, expect, it } from 'vitest'
import { clampLoaderThreads, normalizeLoader } from './loader'

describe('clampLoaderThreads', () => {
  it('keeps 0..64 and falls back to automatic for anything else', () => {
    expect(clampLoaderThreads(4)).toBe(4)
    expect(clampLoaderThreads(-3)).toBe(0)
    expect(clampLoaderThreads(100)).toBe(64)
    expect(clampLoaderThreads(2.5)).toBe(0)
    expect(clampLoaderThreads('8')).toBe(0)
  })
})

describe('normalizeLoader', () => {
  it('fills missing keys with the defaults', () => {
    expect(normalizeLoader({ threads: 4 })).toEqual({ textures: true, shaders: true, threads: 4 })
    expect(normalizeLoader(null)).toEqual({ textures: true, shaders: true, threads: 0 })
  })

  it('keeps explicit false', () => {
    expect(normalizeLoader({ textures: false, shaders: false, threads: 0 })).toEqual({
      textures: false,
      shaders: false,
      threads: 0
    })
  })
})
