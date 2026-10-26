import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { addUserFonts, listUserFonts, removeUserFont, userFontDir } from './fonts.service'

let work: string

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'we-fonts-'))
  process.env.LWE_FONT_DIR = path.join(work, 'fonts')
})

afterEach(() => {
  delete process.env.LWE_FONT_DIR
  fs.rmSync(work, { recursive: true, force: true })
})

describe('user fonts', () => {
  it('uses the folder the engine looks in', () => {
    expect(userFontDir()).toBe(path.join(work, 'fonts'))
  })

  it('copies font files and refuses the rest', () => {
    const font = path.join(work, 'Segoe UI Emoji.ttf')
    const text = path.join(work, 'notes.txt')
    fs.writeFileSync(font, 'font')
    fs.writeFileSync(text, 'not a font')

    expect(addUserFonts([font, text, path.join(work, 'missing.ttf')])).toEqual({
      added: ['Segoe UI Emoji.ttf'],
      rejected: ['notes.txt', 'missing.ttf']
    })
    expect(listUserFonts()).toEqual([{ name: 'Segoe UI Emoji.ttf', size: 4 }])
  })

  it('removes a font by its name only', () => {
    const font = path.join(work, 'a.otf')
    fs.writeFileSync(font, 'x')
    addUserFonts([font])

    expect(removeUserFont('../a.otf')).toBe(false)
    expect(removeUserFont('a.otf')).toBe(true)
    expect(listUserFonts()).toEqual([])
  })
})
