import { atom, type EngineInterface, read, update } from 'claude-code'
import { mainRoute, routeOf, spawnModel, subagentPhase } from '../../src/routing'
import type { AgentId, AgentRoute, Route } from '../../types'
import { runningOf } from './flow'
import { repoFacts } from './repo'

const routesState = atom({ plugin: 'craftory', key: 'routes' } as const, {})

/** What a spawn is routed to, and the model to pass on: none when the call names its own. */
export type SpawnRouting = { agent: AgentRoute | null; model: string | undefined }

/**
 * Routes a spawn by the phase it belongs to. A fork and a resumed run keep what they had, and a
 * call that names a model is left alone.
 */
export async function routeSpawn(
  $: EngineInterface,
  spawn: { isImplementer: boolean; model?: string; fork: boolean; isResumed: boolean },
): Promise<SpawnRouting> {
  if (spawn.fork || spawn.isResumed || spawn.model !== undefined)
    return { agent: null, model: undefined }
  const [running, { config }] = await Promise.all([runningOf($), repoFacts($)])
  const phase = subagentPhase({ isImplementer: spawn.isImplementer, running })
  if (phase === null) return { agent: null, model: undefined }
  const route = routeOf(config, phase)
  return { agent: { phase, route }, model: spawnModel(route, spawn.model) }
}

export async function rememberRoute(
  $: EngineInterface,
  agentId: string | undefined,
  routing: SpawnRouting,
) {
  const { agent } = routing
  if (agentId === undefined || agent === null) return
  await update($, routesState, routes => ({ ...routes, [agentId]: agent }))
}

/** The route a subagent spawned with; its every step runs at that effort. */
export async function routeOfAgent($: EngineInterface, agentId: AgentId): Promise<Route> {
  return (await read($, routesState))[agentId]?.route ?? {}
}

/** What the main session runs on now, with `routing.mainThread` on and a routed phase running. */
export async function mainRouteOf($: EngineInterface): Promise<AgentRoute | null> {
  const [running, { config }] = await Promise.all([runningOf($), repoFacts($)])
  return mainRoute(config, running)
}
