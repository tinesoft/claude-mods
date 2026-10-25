import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  addPending,
  addQueued,
  type AgentCall,
  decideSpawn,
  deliverStop,
  dropPending,
  EMPTY_LEDGER,
  type FinishReason,
  finishRun,
  isBuilding,
  markStopping,
  patchRun,
  raiseRunBudget,
  recordUsage,
  seated,
  type SpawnDecision,
} from '../../src/build'
import type { Flow } from '../../src/evidence'
import type { AgentId, AgentRun, BuildLedger, CraftoryConfig, IssueRef, Millis } from '../../types'

const buildState = atom({ plugin: 'craftory', key: 'build' } as const, EMPTY_LEDGER)

/**
 * `update` hands its function the held ledger and takes the next one back, with no way out for
 * what the step decided. The box carries that out; it is written once, inside the one update.
 */
async function updateWith<T>(
  $: EngineInterface,
  initial: T,
  step: (ledger: BuildLedger) => readonly [BuildLedger, T],
): Promise<T> {
  const out = { value: initial }
  await update($, buildState, ledger => {
    const [next, value] = step(ledger)
    out.value = value
    return next
  })
  return out.value
}

export function ledgerOf($: EngineInterface) {
  return read($, buildState)
}

export async function hasAgentRuns($: EngineInterface) {
  return Object.keys((await read($, buildState)).runs).length > 0
}

export async function runOf($: EngineInterface, agentId: AgentId | undefined) {
  return agentId === undefined ? undefined : (await read($, buildState)).runs[agentId]
}

export async function pendingSeat($: EngineInterface, toolUseId: string) {
  return (await read($, buildState)).pending[toolUseId]
}

export async function forgetSeat($: EngineInterface, toolUseId: string) {
  await update($, buildState, ledger => dropPending(ledger, toolUseId))
}

export async function markStopDelivered($: EngineInterface, agentId: AgentId) {
  await update($, buildState, ledger => deliverStop(ledger, agentId))
}

export async function stopForConflict($: EngineInterface, agentId: AgentId) {
  await update($, buildState, ledger => markStopping(ledger, agentId, 'conflict'))
}

/** Decides one Agent call against the ledger and books a steer or a queued ticket in the same write. */
export async function bookSpawn(
  $: EngineInterface,
  args: {
    call: AgentCall
    flow: Flow
    config: CraftoryConfig
    integrationBranch: string
    at: Millis
  },
): Promise<SpawnDecision> {
  const { call, flow, config, integrationBranch, at } = args
  return updateWith<SpawnDecision>($, { kind: 'pass' }, ledger => {
    const decision = decideSpawn({
      call,
      ledger,
      config,
      isBuildRunning: isBuilding(flow),
      tickets: flow.tickets,
      integrationBranch,
    })
    if (decision.kind === 'steer')
      return [addPending(ledger, call.toolUseId, decision.plan, at), decision]
    if (decision.kind === 'deny' && decision.isQueued)
      return [addQueued(ledger, decision.ticket), decision]
    return [ledger, decision]
  })
}

export async function seatRun(
  $: EngineInterface,
  seat: { toolUseId: string; agentId: AgentId; budget: number; at: Millis },
): Promise<AgentRun | undefined> {
  const { toolUseId, agentId, budget, at } = seat
  await update($, buildState, ledger => seated(ledger, toolUseId, agentId, budget, at))
  return (await read($, buildState)).runs[agentId]
}

export async function countTokens(
  $: EngineInterface,
  agentId: AgentId,
  step: { tokens: number; tddStep: string | null; at: Millis },
) {
  return updateWith<{ crossed: 'near' | 'over' | null; run: AgentRun | null }>(
    $,
    { crossed: null, run: null },
    ledger => {
      const used = recordUsage(ledger, agentId, step.tokens, step.at)
      const next =
        step.tddStep === null
          ? used.ledger
          : patchRun(used.ledger, agentId, { tddStep: step.tddStep })
      return [next, { crossed: used.crossed, run: used.run }]
    },
  )
}

export async function endRun(
  $: EngineInterface,
  agentId: AgentId,
  reason: FinishReason,
  at: Millis,
): Promise<AgentRun | null> {
  const paused = (await read($, buildState)).isPaused
  return updateWith<AgentRun | null>($, null, ledger => {
    const finished = finishRun(
      ledger,
      agentId,
      paused && reason === 'answer' ? 'aborted' : reason,
      at,
    )
    return [finished.ledger, finished.run]
  })
}

export async function setPaused($: EngineInterface, isPaused: boolean) {
  await update($, buildState, ledger => ({ ...ledger, isPaused }))
  return read($, buildState)
}

export async function raiseBudgetOf($: EngineInterface, ticket: IssueRef, budget: number) {
  await update($, buildState, ledger => raiseRunBudget(ledger, ticket, budget))
}
