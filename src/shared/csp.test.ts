import { describe, expect, it } from 'vitest'
import { RENDERER_CSP } from './csp'

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/)
      return [name, sources]
    })
  )
}

describe('RENDERER_CSP', () => {
  const policy = directives(RENDERER_CSP)

  it('runs only the bundled scripts', () => {
    expect(policy.get('script-src')).toEqual(["'self'"])
    expect(RENDERER_CSP).not.toMatch(/unsafe-eval|unsafe-hashes|\*(?!\.)/)
  })

  it('blocks plugins, frames and form posts', () => {
    expect(policy.get('object-src')).toEqual(["'none'"])
    expect(policy.get('frame-src')).toEqual(["'none'"])
    expect(policy.get('form-action')).toEqual(["'none'"])
    expect(policy.get('base-uri')).toEqual(["'none'"])
  })

  it('lets previews load from the app scheme and from Steam', () => {
    expect(policy.get('img-src')).toEqual(expect.arrayContaining(['wallpaper:', 'https:', 'data:']))
    expect(policy.get('media-src')).toContain('wallpaper:')
    expect(policy.get('connect-src')).toContain('wallpaper:')
  })

  it('has no repeated directive', () => {
    const names = RENDERER_CSP.split(';').map((part) => part.trim().split(/\s+/)[0])
    expect(new Set(names).size).toBe(names.length)
  })
})
