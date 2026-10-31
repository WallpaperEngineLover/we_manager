import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.fn<(cmd: string, args: string[], opts: { timeout: number }, done: (e: Error | null, out: string) => void) => void>()
const execFileSync = vi.fn<(cmd: string, args: string[], opts: { encoding: string; timeout: number }) => string>()
vi.mock('child_process', () => ({ execFile, execFileSync }))

const savedId = process.env.FLATPAK_ID
const savedWayland = process.env.WAYLAND_DISPLAY

async function load(inFlatpak: boolean): Promise<typeof import('./flatpak')> {
  vi.resetModules()
  if (inFlatpak) process.env.FLATPAK_ID = 'io.example.app'
  else delete process.env.FLATPAK_ID
  return import('./flatpak')
}

beforeEach(() => {
  execFile.mockReset()
  execFileSync.mockReset()
})

afterEach(() => {
  if (savedId) process.env.FLATPAK_ID = savedId
  else delete process.env.FLATPAK_ID
  if (savedWayland === undefined) delete process.env.WAYLAND_DISPLAY
  else process.env.WAYLAND_DISPLAY = savedWayland
})

describe('isHostCommandAvailable', () => {
  it('asks the shell and remembers the answer per command', async () => {
    const { isHostCommandAvailable } = await load(false)
    execFileSync.mockReturnValue('')
    expect(isHostCommandAvailable('git')).toBe(true)
    expect(isHostCommandAvailable('git')).toBe(true)
    expect(execFileSync).toHaveBeenCalledTimes(1)
    expect(execFileSync).toHaveBeenCalledWith('sh', ['-c', 'command -v "git"'], { stdio: 'ignore', timeout: 5000 })
  })

  it('is false when the shell fails and does not ask again', async () => {
    const { isHostCommandAvailable } = await load(false)
    execFileSync.mockImplementation(() => {
      throw new Error('exit 1')
    })
    expect(isHostCommandAvailable('nothing')).toBe(false)
    expect(isHostCommandAvailable('nothing')).toBe(false)
    expect(execFileSync).toHaveBeenCalledTimes(1)
  })

  it('asks the host inside a Flatpak', async () => {
    const { isHostCommandAvailable } = await load(true)
    execFileSync.mockReturnValue('')
    isHostCommandAvailable('rpm')
    const [cmd, args] = execFileSync.mock.calls[0]
    expect(cmd).toBe('flatpak-spawn')
    expect(args[0]).toBe('--host')
    expect(args.slice(-3)).toEqual(['sh', '-c', 'command -v "rpm"'])
  })
})

describe('sandbox info', () => {
  const info = '[Application]\nname=io.example.app\n\n[Instance]\ninstance-id=1234567\napp-path=/home/u/.local/share/flatpak/app/io.example.app/x86_64/stable/abc/files\n'

  it('reads the app path and the instance id', async () => {
    const { hostAppPath, flatpakInstanceId } = await load(true)
    expect(hostAppPath(info)).toBe('/home/u/.local/share/flatpak/app/io.example.app/x86_64/stable/abc/files')
    expect(flatpakInstanceId(info)).toBe('1234567')
    expect(hostAppPath('[Application]\n')).toBeUndefined()
    expect(flatpakInstanceId('instance-id=\n')).toBeUndefined()
    expect(hostAppPath('xapp-path=/nope\n')).toBeUndefined()
  })

  it('maps /app paths to the host and nothing else', async () => {
    const { toHostPath } = await load(true)
    expect(toHostPath('/app/bin/we', '/host/files')).toBe('/host/files/bin/we')
    expect(toHostPath('/app', '/host/files')).toBeUndefined()
    expect(toHostPath('/usr/bin/we', '/host/files')).toBeUndefined()
    expect(toHostPath('/app/bin/we', undefined)).toBeUndefined()
    expect(toHostPath('/app/bin/we', '')).toBeUndefined()
  })
})

describe('hostPidOf', () => {
  it('passes the pid namespace and pid to the host script', async () => {
    const { hostPidOf } = await load(true)
    execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, done: (e: Error | null, out: string) => void) => {
      done(null, '4321\n')
    })
    expect(await hostPidOf(77)).toBe(4321)
    const [cmd, args, opts] = execFile.mock.calls[0]
    expect(cmd).toBe('flatpak-spawn')
    expect(args.slice(0, 4)).toEqual(['--host', 'sh', '-c', expect.stringContaining('NSpid')])
    expect(args.slice(4, 5)).toEqual(['sh'])
    expect(args[5]).toMatch(/^pid:\[\d+\]$/)
    expect(args[6]).toBe('77')
    expect(opts.timeout).toBe(10_000)
  })

  it('is undefined when the host fails or prints nothing usable', async () => {
    const { hostPidOf } = await load(true)
    const reply = (err: Error | null, out: string) =>
      execFile.mockImplementationOnce((_c: string, _a: string[], _o: unknown, done: (e: Error | null, o: string) => void) => { done(err, out) })
    reply(new Error('gone'), '12')
    expect(await hostPidOf(1)).toBeUndefined()
    reply(null, '')
    expect(await hostPidOf(1)).toBeUndefined()
    reply(null, '0\n')
    expect(await hostPidOf(1)).toBeUndefined()
    reply(null, '-5\n')
    expect(await hostPidOf(1)).toBeUndefined()
  })
})

describe('host process command line', () => {
  it('tells gone, alive and unknown apart', async () => {
    const { hostProcessCommandLine } = await load(true)
    execFileSync.mockReturnValueOnce('gone\n')
    expect(hostProcessCommandLine(5)).toBeNull()
    execFileSync.mockReturnValueOnce('alive /usr/bin/engine --window ')
    expect(hostProcessCommandLine(5)).toBe('/usr/bin/engine --window ')
    execFileSync.mockReturnValueOnce('something else')
    expect(hostProcessCommandLine(5)).toBeUndefined()
    execFileSync.mockImplementationOnce(() => {
      throw new Error('no flatpak-spawn')
    })
    expect(hostProcessCommandLine(5)).toBeUndefined()
    const [cmd, args, opts] = execFileSync.mock.calls[0]
    expect(cmd).toBe('flatpak-spawn')
    expect(args.slice(0, 3)).toEqual(['--host', 'sh', '-c'])
    expect(args.slice(4)).toEqual(['sh', '5'])
    expect(opts.encoding).toBe('utf8')
    expect(opts.timeout).toBe(5000)
  })

  it('does the same asynchronously', async () => {
    const { hostProcessCommandLineAsync } = await load(true)
    const reply = (err: Error | null, out: string) =>
      execFile.mockImplementationOnce((_c: string, _a: string[], _o: unknown, done: (e: Error | null, o: string) => void) => { done(err, out) })
    reply(null, 'gone')
    expect(await hostProcessCommandLineAsync(9)).toBeNull()
    reply(null, 'alive engine ')
    expect(await hostProcessCommandLineAsync(9)).toBe('engine ')
    reply(new Error('failed'), 'alive engine ')
    expect(await hostProcessCommandLineAsync(9)).toBeUndefined()
  })
})

describe('killHostProcess', () => {
  it('sends the signal without its SIG prefix through the host', async () => {
    const { killHostProcess } = await load(true)
    killHostProcess(42, 'SIGTERM')
    killHostProcess(43, 'SIGKILL')
    expect(execFileSync).toHaveBeenNthCalledWith(1, 'flatpak-spawn', ['--host', 'kill', '-s', 'TERM', '42'], { timeout: 5000, stdio: 'ignore' })
    expect(execFileSync).toHaveBeenNthCalledWith(2, 'flatpak-spawn', ['--host', 'kill', '-s', 'KILL', '43'], { timeout: 5000, stdio: 'ignore' })
  })
})
