import { describe, expect, it } from 'vitest'
import { LANGUAGES, catalog, resolveLanguage, translate, type Language } from './index'
import { en } from './locales/en'

const PLURAL = /_(zero|one|two|few|many|other)$/

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

describe('catalogs', () => {
  const english = en as Record<string, string>
  const bases = new Set(Object.keys(english).map((key) => key.replace(PLURAL, '')))
  const pluralBases = new Set(Object.keys(english).filter((key) => PLURAL.test(key)).map((key) => key.replace(PLURAL, '')))

  for (const { code } of LANGUAGES) {
    const messages = catalog(code)
    const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories

    it(`${code} has every message`, () => {
      const missing = [...bases].filter((base) =>
        pluralBases.has(base) ? !(`${base}_other` in messages) : !(base in messages)
      )
      expect(missing).toEqual([])
    })

    it(`${code} has no unknown keys or plural forms`, () => {
      const unknown = Object.keys(messages).filter((key) => {
        const base = key.replace(PLURAL, '')
        if (!bases.has(base)) return true
        if (key === base) return pluralBases.has(base)
        return !pluralBases.has(base) || !categories.includes(key.slice(base.length + 1) as Intl.LDMLPluralRule)
      })
      expect(unknown).toEqual([])
    })

    it(`${code} keeps the placeholders`, () => {
      const wrong = Object.entries(messages).filter(([key, text]) => {
        const base = key.replace(PLURAL, '')
        const source = key === base ? english[key] : english[`${base}_other`]
        const expected = placeholders(source)
        const actual = placeholders(text)
        // a singular form may name the one item instead of printing the count
        if (key.endsWith('_one') && actual.join() === expected.filter((p) => p !== 'count').join()) return false
        return actual.join() !== expected.join()
      })
      expect(wrong.map(([key]) => key)).toEqual([])
    })
  }
})

describe('translate', () => {
  it('picks plural forms by count', () => {
    expect(translate('en', 'playlist.count', { count: 1 })).toBe('1 wallpaper')
    expect(translate('en', 'playlist.count', { count: 3 })).toBe('3 wallpapers')
    expect(translate('ru', 'playlist.count', { count: 3 })).not.toBe(translate('ru', 'playlist.count', { count: 5 }))
  })

  it('falls back to English for a missing key', () => {
    const messages = catalog('de') as Record<string, string>
    const saved = messages['nav.library']
    delete messages['nav.library']
    expect(translate('de', 'nav.library')).toBe('Library')
    messages['nav.library'] = saved
  })

  it('leaves unknown placeholders alone', () => {
    expect(translate('en', 'tray.playing', {})).toBe('Playing: {title}')
  })
})

describe('resolveLanguage', () => {
  const cases: [string[], Language][] = [
    [['de-DE', 'en-US'], 'de'],
    [['pt_BR'], 'pt'],
    [['zh-TW'], 'zh-TW'],
    [['zh-Hant-HK'], 'zh-TW'],
    [['zh-Hans-CN'], 'zh-CN'],
    [['nl-NL', 'fr-FR'], 'fr'],
    [['nl-NL'], 'en']
  ]
  for (const [locales, expected] of cases) {
    it(`${locales.join(', ')} -> ${expected}`, () => {
      expect(resolveLanguage('system', locales)).toBe(expected)
    })
  }

  it('keeps an explicit choice', () => {
    expect(resolveLanguage('ja', ['de-DE'])).toBe('ja')
  })
})
