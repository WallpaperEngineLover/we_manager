import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { needsSoftwareCompositing, readGpuVendors } from './gpuWorkaround'

describe('needsSoftwareCompositing', () => {
  it('is only for COSMIC on Wayland with a virtio GPU', () => {
    expect(needsSoftwareCompositing('cosmic', 'wayland-1', ['0x1af4'])).toBe(true)
    expect(needsSoftwareCompositing('cosmic', 'wayland-1', ['0x1002'])).toBe(false)
    expect(needsSoftwareCompositing('cosmic', undefined, ['0x1af4'])).toBe(false)
    expect(needsSoftwareCompositing('gnome', 'wayland-1', ['0x1af4'])).toBe(false)
  })
})

describe('readGpuVendors', () => {
  it('reads the vendor of every card and ignores render nodes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drm-'))
    try {
      for (const [name, vendor] of [['card0', '0x1AF4\n'], ['card1', '0x1002\n']]) {
        mkdirSync(join(dir, name, 'device'), { recursive: true })
        writeFileSync(join(dir, name, 'device', 'vendor'), vendor)
      }
      mkdirSync(join(dir, 'renderD128'))
      expect(readGpuVendors(dir)).toEqual(['0x1af4', '0x1002'])
      expect(readGpuVendors(join(dir, 'missing'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
