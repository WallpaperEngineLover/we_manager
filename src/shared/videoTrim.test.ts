import { describe, expect, it } from 'vitest'
import { formatVideoTime, parseVideoTime, trimmedVideoLength } from './videoTrim'

describe('formatVideoTime', () => {
  it('pads seconds and only shows hours when there are some', () => {
    expect(formatVideoTime(0)).toBe('0:00')
    expect(formatVideoTime(185)).toBe('3:05')
    expect(formatVideoTime(3723)).toBe('1:02:03')
  })

  it('keeps tenths of a second', () => {
    expect(formatVideoTime(65.5)).toBe('1:05.5')
    expect(formatVideoTime(59.96)).toBe('1:00')
  })
})

describe('parseVideoTime', () => {
  it('reads seconds, m:ss and h:mm:ss', () => {
    expect(parseVideoTime('90')).toBe(90)
    expect(parseVideoTime(' 3:00 ')).toBe(180)
    expect(parseVideoTime('0:01:30.5')).toBe(90.5)
  })

  it('rejects anything else', () => {
    expect(parseVideoTime('')).toBeNull()
    expect(parseVideoTime('1:')).toBeNull()
    expect(parseVideoTime('-5')).toBeNull()
    expect(parseVideoTime('1:2:3:4')).toBeNull()
    expect(parseVideoTime('abc')).toBeNull()
  })

  it('reads back what formatVideoTime writes', () => {
    for (const t of [0, 7.5, 185, 3723.4]) expect(parseVideoTime(formatVideoTime(t))).toBe(t)
  })
})

describe('trimmedVideoLength', () => {
  it('measures the trimmed part, open sides going to the start or end', () => {
    expect(trimmedVideoLength(300, 180, 240)).toBe(60)
    expect(trimmedVideoLength(300, 180)).toBe(120)
    expect(trimmedVideoLength(300, undefined, 60)).toBe(60)
    expect(trimmedVideoLength(300, 100, 900)).toBe(200)
  })
})
