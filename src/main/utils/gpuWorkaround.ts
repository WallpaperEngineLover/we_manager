import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { DesktopEnvironment } from '@shared/desktop'

const VIRTIO_VENDOR = '0x1af4'

/**
 * cosmic-comp refuses the dmabuf Chromium's GPU compositing makes on a virtio GPU (virgl): libwayland answers
 * "create_immed failed and produced an invalid wl_buffer" and the app dies at startup. Seen in the lab VM only.
 */
export function needsSoftwareCompositing(
  desktop: DesktopEnvironment,
  waylandDisplay: string | undefined,
  gpuVendors: string[]
): boolean {
  return desktop === 'cosmic' && !!waylandDisplay && gpuVendors.includes(VIRTIO_VENDOR)
}

export function readGpuVendors(drmDir = '/sys/class/drm'): string[] {
  try {
    return readdirSync(drmDir)
      .filter((name) => /^card\d+$/.test(name))
      .map((name) => readFileSync(join(drmDir, name, 'device', 'vendor'), 'utf8').trim().toLowerCase())
  } catch {
    return []
  }
}
