import { expect, test } from 'claude-code/testing'
import {
  buildForecastOf,
  buildForecastText,
  forecastOf,
  NO_FORECAST_TEXT,
  phaseForecastText,
  samplesOf,
  spreadOf,
} from '../src/forecast'
import { isFinished } from '../src/features'
import type { FeatureRecord, IssueRef, SpendRow } from '../types'

const row = (over: Partial<SpendRow> = {}): SpendRow => ({
  feature: 'spec:old' as SpendRow['feature'],
  phase: 'build',
  ticket: null,
  agentId: null,
  model: 'claude-sonnet-5-5',
  tokens: { input: 1_000, output: 0, cacheRead: 0, cacheWrite: 0 },
  usd: 1,
  isEstimated: false,
  steps: 1,
  ...over,
})

const ticket = (ref: string, usd: number | null, fresh = 1_000) =>
  row({
    ticket: ref as IssueRef,
    usd,
    tokens: { input: fresh, output: 0, cacheRead: 0, cacheWrite: 0 },
  })

for (const [name, samples, median, p90] of [
  ['an odd count', [5, 1, 3], 3, 4.6],
  ['an even count', [4, 1, 3, 2], 2.5, 3.7],
  ['one sample', [7], 7, 7],
] as const) {
  test(`the median and p90 of ${name}`, () => {
    const spread = spreadOf(samples)
    const round = (n: number | undefined) => Math.round((n ?? NaN) * 1e6) / 1e6
    expect([round(spread?.median), round(spread?.p90)]).toEqual([median, p90])
  })
}

test('no samples give no spread', () => {
  expect(spreadOf([])).toBeNull()
})

test('each Build ticket of a finished Feature is one sample, its dollars across every session', () => {
  const samples = samplesOf(
    [
      [ticket('a/01', 1), ticket('a/01', 2), ticket('a/02', 4), row({ phase: 'align', usd: 0.5 })],
      [ticket('b/01', 6)],
    ],
    'usd',
  )
  expect(samples.perTicket).toEqual({ features: 2, values: [3, 4, 6] })
  expect(samples.phases.align).toEqual({ features: 1, values: [0.5] })
  expect(samples.phases.build).toEqual({ features: 2, values: [7, 6] })
})

test('without a cost ledger the samples are fresh tokens', () => {
  const samples = samplesOf(
    [[ticket('a/01', null, 400_000)], [ticket('b/01', null, 200_000)]],
    'tokens',
  )
  expect(samples.perTicket.values).toEqual([400_000, 200_000])
})

test('a ticket never priced gives no dollar sample', () => {
  const samples = samplesOf([[ticket('a/01', null), ticket('a/02', 2)]], 'usd')
  expect(samples.perTicket.values).toEqual([2])
})

test('fewer than 2 finished Features give no forecast; 2 give one', () => {
  const one = forecastOf(samplesOf([[ticket('a/01', 1), ticket('a/02', 3)]], 'usd'))
  expect(one.perTicket).toBeNull()
  expect(forecastOf(samplesOf([], 'usd')).perTicket).toBeNull()
  const two = forecastOf(
    samplesOf([[ticket('a/01', 1), ticket('a/02', 3)], [ticket('b/01', 2)]], 'usd'),
  )
  expect(two.perTicket?.median).toBe(2)
  expect(two.unit).toBe('usd')
})

test('Build’s forecast is the per-ticket median and p90 times the tickets meant for an agent', () => {
  const forecast = forecastOf(
    samplesOf([[ticket('a/01', 1), ticket('a/02', 3)], [ticket('b/01', 2)]], 'usd'),
  )
  expect(buildForecastOf(forecast, 5)).toEqual({ median: 10, p90: 14, tickets: 5, unit: 'usd' })
  expect(buildForecastOf(forecastOf(samplesOf([], 'usd')), 5)).toBeNull()
})

for (const [name, build, text] of [
  [
    'dollars',
    { median: 9.2, p90: 14.4, tickets: 5, unit: 'usd' },
    'Build ≈ $9.20 (p90 $14) for 5 tickets',
  ],
  [
    'tokens',
    { median: 410_000, p90: 620_000, tickets: 5, unit: 'tokens' },
    'Build ≈ 410k fresh (p90 620k) for 5 tickets',
  ],
  [
    'one ticket',
    { median: 12, p90: 30, tickets: 1, unit: 'usd' },
    'Build ≈ $12 (p90 $30) for 1 ticket',
  ],
  ['no forecast', null, 'No forecast yet: it needs 2 finished features'],
] as const) {
  test(`the forecast text, in ${name}`, () => {
    expect(buildForecastText(build)).toBe(text)
  })
}

test('the No forecast text names the 2 finished features it needs', () => {
  expect(NO_FORECAST_TEXT).toBe('No forecast yet: it needs 2 finished features')
})

test('a phase forecast reads beside its spend', () => {
  expect(phaseForecastText({ median: 2.1, p90: 3.4 }, 'usd')).toBe('forecast ≈ $2.10 (p90 $3.40)')
  expect(phaseForecastText({ median: 41_000, p90: 62_000 }, 'tokens')).toBe(
    'forecast ≈ 41k fresh (p90 62k)',
  )
})

const record = (
  over: Partial<FeatureRecord> = {},
): Pick<FeatureRecord, 'marks' | 'archivedAt' | 'unarchivedAt'> => ({ marks: {}, ...over })

for (const [name, r, finished] of [
  ['Ship marked done', record({ marks: { ship: { markedDoneAt: '2026-11-01T00:00:00Z' } } }), true],
  [
    'a Retro that ran (it runs after Ship)',
    record({ marks: { retro: { ranAt: '2026-11-01T00:00:00Z' } } }),
    true,
  ],
  ['archived', record({ archivedAt: '2026-11-01T00:00:00Z' }), true],
  [
    'its PR seen merged, with Retro off and not archived',
    record({ shippedAt: '2026-11-01T00:00:00Z' }),
    true,
  ],
  [
    'brought back after its archive',
    record({ archivedAt: '2026-11-01T00:00:00Z', unarchivedAt: '2026-11-02T00:00:00Z' }),
    false,
  ],
  ['Build running', record({ marks: { build: { ranAt: '2026-11-01T00:00:00Z' } } }), false],
] as const) {
  test(`a Feature is finished when: ${name} → ${finished}`, () => {
    expect(isFinished(r as FeatureRecord)).toBe(finished)
  })
}
