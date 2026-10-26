import { describe, expect, it, vi } from 'vitest'

vi.mock('./lwe.service', () => ({ detectDistro: () => 'arch' }))
vi.mock('../i18n', () => ({ t: (key: string) => key }))

import { pickLibnodeAsset } from './lwe-libnode.service'

const asset = (name: string) => ({ name, browser_download_url: `https://example.invalid/${name}`, size: 1 })

describe('pickLibnodeAsset', () => {
  it('takes the pacman package', () => {
    const picked = pickLibnodeAsset([asset('notes.txt'), asset('libnode-26.2.0-1-x86_64.pkg.tar.zst')])
    expect(picked?.name).toBe('libnode-26.2.0-1-x86_64.pkg.tar.zst')
  })

  it('ignores signatures and other packages', () => {
    expect(pickLibnodeAsset([asset('libnode-26.2.0-1-x86_64.pkg.tar.zst.sig'), asset('nodejs-26-1-x86_64.pkg.tar.zst')])).toBeUndefined()
  })
})
