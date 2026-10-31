import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFileSync = vi.fn<(cmd: string, args: string[], opts?: unknown) => string>()
const isCommandAvailable = vi.fn<(cmd: string) => boolean>()

vi.mock('child_process', () => ({ execFileSync }))
vi.mock('./platform', () => ({ isCommandAvailable }))

const { owningPackage, packageVersion } = await import('./packages')

beforeEach(() => {
  execFileSync.mockReset()
  isCommandAvailable.mockReset()
  isCommandAvailable.mockReturnValue(true)
})

describe('query commands', () => {
  it('passes each manager the file or package name as its own argument', () => {
    isCommandAvailable.mockReturnValue(true)
    execFileSync.mockImplementation(() => { throw new Error('no') })
    owningPackage('/usr/bin/x')
    expect(execFileSync.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['pacman', ['-Qoq', '/usr/bin/x']],
      ['rpm', ['-qf', '--qf', '%{NAME}', '/usr/bin/x']],
      ['dpkg-query', ['-S', '/usr/bin/x']]
    ])
    expect(execFileSync.mock.calls[0][2]).toMatchObject({ encoding: 'utf8', timeout: 5000 })
  })

  it('does not run a manager that is not installed', () => {
    isCommandAvailable.mockReturnValue(false)
    expect(owningPackage('/usr/bin/x')).toBeUndefined()
    expect(packageVersion({ manager: 'rpm', name: 'lwe' })).toBeUndefined()
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it('only takes the first line', () => {
    execFileSync.mockReturnValueOnce('first\nsecond\n')
    expect(owningPackage('/x')).toEqual({ manager: 'pacman', name: 'first' })
  })
})

describe('owningPackage', () => {
  it('asks pacman first', () => {
    execFileSync.mockReturnValueOnce('linux-wallpaperengine-kde\n')
    expect(owningPackage('/usr/bin/x')).toEqual({ manager: 'pacman', name: 'linux-wallpaperengine-kde' })
  })

  it('falls through to rpm and then dpkg when the earlier ones fail or are missing', () => {
    isCommandAvailable.mockImplementation((command: string) => command !== 'pacman')
    execFileSync.mockImplementationOnce(() => { throw new Error('not owned') })
    execFileSync.mockReturnValueOnce('lwe:amd64\n')
    expect(owningPackage('/usr/bin/x')).toEqual({ manager: 'dpkg', name: 'lwe' })
  })

  it('is undefined when no manager owns the file', () => {
    execFileSync.mockImplementation(() => { throw new Error('no') })
    expect(owningPackage('/home/me/x')).toBeUndefined()
  })

  it('treats empty output as not owned', () => {
    execFileSync.mockReturnValue('\n')
    expect(owningPackage('/x')).toBeUndefined()
  })
})

describe('packageVersion', () => {
  it('asks each manager for that package', () => {
    execFileSync.mockReturnValue('1\n')
    packageVersion({ manager: 'pacman', name: 'a' })
    packageVersion({ manager: 'rpm', name: 'b' })
    packageVersion({ manager: 'dpkg', name: 'c' })
    expect(execFileSync.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['pacman', ['-Q', 'a']],
      ['rpm', ['-q', '--qf', '%{VERSION}', 'b']],
      ['dpkg-query', ['-W', '-f=${Version}', 'c']]
    ])
  })

  it('takes the version column of pacman -Q', () => {
    execFileSync.mockReturnValueOnce('lwe 1.2.3-1\n')
    expect(packageVersion({ manager: 'pacman', name: 'lwe' })).toBe('1.2.3-1')
  })

  it('returns the rpm and dpkg output as is', () => {
    execFileSync.mockReturnValueOnce('1.2.3\n')
    expect(packageVersion({ manager: 'rpm', name: 'lwe' })).toBe('1.2.3')
    execFileSync.mockReturnValueOnce('1.2.3-2\n')
    expect(packageVersion({ manager: 'dpkg', name: 'lwe' })).toBe('1.2.3-2')
  })
})
