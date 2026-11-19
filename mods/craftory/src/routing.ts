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

/** The model family an alias or a full id names (`claude-opus-4-5` is opus), or null. */
const familyOf = (model: string): string | null => {
  const aliases: readonly string[] = MODEL_ALIASES
  if (aliases.includes(model)) return model
  return /(?:^|-)(haiku|sonnet|opus)(?=-|\[|$)/.exec(model)?.[1] ?? null
}

/** Whether two models are one: the same text, or an alias and an id of its family. */
const isSameModel = (a: string, b: string) => {
  if (a === b) return true
  const aliases: readonly string[] = MODEL_ALIASES
  if (!aliases.includes(a) && !aliases.includes(b)) return false
  return familyOf(a) !== null && familyOf(a) === familyOf(b)
}

/** The ticket states that offer a retry on a stronger model: Failed, or Over budget. */
export const RETRY_STATUSES = ['failed', 'over'] as const

/**
 * The model **Retry on …** offers a stuck ticket: `escalateTo`, unless it is `session` or the
 * model the ticket's last agent ran on. A record from before the model was kept is offered it.
 */
export function retryModel(row: {
  status: string
  escalateTo: string
  lastModel: string | undefined
}): string | null {
  const { status, escalateTo, lastModel } = row
  const statuses: readonly string[] = RETRY_STATUSES
  if (!statuses.includes(status) || escalateTo === SESSION) return null
  return lastModel !== undefined && isSameModel(escalateTo, lastModel) ? null : escalateTo
}

/** The context line `/implement <ticket>` carries after a press of **Retry on …**. */
export const retryContext = (args: {
  ticket: string
  model: string
  worktree: string
  branch: string
}) =>
  `Craftory: the user pressed Retry on ${args.model} for ${args.ticket}. Start one implementer for ${args.ticket} again, as before; ` +
  `Craftory runs it on ${args.model} in its kept worktree \`${args.worktree}\` on branch \`${args.branch}\`, ` +
  'so it carries on from what is committed there. Start no other ticket.'
