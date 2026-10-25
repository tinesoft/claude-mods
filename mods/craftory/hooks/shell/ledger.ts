import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  addPending,
  addQueued,
  type AgentCall,
  budgetState,
  decideSpawn,
  deliverStop,
  dropPending,
  EMPTY_LEDGER,
  type FinishReason,
  finishRun,
  isBuilding,
  markStopping,
  patchRun,
  recordUsage,
  seated,
  type SpawnDecision,
} from '../../src/build'
import type { Flow } from '../../src/evidence'
import type { AgentId, AgentRun, CraftoryConfig, IssueRef, Millis } from '../../types'

const buildState = atom({ plugin: 'craftory', key: 'build' } as const, EMPTY_LEDGER)

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
  const decided: { value: SpawnDecision } = { value: { kind: 'pass' } }
  await update($, buildState, ledger => {
    const decision = decideSpawn({
      call,
      ledger,
      config,
      isBuildRunning: isBuilding(flow),
      tickets: flow.tickets,
      integrationBranch,
    })
    decided.value = decision
    if (decision.kind === 'steer') return addPending(ledger, call.toolUseId, decision.plan, at)
    if (decision.kind === 'deny' && decision.isQueued) return addQueued(ledger, decision.ticket)
    return ledger
  })
  return decided.value
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
  const seen: { crossed: 'near' | 'over' | null; run: AgentRun | null } = {
    crossed: null,
    run: null,
  }
  await update($, buildState, ledger => {
    const used = recordUsage(ledger, agentId, step.tokens, step.at)
    seen.crossed = used.crossed
    seen.run = used.run
    return step.tddStep === null
      ? used.ledger
      : patchRun(used.ledger, agentId, { tddStep: step.tddStep })
  })
  return seen
}

export async function endRun(
  $: EngineInterface,
  agentId: AgentId,
  reason: FinishReason,
  at: Millis,
): Promise<AgentRun | null> {
  const paused = (await read($, buildState)).isPaused
  const done: { run: AgentRun | null } = { run: null }
  await update($, buildState, ledger => {
    const finished = finishRun(
      ledger,
      agentId,
      paused && reason === 'answer' ? 'aborted' : reason,
      at,
    )
    done.run = finished.run
    return finished.ledger
  })
  return done.run
}

export async function setPaused($: EngineInterface, isPaused: boolean) {
  await update($, buildState, ledger => ({ ...ledger, isPaused }))
  return read($, buildState)
}

export async function raiseRunBudget($: EngineInterface, ticket: IssueRef, budget: number) {
  await update($, buildState, ledger => ({
    ...ledger,
    runs: Object.fromEntries(
      Object.entries(ledger.runs).map(([id, run]) => [
        id,
        run.ticket === ticket && run.status === 'running'
          ? { ...run, budget, budgetState: budgetState(run.tokens, budget) }
          : run,
      ]),
    ),
  }))
}
