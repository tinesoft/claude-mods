import { expect, test } from 'claude-code/testing'
import { isWritable } from '../src/files'
import {
  agentSpendText,
  attribute,
  breakdownOf,
  cacheHit,
  draftOfKey,
  EMPTY_LOCAL,
  EMPTY_SPEND,
  freshOf,
  observe,
  otherRowsOf,
  OUTSIDE_DAYS,
  ownRowsOf,
  parseLocalSpend,
  parseSpendFile,
  phaseSpendText,
  QUEUE_MAX,
  reading,
  rekeyLedger,
  rekeyRows,
  rowsBySpec,
  seedRows,
  serialiseSpendFile,
  sessionRows,
  specOfKey,
  spendPath,
  spendSummaryLine,
  splitDelta,
  spendText,
  tokensText,
  totalOf,
  totalOfRows,
  usdText,
  withinDays,
  withSession,
} from '../src/spend'
import type { AgentId, FeatureKey, IssueRef, SpendRow, SpendStep, SpendTarget } from '../types'

const CSV = 'spec:csv' as FeatureKey
const OTHER = 'spec:other' as FeatureKey
const A1 = 'agent-1' as AgentId
const A2 = 'agent-2' as AgentId
const T1 = 'csv/01' as IssueRef

const main = (phase: SpendTarget['phase'] = 'align', feature: FeatureKey | null = CSV) =>
  ({ feature, phase, ticket: null, agentId: null }) satisfies SpendTarget

const step = (target: SpendTarget, input = 100, over: Partial<SpendStep> = {}): SpendStep => ({
  ...target,
  model: 'claude-opus-5-5',
  tokens: { input, output: 0, cacheRead: 0, cacheWrite: 0 },
  ...over,
})

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9)

test('an implementer step is charged to its ticket under Build, in the Feature of the ticket', () => {
  expect(
    attribute({
      agentId: A1,
      run: { ticket: T1 },
      runFeature: OTHER,
      running: { phase: 'review', feature: CSV },
      active: CSV,
    }),
  ).toEqual({ feature: OTHER, phase: 'build', ticket: T1, agentId: A1 })
})

test('an implementer whose Feature cannot be found is charged to the active one', () => {
  expect(
    attribute({ agentId: A1, run: { ticket: T1 }, runFeature: null, running: null, active: CSV }),
  ).toEqual({ feature: CSV, phase: 'build', ticket: T1, agentId: A1 })
})

test('a main step goes to the running phase, and its Feature over the active one', () => {
  expect(
    attribute({
      agentId: null,
      run: null,
      runFeature: null,
      running: { phase: 'spec', feature: OTHER },
      active: CSV,
    }),
  ).toEqual(main('spec', OTHER))
})

test('a main step with no phase running goes to the active Feature, between phases', () => {
  expect(
    attribute({ agentId: null, run: null, runFeature: null, running: null, active: CSV }),
  ).toEqual(main('between'))
  expect(
    attribute({
      agentId: null,
      run: null,
      runFeature: null,
      running: { phase: null, feature: null },
      active: CSV,
    }),
  ).toEqual(main('between'))
})

test('a subagent that is not an implementer goes where the main session is', () => {
  expect(
    attribute({
      agentId: A2,
      run: null,
      runFeature: null,
      running: { phase: 'review', feature: CSV },
      active: CSV,
    }),
  ).toEqual({ ...main('review'), agentId: A2 })
})

test('with no Feature at all the step is Outside features, with no phase', () => {
  expect(
    attribute({ agentId: null, run: null, runFeature: null, running: null, active: null }),
  ).toEqual(main(null, null))
})

test('one step takes the whole delta', () => {
  expect(splitDelta(0.5, [step(main())])).toEqual([0.5])
  expect(splitDelta(0.5, [])).toEqual([])
})

test('several steps share the delta by fresh tokens, cache reads at a tenth, and the shares sum to it', () => {
  const shares = splitDelta(1, [
    step(main(), 300),
    step(main(), 100),
    step(main(), 0, { tokens: { input: 0, output: 0, cacheRead: 1_000, cacheWrite: 0 } }),
  ])
  near(shares[0]!, 0.6)
  near(shares[1]!, 0.2)
  near(shares[2]!, 0.2)
  near(
    shares.reduce((a, b) => a + b, 0),
    1,
  )
})

test('steps with no tokens share the delta equally', () => {
  const shares = splitDelta(0.3, [step(main(), 0), step(main(), 0), step(main(), 0)])
  shares.forEach(s => near(s, 0.1))
})

test('the first reading sets the baseline and charges nothing', () => {
  const ledger = observe(EMPTY_SPEND, step(main()), 4.2)
  expect(ledger.baseline).toBe(4.2)
  const total = totalOf(ledger, CSV)
  expect(total.usd).toBeNull()
  expect(total.fresh).toBe(100)
})

test('a step after the baseline takes the delta, exact', () => {
  const ledger = observe(reading(EMPTY_SPEND, 1), step(main()), 1.25)
  const total = totalOf(ledger, CSV)
  near(total.usd!, 0.25)
  expect(total.isEstimated).toBe(false)
  expect(ledger.queue).toEqual([])
})

test('a reading that did not move keeps the steps waiting; the next delta is shared over them', () => {
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step({ ...main('build'), ticket: T1, agentId: A1 }, 300), 0)
  ledger = observe(ledger, step({ ...main('build'), agentId: A2 }, 100), 0)
  expect(ledger.queue).toHaveLength(2)
  expect(totalOf(ledger, CSV).fresh).toBe(400)
  expect(totalOf(ledger, CSV).usd).toBeNull()
  ledger = reading(ledger, 2)
  const rows = Object.values(ledger.rows)
  near(rows.find(r => r.agentId === A1)!.usd!, 1.5)
  near(rows.find(r => r.agentId === A2)!.usd!, 0.5)
  expect(rows.every(r => r.isEstimated)).toBe(true)
  const total = totalOf(ledger, CSV)
  near(total.usd!, 2)
  expect(total.isEstimated).toBe(true)
})

test('steps of one row sharing a delta are not estimated', () => {
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step(main()), 0)
  ledger = observe(ledger, step(main()), 0.4)
  const [row] = Object.values(ledger.rows)
  near(row!.usd!, 0.4)
  expect(row!.isEstimated).toBe(false)
  expect(row!.steps).toBe(2)
})

test('steps of different models are different rows', () => {
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step(main()), 0.1)
  ledger = observe(ledger, step(main(), 100, { model: 'claude-haiku-5-5' }), 0.2)
  expect(Object.keys(ledger.rows)).toHaveLength(2)
})

test('where the host keeps no cost ledger, steps are tokens only, never $0', () => {
  let ledger = observe(EMPTY_SPEND, step(main()), undefined)
  ledger = observe(ledger, step(main()), undefined)
  const total = totalOf(ledger, CSV)
  expect(total.usd).toBeNull()
  expect(total.fresh).toBe(200)
  expect(spendText(total)).toBe('200')
})

test('a delta with no step to take it moves the baseline and is not charged', () => {
  const ledger = reading(reading(EMPTY_SPEND, 1), 3)
  expect(ledger.baseline).toBe(3)
  expect(ledger.rows).toEqual({})
})

test('a queue that never gets a price is rolled up unpriced past its limit', () => {
  let ledger = reading(EMPTY_SPEND, 1)
  for (let i = 0; i <= QUEUE_MAX; i++) ledger = observe(ledger, step(main()), 1)
  expect(ledger.queue).toEqual([])
  expect(totalOf(ledger, CSV).fresh).toBe(100 * (QUEUE_MAX + 1))
})

test('a Feature total counts only its own rows; Outside features is its own total', () => {
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step(main()), 1)
  ledger = observe(ledger, step(main(null, null)), 1.5)
  near(totalOf(ledger, CSV).usd!, 1)
  near(totalOf(ledger, null).usd!, 0.5)
  expect(totalOf(ledger, OTHER)).toEqual({
    fresh: 0,
    cacheRead: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    usd: null,
    isEstimated: false,
  })
})

test('fresh tokens are input, cache writes and output; the cache-hit share is of all input', () => {
  const t = { input: 100, output: 50, cacheRead: 300, cacheWrite: 100 }
  expect(freshOf(t)).toBe(250)
  expect(cacheHit(t)).toBe(0.6)
  expect(cacheHit({ input: 0, output: 5, cacheRead: 0, cacheWrite: 0 })).toBeNull()
})

test('dollars show cents under $10 and one decimal above; tokens show k and M', () => {
  expect(usdText(0)).toBe('$0.00')
  expect(usdText(4.123)).toBe('$4.12')
  expect(usdText(12.46)).toBe('$12.5')
  expect(tokensText(850)).toBe('850')
  expect(tokensText(412_300)).toBe('412k')
  expect(tokensText(1_250_000)).toBe('1.3M')
})

test('the short spend prefers dollars, falls back to fresh tokens, and is null with nothing spent', () => {
  const base = { cacheRead: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
  expect(spendText({ ...base, fresh: 412_000, usd: 4.12, isEstimated: false })).toBe('$4.12')
  expect(spendText({ ...base, fresh: 412_000, usd: null, isEstimated: false })).toBe('412k')
  expect(spendText({ ...base, fresh: 0, usd: null, isEstimated: false })).toBeNull()
})

const ctx = { steering: null, docs: { glossary: 'GLOSSARY.md' } } as never

test('spend files live one folder per Feature, one file per session', () => {
  expect(spendPath('csv' as IssueRef, 'a1b2-c3')).toBe('.craftory/spend/csv/a1b2-c3.json')
  expect(spendPath('#42' as IssueRef, 'x.y/z')).toBe('.craftory/spend/42/x-y-z.json')
  expect(specOfKey(CSV)).toBe('csv')
  expect(specOfKey('draft:d1' as FeatureKey)).toBeNull()
  expect(specOfKey(null)).toBeNull()
})

test('Craftory may write a spend file and nothing else under .craftory/spend/', () => {
  expect(isWritable('.craftory/spend/csv/a1b2-c3.json', ctx)).toBe(true)
  for (const path of [
    '.craftory/spend/a1b2.json',
    '.craftory/spend/csv/deep/a1.json',
    '.craftory/spend/csv/../../x.json',
    '.craftory/spend/csv/a1.md',
    '.craftory/spend/.git/a1.json',
    '.craftory/spend/csv/a b.json',
  ])
    expect(isWritable(path, ctx)).toBe(false)
})

test('a file written now keeps the tokens of steps still waiting for a price', () => {
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step(main()), 1)
  ledger = observe(ledger, step(main('build'), 50), 1)
  const rows = sessionRows(ledger)
  expect(rows.map(r => [r.phase, r.tokens.input, r.usd])).toEqual([
    ['align', 100, 1],
    ['build', 50, null],
  ])
  expect(ledger.queue).toHaveLength(1)
})

test('rows are grouped by spec; drafts and Outside features are never committed', () => {
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step(main()), 1)
  ledger = observe(ledger, step(main('align', 'draft:d1' as FeatureKey)), 2)
  ledger = observe(ledger, step(main(null, null)), 3)
  ledger = observe(ledger, step(main('spec', OTHER)), 4)
  const bySpec = rowsBySpec(sessionRows(ledger))
  expect([...bySpec.keys()].sort()).toEqual(['csv', 'other'])
})

const file = (rows: SpendRow[]) => ({
  version: 1 as const,
  session: 's1',
  user: 'dev@example.com',
  startedAt: '2026-11-17T10:00:00.000Z',
  rows,
})

test('a session file round-trips, its rows in a fixed order', () => {
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step(main('spec')), 0.5)
  ledger = observe(ledger, step({ ...main('build'), ticket: T1, agentId: A1 }), 1.5)
  const rows = sessionRows(ledger)
  const text = serialiseSpendFile(file(rows))
  expect(serialiseSpendFile(file([...rows].reverse()))).toBe(text)
  const parsed = parseSpendFile(text)
  expect(parsed.state).toBe('ok')
  if (parsed.state !== 'ok') return
  expect(parsed.value.user).toBe('dev@example.com')
  expect(parsed.value.rows).toHaveLength(2)
  near(totalOf(EMPTY_SPEND, CSV, parsed.value.rows).usd!, 1.5)
})

test('a file that is not JSON or not version 1 is invalid; a bad row is dropped and named', () => {
  expect(parseSpendFile('{').state).toBe('invalid')
  expect(parseSpendFile('{"version":2,"session":"s"}').state).toBe('invalid')
  expect(parseSpendFile('[]').state).toBe('invalid')
  const good = JSON.parse(
    serialiseSpendFile(file(sessionRows(observe(reading(EMPTY_SPEND, 0), step(main()), 1)))),
  )
  const raw = JSON.stringify({
    ...good,
    rows: [...good.rows, { model: 'x' }, { ...good.rows[0], usd: -1 }],
  })
  const parsed = parseSpendFile(raw)
  expect(parsed.state === 'ok' && parsed.value.rows.length).toBe(1)
  expect(parsed.state === 'ok' && parsed.problem).toBe('2 rows dropped')
})

test("a Feature total adds other sessions' rows to this session's", () => {
  const ledger = observe(reading(EMPTY_SPEND, 0), step(main()), 1)
  const theirs = sessionRows(observe(reading(EMPTY_SPEND, 0), step(main('spec'), 300), 2))
  const total = totalOf(ledger, CSV, theirs)
  near(total.usd!, 3)
  expect(total.fresh).toBe(400)
})

test('seeding takes back rows a resumed session wrote, adding to any already held', () => {
  const before = sessionRows(observe(reading(EMPTY_SPEND, 0), step(main()), 1))
  const ledger = seedRows(observe(reading(EMPTY_SPEND, 5), step(main()), 5.5), before)
  const [row] = Object.values(ledger.rows)
  near(row!.usd!, 1.5)
  expect(row!.steps).toBe(2)
  expect(row!.tokens.input).toBe(200)
})

const at = (iso: string) => iso

test('stored spend keeps one entry per session; an empty one is removed', () => {
  const rows = sessionRows(observe(reading(EMPTY_SPEND, 0), step(main()), 1))
  let local = withSession(EMPTY_LOCAL, 's1', rows, at('2026-11-17T10:00:00.000Z'))
  local = withSession(local, 's0', rows, at('2026-11-10T10:00:00.000Z'))
  expect(Object.keys(local.sessions).sort()).toEqual(['s0', 's1'])
  expect(ownRowsOf(local, 's1')).toHaveLength(1)
  expect(otherRowsOf(local, 's1')).toHaveLength(1)
  expect(Object.keys(withSession(local, 's1', [], at('x')).sessions)).toEqual(['s0'])
})

test('stored spend reads leniently: anything unreadable is empty, a bad row is dropped', () => {
  expect(parseLocalSpend(undefined)).toEqual(EMPTY_LOCAL)
  expect(parseLocalSpend({ version: 2, sessions: {} })).toEqual(EMPTY_LOCAL)
  const good = sessionRows(observe(reading(EMPTY_SPEND, 0), step(main()), 1))[0]!
  const parsed = parseLocalSpend({
    version: 1,
    sessions: {
      s1: { lastAt: '2026-11-17T10:00:00.000Z', rows: [good, { model: 'x' }] },
      s2: { rows: [good] },
    },
  })
  expect(Object.keys(parsed.sessions)).toEqual(['s1'])
  expect(parsed.sessions.s1!.rows).toHaveLength(1)
})

test('Outside features keeps the sessions of the last 30 days', () => {
  const rows = sessionRows(observe(reading(EMPTY_SPEND, 0), step(main(null, null)), 1))
  const now = Date.parse('2026-11-17T12:00:00.000Z')
  let local = withSession(EMPTY_LOCAL, 'old', rows, at('2026-10-17T11:59:59.000Z'))
  local = withSession(local, 'edge', rows, at('2026-10-18T12:00:00.000Z'))
  local = withSession(local, 'new', rows, at('2026-11-17T11:00:00.000Z'))
  expect(Object.keys(withinDays(local, now, OUTSIDE_DAYS).sessions).sort()).toEqual(['edge', 'new'])
})

test('a draft’s spend is charged to its spec once it binds, rows and waiting steps alike', () => {
  const DRAFT = 'draft:d1' as FeatureKey
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step(main('align', DRAFT)), 1)
  ledger = observe(ledger, step(main('align', CSV)), 1.5)
  ledger = observe(ledger, step(main('spec', DRAFT)), 1.5)
  const moved = rekeyLedger(ledger, DRAFT, CSV)
  expect(totalOf(moved, DRAFT).fresh).toBe(0)
  const total = totalOf(moved, CSV)
  near(total.usd!, 1.5)
  expect(total.fresh).toBe(300)
  const align = Object.values(moved.rows).find(r => r.phase === 'align')!
  expect(align.steps).toBe(2)
  expect(moved.queue.every(q => q.feature === CSV)).toBe(true)
  expect(draftOfKey(DRAFT)).toBe('d1')
  expect(draftOfKey(CSV)).toBeNull()
  expect(rekeyRows(sessionRows(ledger), DRAFT, CSV).every(r => r.feature === CSV)).toBe(true)
})

test('a breakdown totals a Feature by phase and by ticket, other sessions’ rows included', () => {
  let ledger = reading(EMPTY_SPEND, 0)
  ledger = observe(ledger, step({ ...main('build'), ticket: T1, agentId: A1 }, 300), 0)
  ledger = observe(ledger, step({ ...main('build'), agentId: A2, ticket: 'csv/02' as IssueRef }), 2)
  ledger = observe(ledger, step(main('align')), 2.5)
  const theirs = sessionRows(observe(reading(EMPTY_SPEND, 0), step(main('align')), 1))
  const b = breakdownOf(ledger, CSV, theirs)
  near(b.total.usd!, 3.5)
  near(b.phases.build!.usd!, 2)
  near(b.phases.align!.usd!, 1.5)
  near(b.tickets[T1]!.usd!, 1.5)
  expect(b.tickets[T1]!.isEstimated).toBe(true)
  expect(b.phases.review).toBeUndefined()
})

test('the card’s Spend row reads dollars, fresh tokens and the cache share', () => {
  const total = totalOfRows(
    sessionRows(
      observe(
        reading(EMPTY_SPEND, 0),
        step(main(), 0, { tokens: { input: 100, output: 200, cacheRead: 1_000, cacheWrite: 0 } }),
        2.14,
      ),
    ),
  )
  expect(phaseSpendText(total, true)).toBe('$2.14 · 300 fresh · 91% cache')
  const unpriced = totalOfRows(sessionRows(observe(EMPTY_SPEND, step(main(), 412_000), undefined)))
  expect(phaseSpendText(unpriced, false)).toBe(
    '412k fresh · 0% cache · $ unavailable on this surface',
  )
  expect(phaseSpendText(unpriced, true)).toBe('412k fresh · 0% cache')
  expect(phaseSpendText(totalOfRows([]), true)).toBeNull()
})

test('an agent’s dollars are marked ≈ only when they were shared', () => {
  const alone = totalOf(observe(reading(EMPTY_SPEND, 0), step(main()), 0.42), CSV)
  expect(agentSpendText(alone)).toBe('$0.42')
  expect(agentSpendText({ ...alone, isEstimated: true })).toBe('≈$0.42')
  expect(agentSpendText({ ...alone, usd: null })).toBeNull()
  expect(agentSpendText(undefined)).toBeNull()
})

test('the text reply’s line gives dollars, fresh tokens and how many sessions spent', () => {
  const priced = totalOf(observe(reading(EMPTY_SPEND, 0), step(main(), 318_000), 4.12), CSV)
  expect(spendSummaryLine(priced, 3, true)).toBe(
    'Spend: $4.12 (318k fresh tokens) across 3 sessions',
  )
  expect(spendSummaryLine(priced, 1, true)).toBe(
    'Spend: $4.12 (318k fresh tokens) across 1 session',
  )
  const tokens = totalOf(observe(EMPTY_SPEND, step(main(), 318_000), undefined), CSV)
  expect(spendSummaryLine(tokens, 1, false)).toBe(
    'Spend: 318k fresh tokens across 1 session ($ unavailable on this surface)',
  )
  expect(spendSummaryLine(totalOf(EMPTY_SPEND, CSV), 0, true)).toBeNull()
})
