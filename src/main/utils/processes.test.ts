import { describe, expect, it } from 'vitest'
import { processNames } from './processes'
import { playingStreams } from './audio-activity'

describe('processNames', () => {
  it('uses comm, the program and the first arguments', () => {
    expect(processNames('firefox\n', 'firefox\0--new-window\0', '/usr/lib64/firefox/firefox')).toEqual(['firefox'])
  })

  it('finds a Windows program run by Wine', () => {
    const names = processNames('game.exe\n', 'Z:\\games\\Game.exe\0', '/usr/bin/wine64-preloader')
    expect(names).toContain('game')
    expect(names).toContain('wine64-preloader')
  })

  it('ignores empty fields', () => {
    expect(processNames('', '', '')).toEqual([])
  })
})

describe('playingStreams', () => {
  const streams = JSON.stringify([
    { corked: false, mute: false, properties: { 'application.process.id': '42', 'application.process.binary': 'mpv' } },
    { corked: true, properties: { 'application.process.id': '43', 'application.process.binary': 'paused' } },
    { corked: false, mute: true, properties: { 'application.process.id': '44' } },
    { corked: false, properties: { 'application.name': 'Some Player' } }
  ])

  it('keeps streams that are neither corked nor muted', () => {
    expect(playingStreams(streams)).toEqual([
      { pid: 42, binary: 'mpv' },
      { pid: 0, binary: 'Some Player' }
    ])
  })

  it('survives output that is not a list', () => {
    expect(playingStreams('')).toEqual([])
    expect(playingStreams('{}')).toEqual([])
    expect(playingStreams('Sink Input #1')).toEqual([])
  })
})
