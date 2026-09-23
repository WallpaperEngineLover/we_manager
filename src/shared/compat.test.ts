import { describe, expect, it } from 'vitest'
import { compatStatus, needsFreshLaunch } from './compat'

describe('compatStatus', () => {
  it('ranks a launch crash above everything else', () => {
    expect(compatStatus({ freshLaunch: 'crash', hotswapCrash: true, runtimeCrashes: 3 })).toBe('crashes')
  })

  it('tells a hotswap-only problem from one still being tested', () => {
    expect(compatStatus({ hotswapCrash: true, freshLaunch: 'ok' })).toBe('hotswap-only')
    expect(compatStatus({ hotswapCrash: true })).toBe('hotswap-untested')
  })

  it('reports runtime crashes and is fine otherwise', () => {
    expect(compatStatus({ runtimeCrashes: 1 })).toBe('unstable')
    expect(compatStatus({ note: 'looks odd' })).toBe('ok')
    expect(compatStatus(undefined)).toBe('ok')
  })
})

describe('needsFreshLaunch', () => {
  it('is only needed after a hotswap crash', () => {
    expect(needsFreshLaunch({ hotswapCrash: true, freshLaunch: 'ok' })).toBe(true)
    expect(needsFreshLaunch({ runtimeCrashes: 2 })).toBe(false)
  })
})
