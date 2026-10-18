import { describe, expect, it } from 'vitest'
import { containedPath } from './contained'

describe('containedPath', () => {
  it('joins a name inside the folder', () => {
    expect(containedPath('/lib/123', 'preview.jpg')).toBe('/lib/123/preview.jpg')
    expect(containedPath('/lib/123', 'img/./a.png')).toBe('/lib/123/img/a.png')
    expect(containedPath('/lib/123', 'a/../b.png')).toBe('/lib/123/b.png')
  })

  it('keeps an absolute-looking name inside, like path.join does', () => {
    expect(containedPath('/lib/123', '/etc/passwd')).toBe('/lib/123/etc/passwd')
  })

  it('refuses names that leave the folder or are not names', () => {
    for (const rel of ['../other/p.jpg', 'a/../../p.jpg', '..', '.', '', 'a\0b', 5, null, undefined, { x: 1 }]) {
      expect(containedPath('/lib/123', rel)).toBeUndefined()
    }
  })
})
