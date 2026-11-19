import type {
  AgentRoute,
  CraftoryConfig,
  KeptWorktree,
  ModelId,
  PhaseEffort,
  PhaseId,
  Route,
  Running,
} from '../types'
import type { RowStatus } from './build'
import { PHASES } from './phases'

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

/** The model **Retry on …** offers by default: the strongest alias, last of MODEL_ALIASES. */
export const DEFAULT_ESCALATION: ModelId = MODEL_ALIASES[MODEL_ALIASES.length - 1]!

/** Whether a model is one of MODEL_ALIASES (`session` included) rather than a full id. */
export const isAlias = (model: ModelId): model is (typeof MODEL_ALIASES)[number] =>
  (MODEL_ALIASES as readonly string[]).includes(model)

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
export const spawnModel = (route: Route, named: ModelId | undefined): ModelId | undefined =>
  named === undefined ? route.model : undefined

/** `sonnet · medium`, or the one of the two that is set; null when the route sets neither. */
export function routeText(route: Route): string | null {
  if (route.model !== undefined)
    return route.effort === undefined ? route.model : `${route.model} · ${route.effort}`
  return route.effort === undefined ? null : `${route.effort} effort`
}

/** A family word of each alias but `session`, as a full id spells it: `claude-opus-4-5` is opus. */
const FAMILY = new RegExp(
  `(?:^|-)(${MODEL_ALIASES.filter(a => a !== SESSION).join('|')})(?=-|\\[|$)`,
)

/** The model family an alias or a full id names, or null. */
const familyOf = (model: ModelId): string | null =>
  isAlias(model) ? model : (FAMILY.exec(model)?.[1] ?? null)

/** Whether two models are one: the same text, or an alias and an id of its family. */
const isSameModel = (a: ModelId, b: ModelId) => {
  if (a === b) return true
  if (!isAlias(a) && !isAlias(b)) return false
  return familyOf(a) !== null && familyOf(a) === familyOf(b)
}

/** The ticket states that offer a retry on a stronger model: Failed, or Over budget. */
export const RETRY_STATUSES = ['failed', 'over'] as const satisfies readonly RowStatus[]

const isRetryStatus = (status: RowStatus) =>
  (RETRY_STATUSES as readonly RowStatus[]).includes(status)

/**
 * The model **Retry on …** offers a stuck ticket: `escalateTo`, unless it is `session` or the
 * model the ticket's last agent ran on. A record from before the model was kept is offered it.
 */
export function retryModel(row: {
  status: RowStatus
  escalateTo: ModelId
  lastModel: ModelId | undefined
}): ModelId | null {
  const { status, escalateTo, lastModel } = row
  if (!isRetryStatus(status) || escalateTo === SESSION) return null
  return lastModel !== undefined && isSameModel(escalateTo, lastModel) ? null : escalateTo
}

/** The context line `/implement <ticket>` carries after a press of **Retry on …**. */
export const retryContext = (args: { ticket: string; model: ModelId } & KeptWorktree) =>
  `Craftory: the user pressed Retry on ${args.model} for ${args.ticket}. Start one implementer for ${args.ticket} again, as before; ` +
  `Craftory runs it on ${args.model} in its kept worktree \`${args.worktree}\` on branch \`${args.branch}\`, ` +
  'so it carries on from what is committed there. Start no other ticket.'

/**
 * What the main session's steps run on now: the running phase's route, with `routing.mainThread`
 * on and the phase routing something. Between phases, and in an entry point, none.
 */
export function mainRoute(
  config: CraftoryConfig,
  running: Pick<Running, 'phase'> | null,
): AgentRoute | null {
  const phase = running?.phase ?? null
  if (!config.routing.mainThread || phase === null) return null
  const route = routeOf(config, phase)
  return routeText(route) === null ? null : { phase, route }
}

/** The band note while the main session is routed: `Align runs on opus · high`. */
export const mainRouteText = ({ phase, route }: AgentRoute) =>
  `${PHASES[phase].label} runs on ${routeText(route)}`
