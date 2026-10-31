import type { LoaderSettings } from './types'

export const DEFAULT_LOADER: LoaderSettings = { textures: true, shaders: true, threads: 0 }

export const MAX_LOADER_THREADS = 64

export function clampLoaderThreads(threads: unknown): number {
  return Number.isInteger(threads) ? Math.min(Math.max(threads as number, 0), MAX_LOADER_THREADS) : DEFAULT_LOADER.threads
}

export function normalizeLoader(loader: Partial<LoaderSettings> | null | undefined): LoaderSettings {
  return {
    textures: loader?.textures ?? DEFAULT_LOADER.textures,
    shaders: loader?.shaders ?? DEFAULT_LOADER.shaders,
    threads: clampLoaderThreads(loader?.threads)
  }
}
