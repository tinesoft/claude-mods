import { expect, test } from 'claude-code/testing'
import {
  spendSummaryMarkdown,
  spendSummaryOf,
  spendSummaryPath,
  spendSummaryRows,
} from '../src/spend-summary'
import type { FeatureForecast, IssueRef, SpendPhase, SpendRow } from '../types'

const row = (
  phase: SpendPhase,
  usd: number | null,
  over: Partial<SpendRow> & { fresh?: number; cacheRead?: number } = {},
): SpendRow => {
  const { fresh = 100_000, cacheRead = 0, ...rest } = over
  return {
    feature: 'spec:csv' as SpendRow['feature'],
    phase,
    ticket: null,
    agentId: null,
    model: 'claude-sonnet-5-5',
    tokens: { input: fresh, output: 0, cacheRead, cacheWrite: 0 },
    usd,
    isEstimated: false,
    steps: 1,
    ...rest,
  }
}

const ticket = (ref: string, usd: number | null, over: Parameters<typeof row>[2] = {}) =>
  row('build', usd, { ticket: ref as IssueRef, ...over })

const forecast = (median: number, p90: number, unit: 'usd' | 'tokens' = 'usd') =>
  ({ median, p90, tickets: 4, unit }) satisfies FeatureForecast['build']

/** A Feature through Retro: Align on opus, four Build tickets, a review and some chat. */
const ROWS: SpendRow[] = [
  row('align', 5, { model: 'claude-opus-5-5', fresh: 200_000, cacheRead: 600_000 }),
  ticket('csv/01', 6),
  ticket('csv/02', 4),
  ticket('csv/03', 2.3),
  ticket('csv/04', 1, { model: 'claude-haiku-4-5' }),
  ticket('csv/01', 0.2, { steps: 2 }),
  row('review', 3.1),
  row('between', 0.5),
]

const rowsOf = (...args: Parameters<typeof spendSummaryOf>) => {
  const summary = spendSummaryOf(...args)
  return summary === null ? null : spendSummaryRows(summary)
}

const textOf = (rows: ReturnType<typeof rowsOf>, label: string) =>
  rows?.find(r => r.label === label)?.text

test('the summary gives the total, Build against its forecast, the top tickets and phases, the cache hit and each model', () => {
  expect(rowsOf({ rows: ROWS, forecast: forecast(9.2, 14), hasCost: true })).toEqual([
    { label: 'Total', text: '$22.1 · 900k fresh' },
    { label: 'Build', text: '$13.5 against a forecast of $9.20 (p90 $14)' },
    { label: 'Tickets', text: 'csv/01 $6.20 · csv/02 $4.00 · csv/03 $2.30' },
    { label: 'Phases', text: 'Build $13.5 · Align $5.00 · Review $3.10' },
    { label: 'Cache', text: '40%' },
    {
      label: 'Models',
      text: 'claude-sonnet-5-5 $16.1 · claude-opus-5-5 $5.00 · claude-haiku-4-5 $1.00',
    },
  ])
})

test('Build over its p90 says so', () => {
  const rows = rowsOf({ rows: ROWS, forecast: forecast(5, 8), hasCost: true })
  expect(textOf(rows, 'Build')).toBe(
    '$13.5 against a forecast of $5.00 (p90 $8.00) · above the p90',
  )
})

test('ties keep the costlier in tokens first, then the phase order and the ticket order', () => {
  const rows = rowsOf({
    rows: [
      ticket('csv/03', 2),
      ticket('csv/02', 2, { fresh: 300_000 }),
      ticket('csv/01', 2),
      ticket('csv/04', 2),
      row('review', 2),
      row('align', 2),
      row('ship', 2),
      row('spec', 2),
    ],
    hasCost: true,
  })
  expect(textOf(rows, 'Tickets')).toBe('csv/02 $2.00 · csv/01 $2.00 · csv/03 $2.00')
  expect(textOf(rows, 'Phases')).toBe('Build $8.00 · Align $2.00 · Spec $2.00')
})

test('with no forecast saved Build says so, and with neither forecast nor Build spend there is no Build row', () => {
  expect(textOf(rowsOf({ rows: ROWS, hasCost: true }), 'Build')).toBe(
    '$13.5 · no forecast was saved',
  )
  const noBuild = rowsOf({ rows: [row('align', 1)], hasCost: true })
  expect(noBuild?.map(r => r.label)).toEqual(['Total', 'Phases', 'Cache', 'Models'])
})

test('without a cost ledger every figure is in fresh tokens, never $0', () => {
  const unpriced = ROWS.map(r => ({ ...r, usd: null }))
  const rows = rowsOf({
    rows: unpriced,
    forecast: forecast(300_000, 420_000, 'tokens'),
    hasCost: false,
  })
  expect(rows).toEqual([
    { label: 'Total', text: '900k fresh · $ unavailable on this surface' },
    {
      label: 'Build',
      text: '500k fresh against a forecast of 300k fresh (p90 420k) · above the p90',
    },
    { label: 'Tickets', text: 'csv/01 200k fresh · csv/02 100k fresh · csv/03 100k fresh' },
    { label: 'Phases', text: 'Build 500k fresh · Align 200k fresh · Review 100k fresh' },
    { label: 'Cache', text: '40%' },
    {
      label: 'Models',
      text: 'claude-sonnet-5-5 600k fresh · claude-opus-5-5 200k fresh · claude-haiku-4-5 100k fresh',
    },
  ])
  expect(rows?.some(r => r.text.includes('$0'))).toBe(false)
})

test('a Feature that spent nothing has no summary', () => {
  expect(spendSummaryOf({ rows: [], hasCost: true })).toBeNull()
})

test('the Markdown names the Feature and gives every row', () => {
  const summary = spendSummaryOf({ rows: ROWS, forecast: forecast(9.2, 14), hasCost: true })!
  expect(spendSummaryMarkdown(summary, 'Export invoices as CSV')).toBe(
    [
      '# Spend: Export invoices as CSV',
      '',
      '- **Total:** $22.1 · 900k fresh',
      '- **Build against its forecast:** $13.5 against a forecast of $9.20 (p90 $14)',
      '- **Costliest tickets:** csv/01 $6.20 · csv/02 $4.00 · csv/03 $2.30',
      '- **Costliest phases:** Build $13.5 · Align $5.00 · Review $3.10',
      '- **Cache-hit %:** 40%',
      '- **Spend by model:** claude-sonnet-5-5 $16.1 · claude-opus-5-5 $5.00 · claude-haiku-4-5 $1.00',
      '',
    ].join('\n'),
  )
})

test('the summary file lives beside the Feature’s spend files', () => {
  expect(spendSummaryPath('csv' as IssueRef)).toBe('.craftory/spend/csv/spend.md')
  expect(spendSummaryPath('#42' as IssueRef)).toBe('.craftory/spend/42/spend.md')
})
