import { execFileSync, spawn } from 'child_process'
import { describe, expect, it } from 'vitest'
import { LWE_PROCESS_PATTERN, isLweCommandLine } from './engineProcess'

const engines = [
  '/usr/local/linux-wallpaperengine --screen-root DP-1 --bg /w/1',
  'linux-wallpaperengine --silent /w/1',
  '/opt/linux-wallpaperengine-kde/linux-wallpaperengine',
  '/home/u/.local/share/linux-wallpaperengine-kde/linux-wallpaperengine.bin --fps 30 /w/1',
  '/bin/bash /home/u/.local/share/linux-wallpaperengine-kde/linux-wallpaperengine --window 0x0x1280x720',
  '/nix/store/abc-linux-wallpaperengine/bin/linux-wallpaperengine --list-properties /w/1'
]

const others = [
  'vim /home/u/projects/linux-wallpaperengine',
  '/usr/bin/code /home/u/projects/private/linux-wallpaperengine',
  'git -C /home/u/projects/linux-wallpaperengine status',
  'make -C /tmp/lwe-build/build linux-wallpaperengine',
  '/bin/bash -c cd ~/projects/linux-wallpaperengine && make',
  'tail -f /home/u/logs/linux-wallpaperengine.log',
  'less linux-wallpaperengine-kde/README.md',
  '/home/u/projects/linux-wallpaperengine-kde/build/output/linux-wallpaperengine-web-helper --type=zygote',
  'grep -r linux-wallpaperengine src',
  'flatpak-spawn --host pkill -9 -f -c ^((/[^ ]*/)?(ba|da)?sh )?(/[^ ]*/)?linux-wallpaperengine(\\.bin)?( |$)',
  ''
]

describe('isLweCommandLine', () => {
  it.each(engines)('knows the engine as %s', (line) => {
    expect(isLweCommandLine(line)).toBe(true)
  })

  it.each(others)('does not take for an engine: %s', (line) => {
    expect(isLweCommandLine(line)).toBe(false)
  })

  it('reads /proc style command lines', () => {
    expect(isLweCommandLine('/usr/local/linux-wallpaperengine\0--silent\0/w/1\0')).toBe(true)
    expect(isLweCommandLine('vim\0/home/u/linux-wallpaperengine\0')).toBe(false)
  })
})

const matching = (): number => {
  try {
    return Number(execFileSync('pgrep', ['-f', '-c', LWE_PROCESS_PATTERN]).toString().trim())
  } catch {
    return 0 // exit 1: nothing matched
  }
}

// the same pattern goes to pkill: POSIX ERE, matched against a space joined command line
describe('LWE_PROCESS_PATTERN with pkill', () => {
  it.skipIf(process.platform !== 'linux')('matches the engines and none of the others', () => {
    // engines of the machine running the test are in the count already
    const before = matching()
    // sleeps under a command line of our choosing
    const children = [...engines, ...others.filter((line) => line && !line.startsWith('flatpak-spawn'))].map((line) =>
      spawn('bash', ['-c', 'exec -a "$0" sleep 30', line], { stdio: 'ignore' })
    )

    try {
      execFileSync('sleep', ['0.3'])
      expect(matching() - before).toBe(engines.length)
    } finally {
      for (const child of children) child.kill('SIGKILL')
    }
  })
})
