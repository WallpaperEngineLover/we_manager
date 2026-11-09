import type { AppRule } from './types'

export interface Observation {
  /** normalized process names, see normalizeProcessName */
  processes: ReadonlySet<string>
  audioPlaying: boolean
}

export interface RuleState {
  active: boolean
  /** since when the condition has not held while the rule is active */
  unmetSince: number | null
}

export type RuleStates = Record<string, RuleState>

// a track change or a short pause between songs must not end the rule
export const AUDIO_GRACE_MS = 8000
export const PROCESS_GRACE_MS = 2500

/** Case folded base name without a trailing .exe, so "C:\Games\Game.EXE" and "game" are the same program */
export function normalizeProcessName(name: string): string {
  const base = name.trim().split(/[\\/]/).pop() ?? ''
  return base.toLowerCase().replace(/\.exe$/, '')
}

export function parseProcessNames(text: string): string[] {
  const names = text
    .split(/[,\n]/)
    .map(normalizeProcessName)
    .filter((name) => name !== '')
  return [...new Set(names)]
}

export function conditionMet(rule: AppRule, observation: Observation): boolean {
  if (rule.condition.type === 'audio') return observation.audioPlaying
  return rule.condition.names.some((name) => observation.processes.has(normalizeProcessName(name)))
}

function graceFor(rule: AppRule): number {
  return rule.condition.type === 'audio' ? AUDIO_GRACE_MS : PROCESS_GRACE_MS
}

export interface StepResult {
  next: RuleStates
  /** rules whose condition just started to hold, in list order */
  activate: AppRule[]
  /** ids of rules that ended: the condition was gone for the grace time, or the rule was disabled or deleted */
  deactivate: string[]
}

/**
 * One look at the world. A rule becomes active the moment its condition holds and stays active until the condition
 * has been gone for its grace time, so the action fires once per start and not on every blip.
 */
export function stepAppRules(previous: RuleStates, rules: AppRule[], observation: Observation, now: number): StepResult {
  const next: RuleStates = {}
  const activate: AppRule[] = []
  const deactivate: string[] = []

  for (const rule of rules) {
    const before = previous[rule.id] ?? { active: false, unmetSince: null }

    if (!rule.enabled) {
      if (before.active) deactivate.push(rule.id)
      continue
    }

    if (conditionMet(rule, observation)) {
      if (!before.active) activate.push(rule)
      next[rule.id] = { active: true, unmetSince: null }
    } else if (before.active) {
      const since = before.unmetSince ?? now
      if (now - since >= graceFor(rule)) deactivate.push(rule.id)
      else next[rule.id] = { active: true, unmetSince: since }
    }
  }

  const known = new Set(rules.map((rule) => rule.id))
  for (const [id, state] of Object.entries(previous)) {
    if (!known.has(id) && state.active) deactivate.push(id)
  }

  return { next, activate, deactivate }
}

/** What one screen showed before a rule changed it */
export interface LayerEntry<A> {
  ruleId: string
  previous: A
}

export type ScreenLayers<A> = Record<string, LayerEntry<A>[]>

export function pushLayer<A>(layers: ScreenLayers<A>, screen: string, ruleId: string, previous: A): ScreenLayers<A> {
  return { ...layers, [screen]: [...(layers[screen] ?? []).filter((entry) => entry.ruleId !== ruleId), { ruleId, previous }] }
}

/**
 * Takes a rule off every screen. A screen the rule was on top of gets what was there before it back in `restore`; under a
 * later rule the entry above inherits the previous state, so the screen still goes back to the original when that one
 * ends too.
 */
export function popLayers<A>(
  layers: ScreenLayers<A>,
  ruleId: string
): { layers: ScreenLayers<A>; restore: Record<string, A> } {
  const next: ScreenLayers<A> = {}
  const restore: Record<string, A> = {}

  for (const [screen, stack] of Object.entries(layers)) {
    const index = stack.findIndex((entry) => entry.ruleId === ruleId)
    if (index === -1) {
      next[screen] = stack
      continue
    }

    const rest = [...stack]
    const [removed] = rest.splice(index, 1)
    if (index === stack.length - 1) restore[screen] = removed.previous
    else rest[index] = { ...rest[index], previous: removed.previous }
    if (rest.length > 0) next[screen] = rest
  }

  return { layers: next, restore }
}
