import { describe, expect, it } from 'vitest'
import { adoptDesktopIcons } from './desktop-icons-choice'

describe('adoptDesktopIcons', () => {
  const factory = { migrated: false, enabled: false, auto: true }

  it('turns the factory pair on once for KDE Wayland', () => {
    expect(adoptDesktopIcons(factory, true)).toEqual({ migrated: true, enabled: true, auto: true })
  })

  it('leaves a chosen off alone, and leaves other desktops for a later Plasma session', () => {
    expect(adoptDesktopIcons({ migrated: false, enabled: false, auto: false }, true)).toEqual({
      migrated: true, enabled: false, auto: false
    })
    expect(adoptDesktopIcons({ migrated: true, enabled: false, auto: true }, true)).toEqual({
      migrated: true, enabled: false, auto: true
    })
    expect(adoptDesktopIcons(factory, false)).toEqual(factory)
  })

  it('keeps icons that were already on', () => {
    expect(adoptDesktopIcons({ migrated: false, enabled: true, auto: false }, true)).toEqual({
      migrated: true, enabled: true, auto: false
    })
  })
})
