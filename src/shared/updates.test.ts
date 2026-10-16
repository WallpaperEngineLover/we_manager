import { describe, expect, it } from 'vitest'
import { compareVersions, isNewerVersion, normalizeUpdateChecks, parseVersion } from './updates'

describe('parseVersion', () => {
  it('reads tags and package versions', () => {
    expect(parseVersion('v0.8.4')).toEqual({ parts: [0, 8, 4], prerelease: null })
    expect(parseVersion('0.8.0-1')).toEqual({ parts: [0, 8, 0], prerelease: null })
    expect(parseVersion('1:0.9.1')).toEqual({ parts: [0, 9, 1], prerelease: null })
    expect(parseVersion('0.8.4-1ubuntu1')).toEqual({ parts: [0, 8, 4], prerelease: null })
    expect(parseVersion('0.8.4-0ubuntu1~24.04')).toEqual({ parts: [0, 8, 4], prerelease: null })
    expect(parseVersion('0.8.4-1.1')).toEqual({ parts: [0, 8, 4], prerelease: null })
    expect(parseVersion('v1.0.0-beta.2')).toEqual({ parts: [1, 0, 0], prerelease: 'beta.2' })
  })

  it('gives up on git snapshots', () => {
    expect(parseVersion('r1234.abcdef')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compares numerically', () => {
    expect(compareVersions('v0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.8.4', 'v0.8.4')).toBe(0)
    expect(compareVersions('0.8', '0.8.1')).toBeLessThan(0)
  })

  it('puts a pre-release before its release', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true)
  })

  it('treats unreadable versions as not newer', () => {
    expect(compareVersions('r12.abc', '0.8.0')).toBeNull()
    expect(isNewerVersion('r12.abc', '0.8.0')).toBe(false)
  })
})

describe('normalizeUpdateChecks', () => {
  it('keeps unanswered as null', () => {
    expect(normalizeUpdateChecks(undefined)).toBeNull()
    expect(normalizeUpdateChecks(null)).toBeNull()
  })

  it('fills missing flags with false', () => {
    expect(normalizeUpdateChecks({ app: true })).toEqual({ app: true, engine: false })
  })
})
