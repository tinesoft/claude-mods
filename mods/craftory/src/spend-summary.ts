/**
 * The spend summary of a Feature at Retro: its total, Build against the forecast saved when Build
 * started, the costliest tickets and phases, the cache-hit % and the spend by model. Pure: the
 * shell gathers the Feature's rows from every session. It renders as the Retro card's rows, as the
 * Markdown `/retro` is given, and as `spend.md`.
 *
 * Where the host keeps no cost ledger every figure is in fresh tokens, never `$0`.
 */
import type { FeatureForecast, IssueRef, PhaseId, SpendRow } from '../types'
import { SPEND_DIR } from './files'
import { forecastUsdText, spreadText } from './forecast'
import { PHASE_ORDER, PHASES } from './phases'
import {
  cacheHit,
  freshText,
  NO_COST_TEXT,
  spendSlug,
  type SpendTotal,
  totalOfRows,
  usdText,
} from './spend'

/** How many of the costliest tickets and phases the summary names. */
export const TOP_COUNT = 3

/** The summary's file, beside the Feature's spend files: written once, never rewritten. */
export const spendSummaryPath = (spec: IssueRef) => `${SPEND_DIR}${spendSlug(spec)}/spend.md`

export type Ranked<K extends string> = { key: K; total: SpendTotal }

export type SpendSummary = {
  hasCost: boolean
  total: SpendTotal
  /** Build's spend (null when none) and the forecast saved when it started (null when none was). */
  build: { actual: SpendTotal | null; forecast: FeatureForecast['build'] | null }
  tickets: Ranked<IssueRef>[]
  phases: Ranked<PhaseId>[]
  cacheHit: number | null
  /** Every model the Feature ran on, costliest first. */
  models: Ranked<string>[]
}

/** The summary's rows, by their card label (short, to fit the card's label column). */
export const SUMMARY_LABELS = ['Total', 'Build', 'Tickets', 'Phases', 'Cache', 'Models'] as const

export type SummaryLabel = (typeof SUMMARY_LABELS)[number]

/** What each row is called in the Markdown, where there is room to say it in full. */
const MARKDOWN_LABELS: Record<SummaryLabel, string> = {
  Total: 'Total',
  Build: 'Build against its forecast',
  Tickets: 'Costliest tickets',
  Phases: 'Costliest phases',
  Cache: 'Cache-hit %',
  Models: 'Spend by model',
}

export type SummaryRow = { label: SummaryLabel; text: string }

/** What a total weighs: its dollars where there is a cost ledger, then its fresh tokens. */
const weigh = (t: SpendTotal, hasCost: boolean) => [hasCost ? (t.usd ?? 0) : 0, t.fresh]

/**
 * Totals of rows grouped by a key, costliest first. A tie keeps the costlier in fresh tokens
 * first, then `order` (the phase order, a ticket's number, a model's name).
 */
function ranked<K extends string>(
  rows: readonly SpendRow[],
  keyOf: (r: SpendRow) => K | null,
  hasCost: boolean,
  order: (a: K, b: K) => number,
): Ranked<K>[] {
  const groups = new Map<K, SpendRow[]>()
  for (const r of rows) {
    const key = keyOf(r)
    if (key !== null) groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, total: totalOfRows(list) }))
    .sort((a, b) => {
      const [wa, wb] = [weigh(a.total, hasCost), weigh(b.total, hasCost)]
      return wb[0]! - wa[0]! || wb[1]! - wa[1]! || order(a.key, b.key)
    })
}

const byNumber = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })
const byPhase = (a: PhaseId, b: PhaseId) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b)

/** The summary of a Feature's spend; null when it spent nothing. */
export function spendSummaryOf(args: {
  rows: readonly SpendRow[]
  forecast?: FeatureForecast['build'] | null
  hasCost: boolean
}): SpendSummary | null {
  const { rows, hasCost } = args
  const total = totalOfRows(rows)
  if (total.fresh === 0 && total.cacheRead === 0) return null
  const build = rows.filter(r => r.phase === 'build')
  const isPhase = (p: SpendRow['phase']): p is PhaseId => p !== null && p !== 'between'
  return {
    hasCost,
    total,
    build: {
      actual: build.length === 0 ? null : totalOfRows(build),
      forecast: args.forecast ?? null,
    },
    tickets: ranked(rows, r => r.ticket, hasCost, byNumber).slice(0, TOP_COUNT),
    phases: ranked(rows, r => (isPhase(r.phase) ? r.phase : null), hasCost, byPhase).slice(
      0,
      TOP_COUNT,
    ),
    cacheHit: cacheHit(total.tokens),
    models: ranked(
      rows,
      r => r.model,
      hasCost,
      (a, b) => a.localeCompare(b, 'en'),
    ),
  }
}

/** A figure in dollars where it was priced and the host keeps a ledger, else in fresh tokens. */
const amountText = (t: SpendTotal, hasCost: boolean) =>
  hasCost && t.usd !== null ? usdText(t.usd) : freshText(t.fresh)

/**
 * Build's spend in the forecast's own unit, so the two compare. Beside a forecast the dollars are
 * rounded as the forecast's are (`forecastUsdText`), so both figures of the line read alike; a
 * spend with no forecast keeps its cents.
 */
function buildText(s: SpendSummary): string | null {
  const { actual, forecast } = s.build
  if (forecast === null)
    return actual === null ? null : `${amountText(actual, s.hasCost)} · no forecast was saved`
  const forecastText = spreadText(forecast, forecast.unit)
  // A forecast in dollars has nothing to compare with where Build's steps were never priced
  if (forecast.unit === 'usd' && actual !== null && (actual.usd === null || !s.hasCost))
    return `${freshText(actual.fresh)} · the forecast of ${forecastText} is in dollars`
  const value = actual === null ? 0 : forecast.unit === 'usd' ? actual.usd! : actual.fresh
  const spent =
    actual === null
      ? 'Nothing spent'
      : forecast.unit === 'usd'
        ? forecastUsdText(value)
        : freshText(value)
  const above = value > forecast.p90 ? ' · above the p90' : ''
  return `${spent} against a forecast of ${forecastText}${above}`
}

const listText = <K extends string>(
  list: readonly Ranked<K>[],
  label: (k: K) => string,
  hasCost: boolean,
) => list.map(r => `${label(r.key)} ${amountText(r.total, hasCost)}`).join(' · ')

/** The summary as label and text rows, as the Retro card shows them; a row with nothing is left out. */
export function spendSummaryRows(s: SpendSummary): SummaryRow[] {
  const build = buildText(s)
  const row = (label: SummaryLabel, text: string | null): SummaryRow[] =>
    text === null || text === '' ? [] : [{ label, text }]
  return [
    ...row(
      'Total',
      [
        ...(s.hasCost && s.total.usd !== null ? [usdText(s.total.usd)] : []),
        freshText(s.total.fresh),
        ...(s.hasCost ? [] : [NO_COST_TEXT]),
      ].join(' · '),
    ),
    ...row('Build', build),
    ...row(
      'Tickets',
      listText(s.tickets, k => k, s.hasCost),
    ),
    ...row(
      'Phases',
      listText(s.phases, p => PHASES[p].label, s.hasCost),
    ),
    ...row('Cache', s.cacheHit === null ? null : `${Math.round(s.cacheHit * 100)}%`),
    ...row(
      'Models',
      listText(s.models, k => k, s.hasCost),
    ),
  ]
}

/** The summary as Markdown: what `/retro` is given and what `spend.md` holds. */
export function spendSummaryMarkdown(s: SpendSummary, title: string): string {
  return [
    `# Spend: ${title}`,
    '',
    ...spendSummaryRows(s).map(r => `- **${MARKDOWN_LABELS[r.label]}:** ${r.text}`),
    '',
  ].join('\n')
}
