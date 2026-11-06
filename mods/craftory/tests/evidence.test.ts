import { expect, test } from 'claude-code/testing'
import { DEFAULT_LABELS } from '../src/agents-md'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow, ticketsLine, type Flow } from '../src/evidence'
import { SKILLS } from '../src/phases'
import { TRACKERS, type ReadContext, type ReadResult } from '../src/tracker'
import { applySubIssues, parseIssueList } from '../src/tracker/github'
import type {
  CraftoryConfig,
  Feature,
  FeatureRecord,
  IssueRef,
  PhaseId,
  PhaseMark,
  Running,
  TrackerSnapshot,
} from '../types'

type Stub = {
  n: number
  title: string
  spec?: true
  parent?: number
  blockedBy?: number[]
  done?: true
  role?: string
}

const SPEC_BODY =
  '## Problem Statement\n\nx\n\n## User Stories\n\n1. As an a, I want b, so that c\n'

const ctx: ReadContext = { config: DEFAULT_CONFIG, labels: DEFAULT_LABELS, now: 5 }

/**
 * The stubs as `.scratch/csv/` files read by the real Local reader, with the refs it makes
 * (`csv`, `csv/01`) renamed to the stubs' numbers so a scenario reads the same on either tracker.
 */
const localSnapshot = (stubs: Stub[]): TrackerSnapshot => {
  const specStub = stubs.find(s => s.spec)
  const tickets = stubs.filter(s => !s.spec)
  const nn = (stub: Stub) => String(tickets.indexOf(stub) + 1).padStart(2, '0')
  const file = (title: string, status: string, blockedBy: string[] = []) =>
    `# ${title}\n\nStatus: ${status}\n${blockedBy.length ? `Blocked by: ${blockedBy.join(', ')}\n` : ''}`
  const status = (s: Stub) => (s.done ? 'done' : (s.role ?? 'ready-for-agent'))
  const ticketFiles = tickets.map(t => `${nn(t)}-t.md`)
  const results: ReadResult[] = [
    { kind: 'list', entries: [{ name: 'csv', kind: 'dir', mtimeMs: 1 }] },
    {
      kind: 'list',
      entries: specStub ? [{ name: 'spec.md', kind: 'file', mtimeMs: 1 }] : [],
    },
    {
      kind: 'list',
      entries: ticketFiles.map(name => ({ name, kind: 'file' as const, mtimeMs: 1 })),
    },
    ...(specStub
      ? [
          {
            kind: 'read',
            text: `${file(specStub.title, status(specStub))}\n${SPEC_BODY}`,
          } as ReadResult,
        ]
      : []),
    ...tickets.map((t): ReadResult => ({
      kind: 'read',
      text: file(
        t.title,
        status(t),
        (t.blockedBy ?? []).map(b => nn(stubs.find(s => s.n === b)!)),
      ),
    })),
  ]
  const snapshot = TRACKERS.local!.parse(ctx, results)
  if (!snapshot.rich) return snapshot
  const rename = (ref: IssueRef): IssueRef => {
    if (ref === 'csv') return `#${specStub!.n}` as IssueRef
    const stub = tickets.find(t => `csv/${nn(t)}` === ref)!
    return `#${stub.n}` as IssueRef
  }
  return {
    ...snapshot,
    issues: snapshot.issues.map(i => ({
      ...i,
      ref: rename(i.ref),
      parent: i.parent === null ? null : rename(i.parent),
      blockedBy: i.blockedBy.map(rename),
    })),
  }
}

const githubSnapshot = (stubs: Stub[]): TrackerSnapshot => {
  const rows = stubs.map(s => ({
    number: s.n,
    title: s.title,
    body: s.spec ? SPEC_BODY : '',
    labels: [{ name: s.role ?? 'ready-for-agent' }],
    state: s.done ? 'CLOSED' : 'OPEN',
    stateReason: s.done ? 'COMPLETED' : null,
    createdAt: '2026-10-24T10:00:00Z',
    url: `https://github.com/acme/app/issues/${s.n}`,
  }))
  const parsed = parseIssueList(JSON.stringify(rows), DEFAULT_LABELS, 'spec', 'ticket')
  if (!Array.isArray(parsed)) throw new Error(parsed.problem)
  let issues = parsed
  for (const spec of stubs.filter(s => s.spec)) {
    const kids = stubs.filter(s => s.parent === spec.n).map(s => ({ number: s.n }))
    issues = applySubIssues(issues, `#${spec.n}` as IssueRef, JSON.stringify(kids))
  }
  issues = issues.map(i => {
    const stub = stubs.find(s => `#${s.n}` === i.ref)!
    return { ...i, blockedBy: (stub.blockedBy ?? []).map(n => `#${n}` as IssueRef) }
  })
  return { kind: 'github', rich: true, issues, pr: null, at: 5, problem: null }
}

const TRACKERS_UNDER_TEST = { local: localSnapshot, github: githubSnapshot } as const

const record = (over: Partial<FeatureRecord> = {}): FeatureRecord => ({
  version: 1,
  spec: '#42' as IssueRef,
  origin: 'spec',
  title: 'Export invoices as CSV',
  entry: 'align',
  enteredFrom: null,
  skips: {},
  integrationBranch: 'feat/csv',
  pr: null,
  marks: {},
  agents: {},
  ...over,
})

const specced = (over?: Partial<FeatureRecord>): Feature => ({
  kind: 'specced',
  key: 'spec:#42',
  record: record(over),
})

const draft = (marks: Partial<Record<PhaseId, PhaseMark>> = {}): Feature => ({
  kind: 'draft',
  key: 'draft:d1',
  draft: {
    draftId: 'd1',
    title: 'CSV export',
    entry: 'align',
    enteredFrom: null,
    marks,
    startedAt: '2026-10-24T09:00:00Z',
  },
})

const AT = '2026-10-24T10:00:00Z'
const ran = (...phases: PhaseId[]): Partial<Record<PhaseId, PhaseMark>> =>
  Object.fromEntries(phases.map(p => [p, { ranAt: AT }]))

const SPEC: Stub = { n: 42, title: 'Export invoices as CSV', spec: true }
const TICKETS: Stub[] = [
  { n: 43, title: 'Export button', parent: 42 },
  { n: 44, title: 'Ledger tax', parent: 42, blockedBy: [43] },
  { n: 45, title: 'Date filter', parent: 42, blockedBy: [43] },
]

const flowOf = (args: {
  feature: Feature
  issues?: Stub[]
  tracker?: 'local' | 'github'
  config?: CraftoryConfig
  running?: Partial<Running> | null
}): Flow => {
  const { feature, issues, tracker = 'local', config = DEFAULT_CONFIG, running } = args
  return deriveFlow({
    feature,
    config,
    tracker: issues ? TRACKERS_UNDER_TEST[tracker](issues) : null,
    running: running
      ? {
          phase: null,
          entry: null,
          skill: SKILLS.toSpec,
          args: '',
          feature: feature.key,
          startedAt: 1,
          isAwaitingUser: false,
          progress: null,
          ...running,
        }
      : null,
  })
}

const kinds = (flow: Flow) => flow.phases.map(s => s.state.kind)

const withConfig = (patch: (c: CraftoryConfig) => void): CraftoryConfig => {
  const config = structuredClone(DEFAULT_CONFIG)
  patch(config)
  return config
}

for (const tracker of ['local', 'github'] as const) {
  const run = (args: Parameters<typeof flowOf>[0]) => flowOf({ tracker, ...args })

  test(`${tracker}: a new draft suggests Align and gates what the gates guard`, () => {
    expect(kinds(run({ feature: draft() }))).toEqual([
      'next',
      'gated',
      'gated',
      'todo',
      'gated',
      'gated',
      'todo',
    ])
  })

  test(`${tracker}: Align is done once a later phase started, and the running Spec gates Tickets`, () => {
    const flow = run({
      feature: draft(ran('align', 'spec')),
      running: { phase: 'spec' },
    })
    expect(kinds(flow)).toEqual(['done', 'running', 'gated', 'todo', 'gated', 'gated', 'todo'])
    const tickets = flow.phases[2]!
    expect(tickets.state).toEqual({
      kind: 'gated',
      by: 'spec',
      blockers: ['Spec is still running'],
    })
    expect(flow.current).toBe('spec')
  })

  test(`${tracker}: a published spec is Spec done and Tickets is up next`, () => {
    const flow = run({ feature: specced({ marks: ran('align', 'spec') }), issues: [SPEC] })
    expect(kinds(flow)).toEqual(['done', 'done', 'next', 'todo', 'gated', 'gated', 'todo'])
    expect(flow.next).toBe('tickets')
    expect(flow.phases[1]!.state).toMatchObject({ kind: 'done' })
    expect(flow.phases[1]!.artifact).not.toBeNull()
    expect(flow.title).toBe('Export invoices as CSV')
  })

  test(`${tracker}: tickets with blocking edges finish Tickets and make Build next`, () => {
    const flow = run({
      feature: specced({ marks: ran('align', 'spec', 'tickets') }),
      issues: [SPEC, ...TICKETS],
    })
    expect(kinds(flow)).toEqual(['done', 'done', 'done', 'next', 'gated', 'gated', 'todo'])
    expect(flow.phases[2]!.artifact).toBe('#43 to #45 · 1 ready, 2 blocked')
    expect(flow.phases[3]!.args).toBe('#42')
    expect(flow.tickets.map(t => [t.issue.ref, t.status])).toEqual([
      ['#43', 'ready'],
      ['#44', 'blocked'],
      ['#45', 'blocked'],
    ])
  })

  test(`${tracker}: several tickets with no edges at all are not a finished breakdown`, () => {
    const flow = run({
      feature: specced(),
      issues: [SPEC, { n: 43, title: 'A', parent: 42 }, { n: 44, title: 'B', parent: 42 }],
    })
    expect(flow.phases[2]!.state.kind).toBe('next')
    expect(flow.phases[2]!.blockers).toEqual(['the tickets have no blocking edges'])
  })

  test(`${tracker}: a single ticket needs no edge, a merged blocker unblocks`, () => {
    const one = run({ feature: specced(), issues: [SPEC, { n: 43, title: 'A', parent: 42 }] })
    expect(one.phases[2]!.state.kind).toBe('done')
    const flow = run({
      feature: specced(),
      issues: [SPEC, { ...TICKETS[0]!, done: true }, TICKETS[1]!],
    })
    expect(flow.tickets.map(t => t.status)).toEqual(['merged', 'ready'])
  })

  test(`${tracker}: a feature entered from triage skips what came before and starts at its entry`, () => {
    const flow = run({
      feature: specced({ entry: 'build', enteredFrom: '#41' as IssueRef }),
      issues: [SPEC],
    })
    expect(flow.phases.slice(0, 3).map(s => s.state)).toEqual([
      { kind: 'skipped', why: 'entry' },
      { kind: 'skipped', why: 'entry' },
      { kind: 'skipped', why: 'entry' },
    ])
    expect(flow.phases[3]!.state.kind).toBe('next')
    expect(flow.enabledCount).toBe(4)
  })
}

test('an issue that entered at Build is its own ticket and runs with /implement; a spec that entered there is not', () => {
  const bug: Stub = { n: 54, title: 'Fix the total' }
  const own = flowOf({
    feature: specced({
      spec: '#54' as IssueRef,
      origin: 'issue',
      entry: 'build',
      enteredFrom: '#54' as IssueRef,
    }),
    issues: [bug],
  })
  expect(own.tickets.map(t => t.issue.ref)).toEqual(['#54'])
  expect(own.phases[3]!.command).toBe('implement')
  const spec = flowOf({
    feature: specced({
      spec: '#42' as IssueRef,
      origin: 'spec',
      entry: 'build',
      enteredFrom: '#42' as IssueRef,
    }),
    issues: [SPEC],
  })
  expect(spec.tickets).toEqual([])
  expect(spec.phases[3]!.command).toBe('implement-spec')
})

test('skipped beats done, and says why: off in Settings, skipped for the feature, before the entry', () => {
  const config = withConfig(c => {
    c.phases.retro.enabled = false
  })
  const flow = flowOf({
    feature: specced({ skips: { review: { skippedAt: AT } }, marks: ran('align', 'spec') }),
    issues: [SPEC],
    config,
  })
  expect(flow.phases[4]!.state).toEqual({ kind: 'skipped', why: 'feature' })
  expect(flow.phases[6]!.state).toEqual({ kind: 'skipped', why: 'off' })
  const markedAndSkipped = flowOf({
    feature: specced({
      skips: { align: { skippedAt: AT } },
      marks: { align: { markedDoneAt: AT } },
    }),
  })
  expect(markedAndSkipped.phases[0]!.state).toEqual({ kind: 'skipped', why: 'feature' })
})

test('a skipped predecessor hands its gate to the one before it, and the gate of a skipped first phase vanishes', () => {
  const flow = flowOf({ feature: specced({ skips: { align: { skippedAt: AT } } }) })
  expect(kinds(flow).slice(0, 3)).toEqual(['skipped', 'done', 'next'])
  const noSpecGate = flowOf({
    feature: draft(ran('align')),
    config: withConfig(c => {
      c.phases.spec.gate = false
    }),
  })
  expect(noSpecGate.phases[2]!.state.kind).toBe('todo')
})

test('Align is also done when the user marks it done, and its artifacts become the card line', () => {
  const flow = flowOf({
    feature: draft({
      align: { markedDoneAt: AT, artifacts: ['GLOSSARY.md (+3 terms)', 'docs/adr/0007.md'] },
    }),
  })
  expect(flow.phases[0]!.state).toMatchObject({ kind: 'done' })
  expect(flow.phases[0]!.artifact).toBe('GLOSSARY.md (+3 terms) · docs/adr/0007.md')
  expect(flow.phases[1]!.state.kind).toBe('next')
})

test('a grill that ran but has not ended is not done, and its blocker says so', () => {
  const flow = flowOf({ feature: draft(ran('align')) })
  expect(flow.phases[0]!.state.kind).toBe('next')
  expect(flow.phases[0]!.blockers).toEqual(['the grill has not ended'])
})

test('a grill that ran does not gate Spec, one that never ran does, and every other phase waits for done', () => {
  const ranOnly = flowOf({ feature: draft(ran('align')) })
  expect(ranOnly.phases[1]!.state.kind).not.toBe('gated')
  const never = flowOf({ feature: draft() })
  expect(never.phases[1]!.state).toMatchObject({ kind: 'gated', by: 'align' })
  const specOnly = flowOf({ feature: specced({ marks: ran('align') }), issues: [SPEC] })
  expect(specOnly.phases[2]!.state.kind).not.toBe('gated')
  const ticketsRan = flowOf({
    feature: specced({ marks: ran('align', 'spec') }),
    issues: [SPEC],
    config: {
      ...DEFAULT_CONFIG,
      phases: {
        ...DEFAULT_CONFIG.phases,
        tickets: { ...DEFAULT_CONFIG.phases.tickets, gate: true },
      },
    },
  })
  expect(ticketsRan.phases[3]!.state).toMatchObject({ kind: 'gated', by: 'tickets' })
})

test('a running skill shows its progress and wins over done evidence; waiting on the user is needs-you', () => {
  const running = flowOf({
    feature: specced({ marks: ran('align', 'spec') }),
    issues: [SPEC],
    running: { phase: 'spec', progress: '2/5' },
  })
  expect(running.phases[1]!.state).toEqual({ kind: 'running', progress: '2/5' })
  const waiting = flowOf({
    feature: draft(ran('align')),
    running: { phase: 'align', isAwaitingUser: true, progress: 'Q6 of ~14' },
  })
  expect(waiting.phases[0]!.state).toEqual({ kind: 'needs-you', meta: 'Q6 of ~14' })
  expect(waiting.current).toBe('align')
  const bare = flowOf({
    feature: draft(ran('align')),
    running: { phase: 'align', isAwaitingUser: true },
  })
  expect(bare.phases[0]!.state).toEqual({ kind: 'needs-you', meta: 'waiting on you' })
})

test('a skill that belongs to another feature does not light this one', () => {
  const flow = flowOf({
    feature: draft(),
    running: { phase: 'align', feature: 'spec:#7' },
  })
  expect(flow.current).toBeNull()
})

test('suggestNext off leaves every undone phase todo, and gates still apply', () => {
  const flow = flowOf({
    feature: draft(),
    config: withConfig(c => {
      c.automation.suggestNext = false
    }),
  })
  expect(flow.next).toBeNull()
  expect(kinds(flow)).toEqual(['todo', 'gated', 'gated', 'todo', 'gated', 'gated', 'todo'])
})

test('a gate is a refusal to guess: it names the blockers of the phase before', () => {
  const flow = flowOf({ feature: draft() })
  expect(flow.phases[1]!.state).toEqual({ kind: 'gated', by: 'align', blockers: ['not run yet'] })
})

test('counts: done of enabled', () => {
  const flow = flowOf({
    feature: specced({ marks: ran('align', 'spec') }),
    issues: [SPEC],
    config: withConfig(c => {
      c.phases.retro.enabled = false
    }),
  })
  expect([flow.doneCount, flow.enabledCount]).toEqual([2, 6])
})

test('the card line for tickets counts what each is waiting on', () => {
  const flow = flowOf({
    feature: specced(),
    issues: [
      SPEC,
      { n: 43, title: 'A', parent: 42, done: true },
      { n: 44, title: 'B', parent: 42, blockedBy: [43] },
      { n: 46, title: 'C', parent: 42, blockedBy: [44] },
      { n: 47, title: 'D', parent: 42, role: 'ready-for-human' },
    ],
  })
  expect(ticketsLine(flow.tickets)).toBe('#43 to #47 · 1 merged, 1 ready, 1 blocked, 1 for you')
})
