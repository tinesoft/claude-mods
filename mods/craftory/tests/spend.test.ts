import { expect, test } from 'claude-code/testing'
import {
  attribute,
  cacheHit,
  EMPTY_SPEND,
  freshOf,
  observe,
  QUEUE_MAX,
  reading,
  splitDelta,
  spendText,
  tokensText,
  totalOf,
  usdText,
} from '../src/spend'
import type { AgentId, FeatureKey, IssueRef, SpendStep, SpendTarget } from '../types'

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
