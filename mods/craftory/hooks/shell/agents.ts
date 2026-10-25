import type { EngineInterface } from 'claude-code'
import {
  type AgentCall,
  budgetFor,
  budgetK,
  type FinishReason,
  freshTokens,
  isoOf,
  pauseText,
  type SpawnDecision,
  tddStepOf,
} from '../../src/build'
import { configOf } from '../../src/config'
import { specKey } from '../../src/features'
import type { AgentId, IssueRef, SeatPlan } from '../../types'
import { activeRecord, featureOfTicket, featuresOf, recordChange, recordRun } from './features'
import { currentFlow, settle } from './flow'
import {
  bookSpawn,
  countTokens,
  endRun,
  ledgerOf,
  raiseRunBudget,
  seatRun,
  setPaused,
} from './ledger'
import { addNotice } from './notices'
import { repoSnapshot } from './repo'
import { refreshGit, scheduleGit, scheduleRefresh } from './sync'

/**
 * A record still marked running with no live run in this session belongs to a session that
 * ended without closing it. `stopped` outranks `running` in the merge order, so this sticks.
 */
export async function stopStaleAgents($: EngineInterface) {
  const [features, ledger] = await Promise.all([featuresOf($), ledgerOf($)])
  const live = new Set(
    Object.values(ledger.runs)
      .filter(run => run.status === 'running')
      .map(run => run.ticket),
  )
  const at = isoOf(await $.clock.now())
  for (const record of Object.values(features))
    for (const agent of Object.values(record.agents))
      if (agent.outcome === 'running' && !live.has(agent.ticket))
        await recordChange($, specKey(record.spec), {
          kind: 'agent',
          record: { ...agent, outcome: 'stopped', endedAt: at },
        })
}

export async function planSpawn($: EngineInterface, call: AgentCall): Promise<SpawnDecision> {
  const [flow, repo, record] = await Promise.all([currentFlow($), repoSnapshot($), activeRecord($)])
  if (flow === null || record === null) return { kind: 'pass' }
  const decision = await bookSpawn($, {
    call,
    flow,
    config: configOf(repo?.config),
    integrationBranch: record.integrationBranch,
    at: await $.clock.now(),
  })
  if (decision.kind === 'deny') await settle($)
  return decision
}

export async function seatAgent(
  $: EngineInterface,
  toolUseId: string,
  plan: SeatPlan,
  agentId: AgentId,
) {
  const repo = await repoSnapshot($)
  const old = (await featureOfTicket($, plan.ticket))?.agents[plan.ticket]
  const budget = budgetFor(configOf(repo?.config), old)
  const run = await seatRun($, { toolUseId, agentId, budget, at: await $.clock.now() })
  if (run !== undefined) await recordRun($, run)
  await refreshGit($)
  await settle($)
}

export async function countStep(
  $: EngineInterface,
  agentId: AgentId,
  result: {
    answer: string
    usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
    } | null
  },
) {
  const { crossed, run } = await countTokens($, agentId, {
    tokens: result.usage === null ? 0 : freshTokens(result.usage),
    tddStep: tddStepOf(result.answer),
    at: await $.clock.now(),
  })
  if (run === null) return
  if (crossed === null) return $.ui.invalidate('ui.render')
  if (crossed === 'over') {
    await addNotice($, {
      kind: 'budget',
      id: `budget-${run.ticket}`,
      ticket: run.ticket,
      budget: run.budget,
    })
  }
  await recordRun($, run)
  await settle($)
}

export async function finishAgent($: EngineInterface, agentId: AgentId, reason: FinishReason) {
  const run = await endRun($, agentId, reason, await $.clock.now())
  if (run === null) return
  await recordRun($, run)
  scheduleGit($)
  scheduleRefresh($)
}

export async function togglePause($: EngineInterface) {
  const ledger = await setPaused($, !(await ledgerOf($)).isPaused)
  if (ledger.isPaused) {
    for (const run of Object.values(ledger.runs))
      if (run.status === 'running')
        await $.session.send({ to: { agentId: run.agentId }, text: pauseText })
  } else {
    $.ui.toast('Build resumed · ask Claude to start the queued tickets')
  }
  await settle($)
}

export async function raiseBudget($: EngineInterface, ticket: IssueRef) {
  const record = await featureOfTicket($, ticket)
  const old = record?.agents[ticket]
  if (record === null || old === undefined) return
  const step = configOf((await repoSnapshot($))?.config).worktrees.tokenBudget
  const budget = old.budget + step
  await recordChange($, specKey(record.spec), { kind: 'agent', record: { ...old, budget } })
  await raiseRunBudget($, ticket, budget)
  $.ui.toast(`Budget for ${ticket} raised to ${budgetK(budget)} · run it again to continue`)
}
