import { describe, expect, it, vi } from 'vitest'

vi.mock('./lwe.service', () => ({ getLweStatus: () => ({ installed: false }) }))
vi.mock('../i18n', () => ({ t: (key: string) => key }))

import { flatpakInstallCommands, parseExtensionState, parseStringArray } from './gnome-extension.service'

describe('parseExtensionState', () => {
  it('reads the state line of gnome-extensions info', () => {
    const output = [
      'linux-wallpaperengine@wallpaperenginelover.github.io',
      '  Name: linux-wallpaperengine',
      '  Path: /home/user/.local/share/gnome-shell/extensions/linux-wallpaperengine@wallpaperenginelover.github.io',
      '  Enabled: Yes',
      '  State: ACTIVE'
    ].join('\n')
    expect(parseExtensionState(output)).toBe('ACTIVE')
  })

  it('keeps states made of two words', () => {
    expect(parseExtensionState('  State: OUT OF DATE\n')).toBe('OUT OF DATE')
  })

  it('has nothing for an unknown extension', () => {
    expect(parseExtensionState('Extension “x” doesn\'t exist')).toBeUndefined()
  })
})

describe('parseStringArray', () => {
  it('reads gsettings string arrays', () => {
    expect(parseStringArray("['a@b', 'c@d']")).toEqual(['a@b', 'c@d'])
    expect(parseStringArray('@as []')).toEqual([])
  })
})

describe('flatpakInstallCommands', () => {
  it('copies the Flatpak copy from its host path and enables it', () => {
    const commands = flatpakInstallCommands("/var/lib/flatpak/app/x/files/bin/gnome-shell-extension/it's")
    expect(commands[1]).toBe("cp -r '/var/lib/flatpak/app/x/files/bin/gnome-shell-extension/it'\\''s' ~/.local/share/gnome-shell/extensions/")
    expect(commands[2]).toBe('gnome-extensions enable linux-wallpaperengine@wallpaperenginelover.github.io')
  })
})
