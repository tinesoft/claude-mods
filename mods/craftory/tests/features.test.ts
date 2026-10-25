import { expect, test } from 'claude-code/testing'
import {
  applyChange,
  applyDraftChange,
  bindSpec,
  draftKey,
  enteredRecord,
  featureOf,
  featurePath,
  markOf,
  mergeFeature,
  newDraft,
  parseFeature,
  pickActive,
  promote,
  serialiseFeature,
  specKey,
  type FeatureChange,
} from '../src/features'
import type {
  AgentRecord,
  DraftFeature,
  FeatureRecord,
  GitSnapshot,
  Issue,
  IssueRef,
  TrackerSnapshot,
} from '../types'

const ref = (n: number) => `#${n}` as IssueRef

const base: FeatureRecord = {
  version: 1,
  spec: ref(42),
  origin: 'spec',
  title: 'Export invoices as CSV',
  entry: 'align',
  enteredFrom: null,
  skipped: [],
  integrationBranch: 'feat/export-invoices-as-csv',
  pr: null,
  marks: {},
  agents: {},
}

const agent = (over: Partial<AgentRecord> = {}): AgentRecord => ({
  ticket: ref(44),
  name: 'tdd-44',
  branch: 'craftory/44-x',
  worktree: '.worktrees/44-x',
  tokens: 100,
  budget: 80_000,
  outcome: 'running',
  startedAt: '2026-10-24T10:00:00.000Z',
  ...over,
})

const A: FeatureRecord = {
  ...base,
  marks: {
    align: {
      ranAt: '2026-10-24T09:00:00.000Z',
      endedAt: '2026-10-24T09:30:00.000Z',
      artifacts: ['GLOSSARY.md'],
    },
    spec: { ranAt: '2026-10-24T09:40:00.000Z' },
  },
  skipped: ['retro'],
  agents: { '#44': agent({ tokens: 500 }) },
}
const B: FeatureRecord = {
  ...base,
  entry: 'spec',
  pr: ref(60),
  marks: {
    align: {
      ranAt: '2026-10-24T08:50:00.000Z',
      endedAt: '2026-10-24T09:45:00.000Z',
      artifacts: ['docs/adr/0007.md', 'GLOSSARY.md'],
    },
    spec: { markedDoneAt: '2026-10-24T11:00:00.000Z' },
  },
  skipped: ['ship', 'retro'],
  agents: {
    '#44': agent({ tokens: 900, outcome: 'over-budget', endedAt: '2026-10-24T10:20:00.000Z' }),
    '#45': agent({ ticket: ref(45), tokens: 1 }),
  },
}
const C: FeatureRecord = {
  ...base,
  title: 'Export invoices (CSV)',
  agents: { '#44': agent({ startedAt: '2026-10-24T12:00:00.000Z', tokens: 3 }) },
  marks: { build: { ranAt: '2026-10-24T12:00:00.000Z' } },
}

test('merging two writers gives the same record in either order, and merging again changes nothing', () => {
  for (const [x, y] of [
    [A, B],
    [B, C],
    [A, C],
  ] as const) {
    expect(mergeFeature(x, y)).toEqual(mergeFeature(y, x))
    const merged = mergeFeature(x, y)
    expect(mergeFeature(merged, y)).toEqual(merged)
    expect(mergeFeature(merged, x)).toEqual(merged)
    expect(mergeFeature(merged, merged)).toEqual(merged)
  }
  expect(mergeFeature(null, A)).toEqual(A)
})

test('a merge keeps the earliest start, the latest end, every artifact and the newest attempt', () => {
  const merged = mergeFeature(A, B)
  expect(merged.marks.align).toEqual({
    ranAt: '2026-10-24T08:50:00.000Z',
    endedAt: '2026-10-24T09:45:00.000Z',
    artifacts: ['GLOSSARY.md', 'docs/adr/0007.md'],
  })
  expect(merged.skipped).toEqual(['ship', 'retro'])
  expect(merged.entry).toBe('align')
  expect(merged.pr).toBe('#60')
  expect(merged.agents['#44']).toMatchObject({ tokens: 900, outcome: 'over-budget' })
  expect(Object.keys(merged.agents)).toEqual(['#44', '#45'])
  expect(mergeFeature(B, C).agents['#44']).toMatchObject({ tokens: 3, outcome: 'running' })
})

const CHANGES: FeatureChange[] = [
  { kind: 'ran', phase: 'tickets', at: '2026-10-24T13:00:00.000Z' },
  {
    kind: 'ended',
    phase: 'tickets',
    at: '2026-10-24T13:10:00.000Z',
    artifacts: ['docs/issues/43-a.md'],
  },
  { kind: 'mark-done', phase: 'ship', at: '2026-10-24T14:00:00.000Z' },
  { kind: 'skip', phase: 'review' },
  { kind: 'agent', record: agent({ tokens: 20 }) },
  { kind: 'pr', pr: ref(61) },
]

test('every change is a no-op the second time', () => {
  for (const change of CHANGES) {
    const once = applyChange(B, change)
    expect(applyChange(once, change)).toEqual(once)
  }
})

test('changes record what happened', () => {
  let record = applyChange(base, CHANGES[0]!)
  record = applyChange(record, CHANGES[1]!)
  record = applyChange(record, { kind: 'ran', phase: 'tickets', at: '2026-10-24T15:00:00.000Z' })
  expect(record.marks.tickets).toEqual({
    ranAt: '2026-10-24T13:00:00.000Z',
    endedAt: '2026-10-24T13:10:00.000Z',
    artifacts: ['docs/issues/43-a.md'],
  })
  record = applyChange(applyChange(record, { kind: 'skip', phase: 'ship' }), {
    kind: 'skip',
    phase: 'align',
  })
  expect(record.skipped).toEqual(['align', 'ship'])
  expect(applyChange(record, { kind: 'unskip', phase: 'align' }).skipped).toEqual(['ship'])
  expect(
    applyChange(base, { kind: 'agent', record: agent({ tokens: 5 }) }).agents['#44']?.tokens,
  ).toBe(5)
  expect(
    applyChange(A, { kind: 'agent', record: agent({ tokens: 2 }) }).agents['#44']?.tokens,
  ).toBe(500)
})

test('a record survives writing and reading, and the file text is stable', () => {
  const text = serialiseFeature(B)
  expect(text.endsWith('}\n')).toBe(true)
  const loaded = parseFeature(text)
  expect(loaded.state === 'ok' && loaded.value).toEqual(B)
  expect(serialiseFeature(B)).toBe(text)
  const shuffled = serialiseFeature({
    ...B,
    skipped: ['retro', 'ship'],
    agents: { '#45': B.agents['#45']!, '#44': B.agents['#44']! },
  })
  expect(shuffled).toBe(text)
  expect(Object.keys(JSON.parse(text))).toEqual([
    'version',
    'spec',
    'origin',
    'title',
    'entry',
    'enteredFrom',
    'skipped',
    'integrationBranch',
    'pr',
    'marks',
    'agents',
  ])
})

test('a hand-damaged record loads what it can and names what it dropped', () => {
  const raw = JSON.stringify({
    version: 1,
    spec: '42',
    entry: 'nowhere',
    skipped: ['ship', 'x'],
    marks: { align: { ranAt: 7, endedAt: '2026-10-24T09:30:00.000Z' }, bogus: {} },
    agents: { '#44': { ticket: '#44', tokens: 'many' }, '#45': agent({ ticket: ref(45) }) },
  })
  const loaded = parseFeature(raw)
  if (loaded.state !== 'ok') throw new Error('expected ok')
  expect(loaded.value).toMatchObject({
    spec: '#42',
    entry: 'align',
    skipped: ['ship'],
    marks: { align: { endedAt: '2026-10-24T09:30:00.000Z' } },
  })
  expect(Object.keys(loaded.value.agents)).toEqual(['#45'])
  expect(loaded.problem).toContain('agents.#44')
})

test('text that is not a feature record is invalid', () => {
  expect(parseFeature('{').state).toBe('invalid')
  expect(parseFeature('{"version":2,"spec":"#1"}').state).toBe('invalid')
  expect(parseFeature('{"version":1,"spec":"soon"}').state).toBe('invalid')
})

const spec = (n: number, createdAt: number | null, kind: Issue['kind'] = 'spec'): Issue => ({
  ref: ref(n),
  title: `Spec ${n}`,
  kind,
  status: 'open',
  role: null,
  parent: null,
  blockedBy: [],
  isBug: false,
  createdAt,
  location: `docs/issues/${n}-s.md`,
})
const tracker = (issues: Issue[]): TrackerSnapshot => ({
  kind: 'local',
  rich: true,
  issues,
  pr: null,
  at: 0,
  problem: null,
})

const draft: DraftFeature = applyDraftChange(
  newDraft({
    draftId: 'd1',
    title: 'CSV export',
    entry: 'align',
    enteredFrom: null,
    at: '2026-10-24T09:00:00.000Z',
  }),
  { kind: 'ran', phase: 'spec', at: '2026-10-24T10:00:00.000Z' },
)
const T = Date.parse('2026-10-24T10:00:00.000Z')

test('a draft binds to the first spec made after its Spec ran, never to an older or taken one', () => {
  const issues = [
    spec(30, T - 1000),
    spec(41, T + 5000),
    spec(42, T + 1000),
    spec(43, T + 2000, 'ticket'),
  ]
  expect(bindSpec(draft, tracker(issues), new Set())?.ref).toBe('#42')
  expect(bindSpec(draft, tracker(issues), new Set(['#42']))?.ref).toBe('#41')
  expect(bindSpec(draft, tracker([spec(30, T - 1000)]), new Set())).toBeUndefined()
  expect(bindSpec(draft, tracker([spec(50, null)]), new Set())).toBeUndefined()
  const never = newDraft({
    draftId: 'd2',
    title: 't',
    entry: 'align',
    enteredFrom: null,
    at: '2026-10-24T09:00:00.000Z',
  })
  expect(bindSpec(never, tracker(issues), new Set())).toBeUndefined()
  expect(
    bindSpec(draft, { kind: 'gitlab', rich: false, links: [], note: null, at: 0 }, new Set()),
  ).toBeUndefined()
})

test('promoting a draft carries its marks onto a record for the spec', () => {
  const record = promote(draft, spec(42, T + 1000), 'feat/csv')
  expect(record).toMatchObject({
    spec: '#42',
    title: 'Spec 42',
    integrationBranch: 'feat/csv',
    skipped: [],
    agents: {},
  })
  expect(record.marks).toEqual(draft.marks)
  expect(featurePath(record.spec)).toBe('.craftory/features/42.json')
  expect(featurePath('BILL-9' as IssueRef)).toBe('.craftory/features/BILL-9.json')
})

test('a draft ignores changes that need a spec', () => {
  const same = applyDraftChange(draft, { kind: 'skip', phase: 'ship' })
  expect(same).toEqual(draft)
  expect(applyDraftChange(draft, { kind: 'agent', record: agent() })).toEqual(draft)
})

test('the active feature is the one on this branch, else the last used, else the busiest', () => {
  const features = { '#42': A, '#50': { ...C, spec: ref(50), integrationBranch: 'feat/other' } }
  const drafts = { d1: draft }
  const git = (branch: string | null): GitSnapshot => ({
    root: '/r',
    branch,
    remote: null,
    worktrees: [],
    merged: {},
    tips: {},
    at: 0,
  })
  const pick = (over: Partial<Parameters<typeof pickActive>[0]>) =>
    pickActive({ features, drafts, git: null, lastActive: null, ...over })

  expect(pick({ git: git('feat/other'), lastActive: specKey(ref(42)) })).toBe('spec:#50')
  expect(pick({ lastActive: specKey(ref(50)) })).toBe('spec:#50')
  expect(pick({ lastActive: specKey(ref(99)) })).toBe('spec:#50')
  expect(pick({ features: {} })).toBe(draftKey('d1'))
  expect(pick({ features: {}, drafts: {} })).toBeNull()
  expect(pick({ features: {}, lastActive: draftKey('d1') })).toBe('draft:d1')
})

test('a key resolves to its feature, and marks read the same from either kind', () => {
  const features = { '#42': A }
  const drafts = { d1: draft }
  const specced = featureOf(specKey(ref(42)), features, drafts)
  const drafted = featureOf(draftKey('d1'), features, drafts)
  expect(specced?.kind).toBe('specced')
  expect(drafted?.kind).toBe('draft')
  expect(markOf(specced!, 'align').ranAt).toBe('2026-10-24T09:00:00.000Z')
  expect(markOf(drafted!, 'spec').ranAt).toBe('2026-10-24T10:00:00.000Z')
  expect(markOf(drafted!, 'build')).toEqual({})
  expect(featureOf(null, features, drafts)).toBeNull()
  expect(featureOf(specKey(ref(1)), features, drafts)).toBeNull()
})

test('a committed integration branch that git would read as an option is dropped with a note', () => {
  const loaded = parseFeature(
    JSON.stringify({ version: 1, spec: '42', integrationBranch: '--output=/etc/x' }),
  )
  expect(loaded.state === 'ok' && loaded.value.integrationBranch).toBe('')
  expect(loaded.state === 'ok' && loaded.problem).toContain('integrationBranch')
})

test('a record says whether its spec is a spec or an issue that is its own ticket', () => {
  const issue = serialiseFeature({ ...base, origin: 'issue', entry: 'build', enteredFrom: ref(42) })
  const loaded = parseFeature(issue)
  expect(loaded.state === 'ok' && loaded.value.origin).toBe('issue')
  const old = JSON.stringify({ version: 1, spec: '42', entry: 'build', enteredFrom: '42' })
  const parsed = parseFeature(old)
  expect(parsed.state === 'ok' && parsed.value.origin).toBe('spec')
  expect(mergeFeature({ ...base, origin: 'issue' }, base).origin).toBe('issue')
  expect(mergeFeature(base, { ...base, origin: 'issue' }).origin).toBe('issue')
})

test('entering at Build from an issue makes the issue its own ticket, from a spec does not', () => {
  const enter = (kind: 'spec' | 'issue') =>
    enteredRecord({
      issue: { ref: ref(54), title: 'Fix the total', kind },
      phase: 'build',
      integrationBranch: 'fix/total',
    })
  expect(enter('issue').origin).toBe('issue')
  expect(enter('spec').origin).toBe('spec')
})
