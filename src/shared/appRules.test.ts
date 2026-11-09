import { describe, expect, it } from 'vitest'
import {
  AUDIO_GRACE_MS,
  PROCESS_GRACE_MS,
  normalizeProcessName,
  parseProcessNames,
  popLayers,
  pushLayer,
  stepAppRules,
  type Observation,
  type RuleStates
} from './appRules'
import type { AppRule } from './types'

const none: Observation = { processes: new Set(), audioPlaying: false }

function processRule(id: string, names: string[], extra: Partial<AppRule> = {}): AppRule {
  return {
    id,
    name: id,
    enabled: true,
    condition: { type: 'process', names },
    action: { type: 'stop' },
    screen: '*',
    revert: true,
    ...extra
  }
}

const audioRule: AppRule = { ...processRule('music', []), condition: { type: 'audio' } }

describe('process names', () => {
  it('ignores case, paths and .exe', () => {
    expect(normalizeProcessName(' C:\\Games\\Game.EXE ')).toBe('game')
    expect(normalizeProcessName('/usr/bin/Firefox')).toBe('firefox')
    expect(normalizeProcessName('')).toBe('')
  })

  it('splits a list on commas and lines and drops duplicates', () => {
    expect(parseProcessNames('Steam, game.exe\n\nSTEAM')).toEqual(['steam', 'game'])
  })
})

describe('stepAppRules', () => {
  it('fires a rule once when its program starts and not again while it runs', () => {
    const rule = processRule('a', ['game.exe'])
    const running: Observation = { processes: new Set(['game']), audioPlaying: false }

    const first = stepAppRules({}, [rule], running, 1000)
    expect(first.activate).toEqual([rule])

    const second = stepAppRules(first.next, [rule], running, 3000)
    expect(second.activate).toEqual([])
    expect(second.deactivate).toEqual([])
  })

  it('keeps the rule through a short gap and ends it after the grace time', () => {
    const rule = processRule('a', ['game'])
    const running: Observation = { processes: new Set(['game']), audioPlaying: false }
    let states: RuleStates = stepAppRules({}, [rule], running, 0).next

    const gone = stepAppRules(states, [rule], none, 1000)
    expect(gone.deactivate).toEqual([])
    states = gone.next

    const back = stepAppRules(states, [rule], running, 2000)
    expect(back.activate).toEqual([])
    expect(back.next.a.unmetSince).toBeNull()

    const away = stepAppRules(back.next, [rule], none, 3000)
    const ended = stepAppRules(away.next, [rule], none, 3000 + PROCESS_GRACE_MS)
    expect(ended.deactivate).toEqual(['a'])
    expect(ended.next.a).toBeUndefined()
  })

  it('waits longer for audio than for programs', () => {
    const playing: Observation = { processes: new Set(), audioPlaying: true }
    const started = stepAppRules({}, [audioRule], playing, 0)
    expect(started.activate).toEqual([audioRule])

    const quiet = stepAppRules(started.next, [audioRule], none, 1000)
    const stillOn = stepAppRules(quiet.next, [audioRule], none, 1000 + PROCESS_GRACE_MS)
    expect(stillOn.deactivate).toEqual([])
    const over = stepAppRules(stillOn.next, [audioRule], none, 1000 + AUDIO_GRACE_MS)
    expect(over.deactivate).toEqual(['music'])
  })

  it('ends an active rule that was disabled or deleted at once', () => {
    const rule = processRule('a', ['game'])
    const running: Observation = { processes: new Set(['game']), audioPlaying: false }
    const states = stepAppRules({}, [rule], running, 0).next

    expect(stepAppRules(states, [{ ...rule, enabled: false }], running, 10).deactivate).toEqual(['a'])
    expect(stepAppRules(states, [], running, 10).deactivate).toEqual(['a'])
  })

  it('does not fire a disabled rule', () => {
    const rule = processRule('a', ['game'], { enabled: false })
    const running: Observation = { processes: new Set(['game']), audioPlaying: false }
    expect(stepAppRules({}, [rule], running, 0).activate).toEqual([])
  })

  it('matches any of several names', () => {
    const rule = processRule('a', ['one', 'two.exe'])
    const running: Observation = { processes: new Set(['two']), audioPlaying: false }
    expect(stepAppRules({}, [rule], running, 0).activate).toEqual([rule])
  })
})

describe('layers', () => {
  it('gives a screen back what it showed before the top rule', () => {
    let layers = pushLayer({}, 'DP-1', 'a', 'original')
    layers = pushLayer(layers, 'DP-1', 'b', 'from a')

    const first = popLayers(layers, 'b')
    expect(first.restore).toEqual({ 'DP-1': 'from a' })
    const second = popLayers(first.layers, 'a')
    expect(second.restore).toEqual({ 'DP-1': 'original' })
    expect(second.layers).toEqual({})
  })

  it('hands the original to the rule above when a lower rule ends first', () => {
    let layers = pushLayer({}, 'DP-1', 'a', 'original')
    layers = pushLayer(layers, 'DP-1', 'b', 'from a')

    const lower = popLayers(layers, 'a')
    expect(lower.restore).toEqual({})
    expect(popLayers(lower.layers, 'b').restore).toEqual({ 'DP-1': 'original' })
  })

  it('leaves screens the rule never touched alone', () => {
    const layers = pushLayer({}, 'DP-1', 'a', 'x')
    expect(popLayers(layers, 'b')).toEqual({ layers, restore: {} })
  })
})
