import { expect, test } from 'claude-code/testing'
import {
  addPending,
  addQueued,
  agentName,
  agentRows,
  agentSummary,
  budgetState,
  cleanupPlan,
  decideSpawn,
  deliverStop,
  dropPending,
  EMPTY_LEDGER,
  elapsedText,
  finishRun,
  freshTokens,
  moveNotices,
  queueReason,
  recordOf,
  recordUsage,
  seated,
  slotsUsed,
  splitArgv,
  tddStepOf,
  type AgentCall,
} from '../src/build'
import { DEFAULT_CONFIG } from '../src/config'
import type { TicketRow, TicketStatus } from '../src/evidence'
import type {
  AgentId,
  AgentRecord,
  BuildLedger,
  CraftoryConfig,
  Issue,
  IssueRef,
  Worktree,
} from '../types'

const ref = (n: number) => `#${n}` as IssueRef
const agent = (n: number) => `agent-${n}` as AgentId

const row = (n: number, title: string, status: TicketStatus = 'ready', blockedBy: number[] = []) =>
  ({
    status,
    blockedBy: blockedBy.map(ref),
    issue: {
      ref: ref(n),
      title,
      kind: 'ticket',
      status: status === 'merged' ? 'done' : 'open',
      role: status === 'human' ? 'ready-for-human' : 'ready-for-agent',
      parent: ref(42),
      blockedBy: blockedBy.map(ref),
      isBug: false,
      createdAt: null,
      location: `docs/issues/${n}.md`,
    } satisfies Issue,
  }) satisfies TicketRow

const TICKETS = [
  row(43, 'Export button', 'merged'),
  row(44, 'Ledger lines include tax columns'),
  row(45, 'Filter export by date range'),
  row(46, 'Email the CSV', 'blocked', [44]),
  row(47, 'Pick the default column order', 'human'),
  row(48, 'Header row'),
]

const call = (over: Partial<AgentCall> = {}): AgentCall => ({
  toolUseId: 'tu1',
  description: 'Implement #44',
  prompt: 'Build ticket #44 with tdd.',
  isolation: 'worktree',
  ...over,
})

const decide = (
  ledger: BuildLedger = EMPTY_LEDGER,
  over: Partial<AgentCall> = {},
  config: CraftoryConfig = DEFAULT_CONFIG,
) =>
  decideSpawn({
    call: call(over),
    ledger,
    config,
    isBuildRunning: true,
    tickets: TICKETS,
    integrationBranch: 'feat/csv',
  })

const withRun = (ledger: BuildLedger, n: number, id = n) => {
  const toolUseId = `tu-${n}`
  const planned = decide(ledger, { toolUseId, description: `Implement #${n}` })
  if (planned.kind !== 'steer') throw new Error(`#${n} was not steered`)
  return seated(addPending(ledger, toolUseId, planned.plan, 1), toolUseId, agent(id), 80_000, 1)
}

test('an implementer for a ready ticket is steered into its own worktree and branch', () => {
  const decision = decide()
  expect(decision).toMatchObject({
    kind: 'steer',
    name: 'craftory-44-ledger-lines-include-tax',
    plan: {
      ticket: '#44',
      branch: 'craftory/44-ledger-lines-include-tax',
      path: '.worktrees/44-ledger-lines-include-tax',
      base: 'feat/csv',
      setup: ['pnpm', 'install', '--frozen-lockfile'],
      copy: ['.env.local', '.tool-versions'],
    },
  })
})

test('a call that is not a Build implementer passes untouched', () => {
  expect(decide(EMPTY_LEDGER, { isolation: undefined }).kind).toBe('pass')
  expect(
    decide(EMPTY_LEDGER, { description: 'Explore the repo', prompt: 'Map the code.' }).kind,
  ).toBe('pass')
  expect(
    decideSpawn({
      call: call(),
      ledger: EMPTY_LEDGER,
      config: DEFAULT_CONFIG,
      isBuildRunning: false,
      tickets: TICKETS,
      integrationBranch: 'feat/csv',
    }).kind,
  ).toBe('pass')
})

test('a merged ticket named in the prompt as a blocker does not steal the call', () => {
  const decision = decide(EMPTY_LEDGER, {
    description: 'Implement the ledger work',
    prompt: 'Blocked by #43 (merged). Build #44.',
  })
  expect(decision).toMatchObject({ kind: 'steer', plan: { ticket: '#44' } })
})

test('ready-for-human and blocked tickets are denied with what to do instead', () => {
  const human = decide(EMPTY_LEDGER, { description: 'Implement #47' })
  expect(human).toMatchObject({ kind: 'deny', ticket: '#47', isQueued: false })
  expect(human.kind === 'deny' && human.reason).toContain('ready-for-human')
  const blocked = decide(EMPTY_LEDGER, { description: 'Implement #46' })
  expect(blocked.kind === 'deny' && blocked.reason).toContain('blocked by #44')
  expect(blocked.kind === 'deny' && blocked.reason).toContain('do not call Agent for #46')
})

test('a ticket that already has an agent is not started twice', () => {
  const ledger = withRun(EMPTY_LEDGER, 44)
  const decision = decide(ledger)
  expect(decision.kind === 'deny' && decision.reason).toContain('#44 already has an agent running')
})

test('at maxParallel the spawn is queued, and the reason names what to wait for', () => {
  const config = { ...DEFAULT_CONFIG, worktrees: { ...DEFAULT_CONFIG.worktrees, maxParallel: 1 } }
  const ledger = withRun(EMPTY_LEDGER, 44)
  const decision = decide(ledger, { description: 'Implement #45' }, config)
  expect(decision).toMatchObject({ kind: 'deny', ticket: '#45', isQueued: true })
  const reason = decision.kind === 'deny' ? decision.reason : ''
  expect(reason).toBe(queueReason(ref(45), [ref(44)], 1))
  expect(reason).toContain('#44 is running')
  expect(reason).toContain('launch it after one of them returns (#44)')
  expect(reason).toContain('do not call Agent for #45 again before then')
})

test('a seat that is still pending holds its slot', () => {
  const planned = decide()
  if (planned.kind !== 'steer') throw new Error('expected a steer')
  const ledger = addPending(EMPTY_LEDGER, 'tu1', planned.plan, 1)
  expect(slotsUsed(ledger)).toBe(1)
  expect(slotsUsed(dropPending(ledger, 'tu1'))).toBe(0)
})

test('paused Build queues new implementers and says why', () => {
  const decision = decide({ ...EMPTY_LEDGER, isPaused: true })
  expect(decision).toMatchObject({ kind: 'deny', isQueued: true })
  expect(decision.kind === 'deny' && decision.reason).toContain('Build is paused')
})

test('a retry of a ticket gets a new name while the old one is in the ledger', () => {
  expect(agentName(ref(44), 'Ledger lines', new Set(['craftory-44-ledger-lines']))).toBe(
    'craftory-44-ledger-lines-2',
  )
  expect(agentName(ref(44), 'Ledger lines', new Set())).toBe('craftory-44-ledger-lines')
})

test('splitArgv keeps quoted words whole and gives null for an empty command', () => {
  expect(splitArgv('npm run "my script" --flag')).toEqual(['npm', 'run', 'my script', '--flag'])
  expect(splitArgv('   ')).toBeNull()
})

test('the queue never exceeds maxParallel over a random spawn and finish sequence', () => {
  let seed = 7
  const random = () => {
    seed = (seed * 48271) % 2147483647
    return seed / 2147483647
  }
  for (const maxParallel of [1, 2, 3]) {
    const config = { ...DEFAULT_CONFIG, worktrees: { ...DEFAULT_CONFIG.worktrees, maxParallel } }
    let ledger = EMPTY_LEDGER
    let steered = 0
    for (let step = 0; step < 400; step++) {
      const live = Object.values(ledger.runs).filter(r => r.status === 'running')
      if (live.length > 0 && random() < 0.4) {
        const victim = live[Math.floor(random() * live.length)]!
        ledger = finishRun(ledger, victim.agentId, 'answer', step).ledger
      } else {
        const n = [44, 45, 48][Math.floor(random() * 3)]!
        const toolUseId = `tu-${step}`
        const decision = decide(ledger, { toolUseId, description: `Implement #${n}` }, config)
        if (decision.kind === 'steer') {
          steered++
          ledger = seated(
            addPending(ledger, toolUseId, decision.plan, step),
            toolUseId,
            agent(step),
            80_000,
            step,
          )
        } else if (decision.kind === 'deny' && decision.isQueued) {
          ledger = addQueued(ledger, decision.ticket)
        }
      }
      expect(slotsUsed(ledger)).toBeLessThanOrEqual(maxParallel)
    }
    expect(steered).toBeGreaterThan(maxParallel)
  }
})

test('fresh tokens are input, cache creation and output, never cache reads', () => {
  expect(
    freshTokens({ input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 25 }),
  ).toBe(175)
})

test('budget states change at 80% and 100% exactly', () => {
  expect(budgetState(63_999, 80_000)).toBe('ok')
  expect(budgetState(64_000, 80_000)).toBe('near')
  expect(budgetState(79_999, 80_000)).toBe('near')
  expect(budgetState(80_000, 80_000)).toBe('over')
})

test('each threshold is crossed once, and over marks the run stopping', () => {
  let ledger = withRun(EMPTY_LEDGER, 44)
  const step = (tokens: number) => {
    const r = recordUsage(ledger, agent(44), tokens, 5)
    ledger = r.ledger
    return r.crossed
  }
  expect(step(60_000)).toBeNull()
  expect(step(4_000)).toBe('near')
  expect(step(1_000)).toBeNull()
  expect(step(15_000)).toBe('over')
  expect(step(500)).toBeNull()
  expect(ledger.runs[agent(44)]).toMatchObject({
    tokens: 80_500,
    budgetState: 'over',
    stop: { cause: 'budget', isDelivered: false },
  })
})

test('one step can jump straight from ok to over, crossing only over', () => {
  const ledger = withRun(EMPTY_LEDGER, 44)
  expect(recordUsage(ledger, agent(44), 90_000, 5).crossed).toBe('over')
})

test('the TDD step is read from the agent text only when it says it', () => {
  expect(tddStepOf('Now red · test 4 of 5: the ledger test fails')).toBe('red · test 4 of 5')
  expect(tddStepOf('Green, test 2 of 4 passes')).toBe('green · test 2 of 4')
  expect(tddStepOf('Refactor: pulling the tax helper out')).toBe('refactor')
  expect(tddStepOf('I read the ledger module and found the totals code.')).toBeNull()
  expect(tddStepOf('')).toBeNull()
})

test('finishing maps the reason and the stopping flag to a status, and a record', () => {
  const base = withRun(EMPTY_LEDGER, 44)
  expect(finishRun(base, agent(44), 'answer', 9).run?.status).toBe('done')
  expect(finishRun(base, agent(44), 'error', 9).run?.status).toBe('failed')
  expect(finishRun(base, agent(44), 'aborted', 9).run?.status).toBe('stopped')
  const crossed = recordUsage(base, agent(44), 90_000, 5).ledger
  const ownAnswer = finishRun(crossed, agent(44), 'answer', 9)
  expect(ownAnswer.run?.status).toBe('done')
  expect(recordOf(ownAnswer.run!)).toMatchObject({ outcome: 'done', tokens: 90_000 })
  const hardStopped = finishRun(deliverStop(crossed, agent(44)), agent(44), 'answer', 9)
  expect(hardStopped.run?.status).toBe('stopped')
  expect(recordOf(hardStopped.run!)).toMatchObject({ outcome: 'over-budget', tokens: 90_000 })
  expect(finishRun(crossed, agent(44), 'aborted', 9).run?.status).toBe('stopped')
  expect(finishRun(hardStopped.ledger, agent(44), 'answer', 10).run).toBeNull()
})

const record = (n: number, outcome: AgentRecord['outcome']): AgentRecord => ({
  ticket: ref(n),
  name: `craftory-${n}`,
  branch: `craftory/${n}-x`,
  worktree: `.worktrees/${n}-x`,
  tokens: 1,
  budget: 80_000,
  outcome,
  startedAt: '2026-10-24T10:00:00.000Z',
})

test('the cleanup plan removes merged worktrees and keeps failed, over-budget and running ones', () => {
  const records = [
    record(43, 'done'),
    record(44, 'running'),
    record(45, 'over-budget'),
    record(46, 'failed'),
    record(48, 'done'),
  ]
  const plan = cleanupPlan({
    records,
    merged: new Set(['#43']),
    config: DEFAULT_CONFIG,
    running: new Set(['.worktrees/44-x']),
  })
  expect(plan.remove).toEqual(['.worktrees/43-x'])
  expect(plan.keep).toEqual([
    { path: '.worktrees/44-x', why: 'running' },
    { path: '.worktrees/45-x', why: 'over-budget' },
    { path: '.worktrees/46-x', why: 'failed' },
    { path: '.worktrees/48-x', why: 'unmerged' },
  ])
  const off = cleanupPlan({
    records,
    merged: new Set(['#43']),
    config: {
      ...DEFAULT_CONFIG,
      worktrees: { ...DEFAULT_CONFIG.worktrees, removeAfterMerge: false, keepFailed: false },
    },
    running: new Set(),
  })
  expect(off.remove).toEqual(['.worktrees/45-x', '.worktrees/46-x'])
})

const checkout = (path: string, over: Partial<Worktree> = {}): Worktree => ({
  path,
  branch: null,
  role: 'agent',
  ticket: null,
  ahead: 0,
  behind: 0,
  added: 0,
  deleted: 0,
  commits: 0,
  lastCommitAt: null,
  isRebasing: false,
  ...over,
})

test('only running agents behind the integration branch are told to merge the new tip', () => {
  let ledger = withRun(EMPTY_LEDGER, 44)
  ledger = withRun(ledger, 45)
  const notices = moveNotices(
    ledger,
    [
      checkout('/repo/.worktrees/44-ledger-lines-include-tax', { behind: 2 }),
      checkout('/repo/.worktrees/45-filter-export-by-date-range', { behind: 0 }),
    ],
    'feat/csv',
  )
  expect(notices).toHaveLength(1)
  expect(notices[0]).toMatchObject({ agentId: 'agent-44' })
  expect(notices[0]!.text).toContain('feat/csv moved and your branch is 2 commits behind it')
})

test('the rows show what the user sees: status, bar numbers, TDD step and worktree facts', () => {
  let ledger = withRun(EMPTY_LEDGER, 44)
  ledger = {
    ...ledger,
    runs: {
      ...ledger.runs,
      [agent(44)]: {
        ...ledger.runs[agent(44)]!,
        tokens: 31_400,
        tddStep: 'red · test 4 of 5',
      },
    },
  }
  const rows = agentRows({
    tickets: TICKETS,
    ledger: addQueued(ledger, ref(45)),
    records: { '#43': { ...record(43, 'done'), tokens: 48_200 } },
    worktrees: [
      checkout('/repo/.worktrees/44-ledger-lines-include-tax', {
        added: 142,
        deleted: 18,
        commits: 3,
        behind: 1,
      }),
    ],
    config: DEFAULT_CONFIG,
    integrationBranch: 'feat/csv',
    now: 242_000,
  })
  expect(rows.map(r => [r.ref, r.status])).toEqual([
    ['#43', 'merged'],
    ['#44', 'running'],
    ['#45', 'queued'],
    ['#46', 'queued'],
    ['#47', 'needs-you'],
    ['#48', 'queued'],
  ])
  expect(rows[1]).toMatchObject({
    step: 'red · test 4 of 5',
    tokens: 31_400,
    worktree: '.worktrees/44-ledger-lines-include-tax',
    branch: 'craftory/44-ledger-lines-include-tax',
    added: 142,
    deleted: 18,
    commits: '3 commits · 1 behind',
  })
  expect(rows[0]!.note).toBe('merged into feat/csv · worktree removed')
  expect(rows[2]!.note).toBe('waits for a free slot')
  expect(rows[3]!.note).toBe('waits for #44')
  expect(rows[4]!.note).toBe('ready-for-human · not for agents')
  expect(rows[5]!.note).toBe('ready to start')
  expect(agentSummary(rows)).toBe('1 running · 1 merged · 3 queued · 1 for you')
})

test('a row reads near and over from the live budget, and a stored over-budget survives a restart', () => {
  const base = withRun(EMPTY_LEDGER, 44)
  const rowsAt = (tokens: number) =>
    agentRows({
      tickets: TICKETS,
      ledger: recordUsage(base, agent(44), tokens, 3).ledger,
      records: {},
      worktrees: [],
      config: DEFAULT_CONFIG,
      integrationBranch: 'feat/csv',
      now: 3,
    }).find(r => r.ref === '#44')!
  expect(rowsAt(63_999).status).toBe('running')
  expect(rowsAt(64_000).status).toBe('near')
  expect(rowsAt(80_000).status).toBe('over')
  const stored = agentRows({
    tickets: TICKETS,
    ledger: EMPTY_LEDGER,
    records: { '#44': { ...record(44, 'over-budget'), tokens: 80_000 } },
    worktrees: [],
    config: DEFAULT_CONFIG,
    integrationBranch: 'feat/csv',
    now: 3,
  }).find(r => r.ref === '#44')!
  expect(stored).toMatchObject({ status: 'over', note: null })
  const raised = agentRows({
    tickets: TICKETS,
    ledger: EMPTY_LEDGER,
    records: { '#44': { ...record(44, 'over-budget'), tokens: 80_000, budget: 160_000 } },
    worktrees: [],
    config: DEFAULT_CONFIG,
    integrationBranch: 'feat/csv',
    now: 3,
  }).find(r => r.ref === '#44')!
  expect(raised).toMatchObject({
    status: 'stopped',
    note: 'budget raised to 160k · run it again to continue',
  })
})

test('time reads as minutes and seconds, and a dash before an agent starts', () => {
  expect(elapsedText(241_000)).toBe('4m 01s')
  expect(elapsedText(null)).toBe('—')
})
