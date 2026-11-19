import type { CraftoryConfig, PhaseEffort, PhaseId, Route, Running } from '../types'

/** What a phase's model or effort says when it routes nothing. */
export const SESSION = 'session'

/** The effort levels a phase can choose, `session` first. */
export const EFFORTS = [
  SESSION,
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly PhaseEffort[]

/** The model choices Settings offers; a full model id is typed in instead. */
export const MODEL_ALIASES = [SESSION, 'haiku', 'sonnet', 'opus'] as const

/** An alias or a full model id, such as `claude-opus-4-1-20250805` or `claude-sonnet-4-5[1m]`. */
export const isModelId = (text: string) =>
  text.length <= 100 && /^[A-Za-z0-9][A-Za-z0-9._:@/[\]-]*$/.test(text)

/**
 * The phase a subagent belongs to as it spawns: Build for an implementer, otherwise the phase
 * running in the main session, and none between phases.
 */
export function subagentPhase(spawn: {
  isImplementer: boolean
  running: Pick<Running, 'phase'> | null
}): PhaseId | null {
  if (spawn.isImplementer) return 'build'
  return spawn.running?.phase ?? null
}

export function routeOf(config: CraftoryConfig, phase: PhaseId | null): Route {
  if (phase === null) return {}
  const { model, effort } = config.phases[phase]
  return {
    ...(model !== SESSION && { model }),
    ...(effort !== SESSION && { effort }),
  }
}

/** The model to spawn on: the route's, unless the spawn already names one. */
export const spawnModel = (route: Route, named: string | undefined): string | undefined =>
  named === undefined ? route.model : undefined

/** `sonnet · medium`, or the one of the two that is set; null when the route sets neither. */
export function routeText(route: Route): string | null {
  if (route.model !== undefined)
    return route.effort === undefined ? route.model : `${route.model} · ${route.effort}`
  return route.effort === undefined ? null : `${route.effort} effort`
}
