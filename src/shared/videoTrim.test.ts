import { describe, expect, it } from 'vitest'
import {
  formatVideoSegments,
  formatVideoTime,
  normalizeVideoSegments,
  parseVideoTime,
  trimmedVideoLength,
  videoSegmentsOf
} from './videoTrim'

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
  it('adds up the parts, an open end going to the end of the video', () => {
    expect(trimmedVideoLength(300, [{ start: 180, end: 240 }])).toBe(60)
    expect(trimmedVideoLength(300, [{ start: 180 }])).toBe(120)
    expect(trimmedVideoLength(300, [{ start: 120, end: 180 }, { start: 240, end: 300 }])).toBe(120)
    expect(trimmedVideoLength(300, [{ start: 100, end: 900 }])).toBe(200)
  })

  it('is the whole video without parts', () => {
    expect(trimmedVideoLength(300, [])).toBe(300)
  })
})

describe('videoSegmentsOf', () => {
  it('turns the old single start/end into one part', () => {
    expect(videoSegmentsOf({ videoStart: 180, videoEnd: 240 })).toEqual([{ start: 180, end: 240 }])
    expect(videoSegmentsOf({ videoEnd: 60 })).toEqual([{ start: 0, end: 60 }])
    expect(videoSegmentsOf({})).toEqual([])
  })

  it('prefers the parts list', () => {
    expect(videoSegmentsOf({ videoSegments: [], videoStart: 180 })).toEqual([])
  })
})

describe('normalizeVideoSegments', () => {
  it('sorts, drops empty parts and merges overlapping ones', () => {
    expect(
      normalizeVideoSegments([
        { start: 240, end: 300 },
        { start: 120, end: 180 },
        { start: 150, end: 200 },
        { start: 50, end: 50 }
      ])
    ).toEqual([
      { start: 120, end: 200 },
      { start: 240, end: 300 }
    ])
  })

  it('keeps touching parts apart', () => {
    expect(normalizeVideoSegments([{ start: 0, end: 30 }, { start: 30, end: 60 }])).toEqual([
      { start: 0, end: 30 },
      { start: 30, end: 60 }
    ])
  })

  it('lets an open end swallow the parts after it', () => {
    expect(normalizeVideoSegments([{ start: 10 }, { start: 60, end: 70 }])).toEqual([{ start: 10 }])
  })

  it('opens an end at the end of the video and drops parts past it', () => {
    expect(normalizeVideoSegments([{ start: 120, end: 180 }, { start: 240, end: 300 }, { start: 400 }], 300)).toEqual([
      { start: 120, end: 180 },
      { start: 240 }
    ])
  })

  it('is no parts for the whole video', () => {
    expect(normalizeVideoSegments([{ start: 0, end: 300 }], 300)).toEqual([])
  })
})

describe('formatVideoSegments', () => {
  it('writes what --video-segments reads', () => {
    expect(formatVideoSegments([{ start: 120, end: 180 }, { start: 240.25 }])).toBe('120-180,240.25-')
  })
})
