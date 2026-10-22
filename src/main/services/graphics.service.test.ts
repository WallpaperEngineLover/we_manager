import * as os from 'os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ renderer: undefined as string | undefined, flatpak: false, files: new Map<string, string | string[]>() }))

vi.mock('./lwe.service', () => ({ getEngineRenderer: () => state.renderer }))
vi.mock('../utils/flatpak', () => ({ isFlatpak: () => state.flatpak, hostAppPath: () => undefined, hostCommand: (cmd: string, args: string[]) => [cmd, args] }))
vi.mock('fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs')>()
  const patched = {
    ...real,
    existsSync: (p: string) => state.files.has(p),
    readdirSync: (p: string) => {
      const entry = state.files.get(p)
      if (!Array.isArray(entry)) throw new Error('ENOENT')
      return entry
    },
    readFileSync: (p: string) => {
      const entry = state.files.get(p)
      if (typeof entry !== 'string') throw new Error('ENOENT')
      return entry
    }
  }
  return { ...patched, default: patched }
})

import { appInstallation, getGraphicsWarning, nvidiaExtensionName, parseNvidiaDriverVersion } from './graphics.service'

const VERSION_LINE = 'NVRM version: NVIDIA UNIX x86_64 Kernel Module  615.78.08  Tue Oct 20 2026'

describe('parseNvidiaDriverVersion', () => {
  it('reads the closed module line', () => {
    expect(parseNvidiaDriverVersion(`${VERSION_LINE}\nGCC version: gcc 15`)).toBe('615.78.08')
  })

  it('reads the open module line', () => {
    const text = 'NVRM version: NVIDIA UNIX Open Kernel Module for x86_64  580.95.05  Release Build'
    expect(parseNvidiaDriverVersion(text)).toBe('580.95.05')
  })

  it('finds nothing in an unrelated line', () => {
    expect(parseNvidiaDriverVersion('no driver')).toBeUndefined()
  })
})

describe('appInstallation', () => {
  it('follows where the app lives', () => {
    expect(appInstallation(`${os.homedir()}/.local/share/flatpak/app/io.github.x/x86_64/master/abc/files`)).toBe('--user')
    expect(appInstallation('/var/lib/flatpak/app/io.github.x/x86_64/master/abc/files')).toBe('--system')
    expect(appInstallation(undefined)).toBe('--system')
  })
})

describe('nvidiaExtensionName', () => {
  it('turns the dots into dashes', () => {
    expect(nvidiaExtensionName('615.78.08')).toBe('org.freedesktop.Platform.GL.nvidia-615-78-08')
  })
})

function nvidiaSandbox(withGl: boolean): void {
  state.flatpak = true
  state.files.set('/dev/nvidiactl', '')
  state.files.set('/usr/share/glvnd/egl_vendor.d', withGl ? ['10_nvidia.json', '50_mesa.json'] : ['50_mesa.json'])
  state.files.set('/usr/lib/x86_64-linux-gnu/GL', withGl ? ['default', 'nvidia-615-78-08'] : ['default'])
}

describe('getGraphicsWarning', () => {
  beforeEach(() => {
    state.renderer = undefined
    state.flatpak = false
    state.files = new Map()
  })

  it('says nothing on a plain system', () => {
    expect(getGraphicsWarning()).toBeNull()
  })

  it('warns about a Flatpak with an NVIDIA device and no NVIDIA GL', () => {
    nvidiaSandbox(false)
    expect(getGraphicsWarning()).toEqual({ kind: 'flatpak-nvidia' })
  })

  it('names the extension when the driver version is readable', () => {
    nvidiaSandbox(false)
    state.files.set('/proc/driver/nvidia/version', VERSION_LINE)
    expect(getGraphicsWarning()).toEqual({
      kind: 'flatpak-nvidia',
      extension: 'org.freedesktop.Platform.GL.nvidia-615-78-08'
    })
  })

  it('stays quiet when the sandbox has the NVIDIA GL', () => {
    nvidiaSandbox(true)
    expect(getGraphicsWarning()).toBeNull()
  })

  it('lets a real GPU renderer override the Flatpak check', () => {
    nvidiaSandbox(false)
    state.renderer = 'NVIDIA GeForce RTX 4070 Ti SUPER/PCIe/SSE2'
    expect(getGraphicsWarning()).toBeNull()
  })

  it('warns about a software renderer anywhere', () => {
    state.renderer = 'llvmpipe (LLVM 20.1.8, 256 bits)'
    expect(getGraphicsWarning()).toEqual({ kind: 'software', renderer: 'llvmpipe (LLVM 20.1.8, 256 bits)' })
  })

  it('blames the missing extension when a software renderer meets the NVIDIA Flatpak case', () => {
    nvidiaSandbox(false)
    state.renderer = 'llvmpipe (LLVM 20.1.8, 256 bits)'
    expect(getGraphicsWarning()).toEqual({ kind: 'flatpak-nvidia', renderer: 'llvmpipe (LLVM 20.1.8, 256 bits)' })
  })
})
