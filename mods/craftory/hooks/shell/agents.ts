import type { EngineInterface } from 'claude-code'
import {
  type AgentCall,
  budgetFor,
  budgetK,
  type FinishReason,
  freshTokens,
  isoOf,
  pauseText,
  recordOf,
  type SpawnDecision,
  splitArgv,
  tddStepOf,
  testRunOf,
} from '../../src/build'
import { specKey } from '../../src/features'
import type { AgentId, AgentRun, IssueRef, SeatPlan } from '../../types'
import { activeRecord, featureOfTicket, featuresOf, recordChange, recordRun } from './features'
import { currentFlow, settle } from './flow'
import {
  bookSpawn,
  countTokens,
  endRun,
  ledgerOf,
  raiseBudgetOf,
  runOf,
  seatRun,
  setPaused,
} from './ledger'
import { addNotice } from './notices'
import { repoFacts, repoPath } from './repo'
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
  const [flow, { config }, record] = await Promise.all([
    currentFlow($),
    repoFacts($),
    activeRecord($),
  ])
  if (flow === null || record === null) return { kind: 'pass' }
  const decision = await bookSpawn($, {
    call,
    flow,
    config,
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
  const { config } = await repoFacts($)
  const old = (await featureOfTicket($, plan.ticket))?.agents[plan.ticket]
  const budget = budgetFor(config, old)
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

/**
 * An implementer's turn ended. Its first end closes the run; any end of a run that finished with
 * its answer, the first or a later one, runs `worktrees.test` in its worktree, off the turn.
 */
export async function finishAgent($: EngineInterface, agentId: AgentId, reason: FinishReason) {
  const ended = await endRun($, agentId, reason, await $.clock.now())
  if (ended !== null) {
    await recordRun($, ended)
    scheduleGit($)
    scheduleRefresh($)
  }
  const run = ended ?? (await runOf($, agentId))
  if (run?.status === 'done') $.clock.after(0, () => void testTicket($, run))
}

async function testTicket($: EngineInterface, run: AgentRun) {
  const { worktrees } = (await repoFacts($)).config
  const argv = splitArgv(worktrees.test)
  if (argv === null) return
  const timeoutMs = worktrees.testTimeoutSec * 1000
  const started = await $.clock.now()
  const outcome = await $.process
    .run(argv, { cwd: await repoPath($, run.worktree), timeoutMs })
    .then(r => ({ kind: 'exited' as const, ...r }))
    .catch(async (error: unknown) =>
      (await $.clock.now()) - started >= timeoutMs
        ? { kind: 'timed-out' as const }
        : {
            kind: 'not-run' as const,
            message: error instanceof Error ? error.message : String(error),
          },
    )
  const test = testRunOf(outcome, await $.clock.now())
  const record = (await featureOfTicket($, run.ticket)) ?? (await activeRecord($))
  if (record === null) return
  await recordChange($, specKey(record.spec), {
    kind: 'agent',
    record: { ...recordOf(run), test },
  })
  await settle($)
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
  const step = (await repoFacts($)).config.worktrees.tokenBudget
  const budget = old.budget + step
  await recordChange($, specKey(record.spec), { kind: 'agent', record: { ...old, budget } })
  await raiseBudgetOf($, ticket, budget)
  $.ui.toast(`Budget for ${ticket} raised to ${budgetK(budget)} · run it again to continue`)
}
