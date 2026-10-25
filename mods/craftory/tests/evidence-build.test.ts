import { expect, test } from 'claude-code/testing'
import { EMPTY_LEDGER } from '../src/build'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow, type Flow } from '../src/evidence'
import { SKILLS } from '../src/phases'
import type {
  AgentRecord,
  BuildLedger,
  Feature,
  FeatureRecord,
  Issue,
  IssueRef,
  PhaseId,
  PhaseMark,
  PullRequest,
  Running,
  TrackerSnapshot,
} from '../types'

const ref = (n: number) => `#${n}` as IssueRef

const issue = (n: number, over: Partial<Issue> = {}): Issue => ({
  ref: ref(n),
  title: `Ticket ${n}`,
  kind: n === 42 ? 'spec' : 'ticket',
  status: 'open',
  role: 'ready-for-agent',
  parent: n === 42 ? null : ref(42),
  blockedBy: [],
  isBug: false,
  createdAt: null,
  location: `docs/issues/${n}.md`,
  ...over,
})

const merged = (n: number) => issue(n, { status: 'done' })

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  ref: ref(60),
  url: 'https://github.com/acme/app/pull/60',
  branch: 'feat/csv',
  base: 'main',
  isDraft: true,
  state: 'open',
  ...over,
})

const tracker = (issues: Issue[], pull: PullRequest | null = null): TrackerSnapshot => ({
  kind: 'github',
  rich: true,
  issues: [issue(42), ...issues],
  pr: pull,
  at: 5,
  problem: null,
})

const AT = (minute: number) => `2026-10-24T10:${String(minute).padStart(2, '0')}:00.000Z`

const agent = (n: number, over: Partial<AgentRecord> = {}): AgentRecord => ({
  ticket: ref(n),
  name: `craftory-${n}`,
  branch: `craftory/${n}-x`,
  worktree: `.worktrees/${n}-x`,
  tokens: 10_000,
  budget: 80_000,
  outcome: 'done',
  startedAt: AT(1),
  endedAt: AT(10),
  ...over,
})

const feature = (
  marks: Partial<Record<PhaseId, PhaseMark>> = {},
  agents: AgentRecord[] = [],
): Feature => {
  const record: FeatureRecord = {
    version: 1,
    spec: ref(42),
    origin: 'spec',
    title: 'Export invoices as CSV',
    entry: 'align',
    enteredFrom: null,
    skips: {},
    integrationBranch: 'feat/csv',
    pr: null,
    marks,
    agents: Object.fromEntries(agents.map(a => [a.ticket, a])),
  }
  return { kind: 'specced', key: 'spec:#42', record }
}

const flowOf = (args: {
  feature: Feature
  tracker: TrackerSnapshot
  running?: Partial<Running>
  build?: BuildLedger
}): Flow =>
  deriveFlow({
    feature: args.feature,
    config: DEFAULT_CONFIG,
    tracker: args.tracker,
    build: args.build ?? null,
    running: args.running
      ? {
          phase: null,
          entry: null,
          skill: SKILLS.implementSpec,
          args: '',
          feature: 'spec:#42',
          startedAt: 1,
          isAwaitingUser: false,
          progress: null,
          ...args.running,
        }
      : null,
  })

const step = (flow: Flow, phase: PhaseId) => flow.steps.find(s => s.phase === phase)!

const EARLIER = {
  align: { ranAt: AT(0) },
  spec: { ranAt: AT(0) },
  tickets: { ranAt: AT(0) },
}
const BLOCKED = issue(44, { blockedBy: [ref(43)] })

test('Build is done when every agent ticket is merged, and a ticket for a human does not count', () => {
  const open = flowOf({ feature: feature(EARLIER), tracker: tracker([merged(43), BLOCKED]) })
  expect(step(open, 'build').state.kind).not.toBe('done')
  expect(step(open, 'build').blockers).toEqual(['#44 not merged yet'])
  const done = flowOf({
    feature: feature(EARLIER),
    tracker: tracker([merged(43), merged(44), issue(47, { role: 'ready-for-human' })]),
  })
  expect(step(done, 'build').state).toEqual({ kind: 'done', artifact: 'feat/csv' })
})

test('while Build is open the card names the integration branch it works on', () => {
  const flow = flowOf({ feature: feature(EARLIER), tracker: tracker([issue(43)]) })
  expect(step(flow, 'build').artifact).toBe('feat/csv')
})

test('Build runs with progress from merged tickets, and while agents work after the skill turn ended', () => {
  const t = tracker([merged(43), issue(44), issue(45)])
  const running = flowOf({ feature: feature(EARLIER), tracker: t, running: { phase: 'build' } })
  expect(step(running, 'build').state).toEqual({ kind: 'running', progress: '1/3' })
  expect(running.current).toBe('build')
  const ledger: BuildLedger = {
    ...EMPTY_LEDGER,
    runs: {
      a1: {
        agentId: 'a1' as never,
        ticket: ref(44),
        name: 'n',
        worktree: '.worktrees/44-x',
        branch: 'b',
        tokens: 1,
        budget: 80_000,
        budgetState: 'ok',
        stop: null,
        status: 'running',
        tddStep: null,
        startedAt: 1,
        lastAt: 1,
      },
    },
  }
  const background = flowOf({ feature: feature(EARLIER), tracker: t, build: ledger })
  expect(step(background, 'build').state).toEqual({ kind: 'running', progress: '1/3' })
})

test('an agent that hit its budget makes Build over budget, until its ticket merges', () => {
  const over = agent(44, { outcome: 'over-budget', tokens: 80_000, endedAt: AT(11) })
  const flow = flowOf({
    feature: feature(EARLIER, [over]),
    tracker: tracker([merged(43), issue(44)]),
    running: { phase: 'build' },
  })
  expect(step(flow, 'build').state).toEqual({ kind: 'over-budget', ticket: '#44', budget: 80_000 })
  expect(step(flow, 'review').state).toMatchObject({ kind: 'gated', by: 'build' })
  expect(step(flow, 'review').state).toMatchObject({
    blockers: ['#44 hit its 80k token budget'],
  })
  const raised = flowOf({
    feature: feature(EARLIER, [{ ...over, budget: 160_000 }]),
    tracker: tracker([merged(43), issue(44)]),
  })
  expect(step(raised, 'build').state.kind).not.toBe('over-budget')
  const mergedLater = flowOf({
    feature: feature(EARLIER, [over]),
    tracker: tracker([merged(43), merged(44)]),
  })
  expect(step(mergedLater, 'build').state.kind).toBe('done')
})

test('a failed agent makes Build failed with its ticket in the meta', () => {
  const flow = flowOf({
    feature: feature(EARLIER, [agent(44, { outcome: 'failed' })]),
    tracker: tracker([merged(43), issue(44)]),
  })
  expect(step(flow, 'build').state).toEqual({ kind: 'failed', meta: '#44 failed' })
})

const BUILT = [merged(43), merged(44)]

test('Review needs Build done, code-review run and ended, and no ticket merged after it', () => {
  const marks = (review: PhaseMark) => ({ ...EARLIER, review })
  const reviewed = (m: PhaseMark, agents: AgentRecord[] = [agent(43), agent(44)], issues = BUILT) =>
    step(flowOf({ feature: feature(marks(m), agents), tracker: tracker(issues) }), 'review')
  expect(reviewed({}, [], [merged(43), issue(44)]).blockers).toEqual(['Build is not done'])
  expect(reviewed({}).blockers).toEqual(['code-review has not run on the integration branch'])
  expect(reviewed({ ranAt: AT(20) }).blockers).toEqual(['the review has not finished'])
  expect(reviewed({ ranAt: AT(20), endedAt: AT(5) }).blockers).toEqual([
    'a ticket merged after the last review',
  ])
  expect(reviewed({ ranAt: AT(20), endedAt: AT(30) }).state).toEqual({
    kind: 'done',
    artifact: 'feat/csv',
  })
})

test('a review marked done by the person is done', () => {
  const flow = flowOf({
    feature: feature({ ...EARLIER, review: { markedDoneAt: AT(40) } }),
    tracker: tracker([issue(43)]),
  })
  expect(step(flow, 'review').state.kind).toBe('done')
})

test('Ship is done when the pull request from the integration branch is ready for review', () => {
  const shipOf = (pull: PullRequest | null) =>
    step(flowOf({ feature: feature(EARLIER), tracker: tracker(BUILT, pull) }), 'ship')
  expect(shipOf(null).blockers).toEqual(['no pull request yet'])
  expect(shipOf(pr()).blockers).toEqual(['the pull request is still a draft'])
  expect(shipOf(pr()).artifact).toBe('#60 (draft)')
  expect(shipOf(pr({ isDraft: false })).state).toEqual({
    kind: 'done',
    artifact: 'https://github.com/acme/app/pull/60',
  })
  expect(shipOf(pr({ isDraft: true, state: 'merged' })).state.kind).toBe('done')
  expect(shipOf(pr({ state: 'closed', isDraft: false })).blockers).toEqual([
    'the pull request was closed',
  ])
})

test('Retro is done when retro ran and ended after Ship', () => {
  const retroOf = (retro: PhaseMark, pull: PullRequest | null) =>
    step(
      flowOf({ feature: feature({ ...EARLIER, retro }), tracker: tracker(BUILT, pull) }),
      'retro',
    )
  const ready = pr({ isDraft: false })
  expect(retroOf({ ranAt: AT(50), endedAt: AT(55) }, pr()).blockers).toEqual(['Ship is not done'])
  expect(retroOf({}, ready).blockers).toEqual(['not run yet'])
  expect(retroOf({ ranAt: AT(50) }, ready).blockers).toEqual(['the retro has not finished'])
  expect(retroOf({ ranAt: AT(50), endedAt: AT(55) }, ready).state.kind).toBe('done')
})
