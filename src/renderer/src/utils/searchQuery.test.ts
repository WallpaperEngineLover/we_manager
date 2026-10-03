import { describe, expect, it } from 'vitest'
import { matchesSearchTerms, parseSearchQuery } from './searchQuery'

describe('parseSearchQuery', () => {
  it('leaves plain words to Steam', () => {
    expect(parseSearchQuery('luna god')).toEqual({ steamText: 'luna god', requiredTerms: [], excludeTerms: [] })
  })

  it('turns a + joined token into required terms', () => {
    expect(parseSearchQuery('Luna+God')).toEqual({
      steamText: 'Luna God',
      requiredTerms: ['luna', 'god'],
      excludeTerms: []
    })
  })

  it('treats a leading + as required too', () => {
    expect(parseSearchQuery('luna +god').requiredTerms).toEqual(['god'])
  })

  it('mixes required, excluded and plain words', () => {
    expect(parseSearchQuery(' anime  luna+god -hololive ')).toEqual({
      steamText: 'anime luna god',
      requiredTerms: ['luna', 'god'],
      excludeTerms: ['hololive']
    })
  })

  it('keeps a lone + or - as plain text', () => {
    expect(parseSearchQuery('+ -')).toEqual({ steamText: '+ -', requiredTerms: [], excludeTerms: [] })
  })
})

describe('matchesSearchTerms', () => {
  const query = parseSearchQuery('luna+god -hololive')

  it('needs every required term', () => {
    expect(matchesSearchTerms('Luna, the moon God', query)).toBe(true)
    expect(matchesSearchTerms('Luna only', query)).toBe(false)
  })

  it('drops excluded terms', () => {
    expect(matchesSearchTerms('Luna God hololive', query)).toBe(false)
  })
})
