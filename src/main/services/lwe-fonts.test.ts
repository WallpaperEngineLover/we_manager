import { describe, expect, it } from 'vitest'
import { parseLweFontList } from './lwe-fonts'

describe('parseLweFontList', () => {
  it('reads the engine\'s lines', () => {
    const output = [
      'Fonts for /w/1:',
      '  font family="Arial" status=compatible using="Liberation Sans" objects="Clock, Date"',
      '  emoji family="Segoe UI Emoji" status=missing using="Twemoji" objects="Title"'
    ].join('\n')

    expect(parseLweFontList(output)).toEqual([
      { kind: 'font', family: 'Arial', status: 'compatible', using: 'Liberation Sans', objects: ['Clock', 'Date'] },
      { kind: 'emoji', family: 'Segoe UI Emoji', status: 'missing', using: 'Twemoji', objects: ['Title'] }
    ])
  })
})
