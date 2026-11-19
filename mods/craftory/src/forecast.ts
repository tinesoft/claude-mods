/**
 * The forecast: what a Build ticket and each phase usually cost, read off this repo's finished
 * Features. Pure: the shell gathers each finished Feature's spend rows, from every session.
 *
 * Each finished Feature's Build tickets give one sample each (the ticket's spend), and the Feature
 * gives one sample per phase it spent on. A forecast is the median and the p90 of its samples, and
 * none until 2 finished Features gave any. Build's forecast scales the per-ticket one by the
 * tickets meant for an agent.
 */
import type { FeatureForecast, ForecastUnit, PhaseId, SpendRow } from '../types'
import { PHASE_ORDER } from './phases'
import { tokensText, totalOfRows, usdText } from './spend'

/** Finished Features a forecast needs before it is shown: one would be a guess. */
export const MIN_FINISHED = 2

export const NO_FORECAST_TEXT = `No forecast yet: it needs ${MIN_FINISHED} finished features`

/** Dollars where the host keeps a cost ledger, fresh tokens where it keeps none. */
export const FORECAST_UNITS = ['usd', 'tokens'] as const satisfies readonly ForecastUnit[]

export type Spread = { median: number; p90: number }

/** Build's forecast for a Feature: the per-ticket spread times its tickets meant for an agent. */
export type BuildForecast = FeatureForecast['build']

/** Samples of one kind, and how many finished Features gave them. */
export type SampleSet = { features: number; values: number[] }

export type Samples = {
  unit: ForecastUnit
  perTicket: SampleSet
  phases: Partial<Record<PhaseId, SampleSet>>
}

export type Forecast = {
  unit: ForecastUnit
  /** Null under `MIN_FINISHED` finished Features with a Build ticket. */
  perTicket: Spread | null
  /** Only the phases `MIN_FINISHED` finished Features spent on. */
  phases: Partial<Record<PhaseId, Spread>>
}

/** The `q` quantile of sorted values, between the closest ranks. */
function quantile(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo)
}

/** The median and the p90 of some samples; null with none. */
export function spreadOf(samples: readonly number[]): Spread | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  return { median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9) }
}

/** What some rows cost in the unit: null for dollars no row was priced for. */
function valueOf(rows: readonly SpendRow[], unit: ForecastUnit): number | null {
  const total = totalOfRows(rows)
  return unit === 'usd' ? total.usd : total.fresh
}

const add = (set: SampleSet | undefined, values: number[]): SampleSet =>
  values.length === 0
    ? (set ?? { features: 0, values: [] })
    : { features: (set?.features ?? 0) + 1, values: [...(set?.values ?? []), ...values] }

/** The samples of finished Features, each given as all its spend rows from every session. */
export function samplesOf(features: readonly (readonly SpendRow[])[], unit: ForecastUnit): Samples {
  let perTicket: SampleSet = { features: 0, values: [] }
  const phases: Partial<Record<PhaseId, SampleSet>> = {}
  for (const rows of features) {
    const tickets = new Map<string, SpendRow[]>()
    for (const r of rows)
      if (r.phase === 'build' && r.ticket !== null)
        tickets.set(r.ticket, [...(tickets.get(r.ticket) ?? []), r])
    perTicket = add(
      perTicket,
      [...tickets.values()].flatMap(list => valueOf(list, unit) ?? []),
    )
    for (const phase of PHASE_ORDER) {
      const list = rows.filter(r => r.phase === phase)
      const value = list.length === 0 ? null : valueOf(list, unit)
      if (value !== null) phases[phase] = add(phases[phase], [value])
    }
  }
  return { unit, perTicket, phases }
}

const spreadOfSet = (set: SampleSet | undefined): Spread | null =>
  set === undefined || set.features < MIN_FINISHED ? null : spreadOf(set.values)

export function forecastOf(samples: Samples): Forecast {
  return {
    unit: samples.unit,
    perTicket: spreadOfSet(samples.perTicket),
    phases: Object.fromEntries(
      PHASE_ORDER.flatMap(p => {
        const spread = spreadOfSet(samples.phases[p])
        return spread === null ? [] : [[p, spread]]
      }),
    ),
  }
}

/** Reads a saved forecast; anything malformed is none. */
export function parseForecast(v: unknown): FeatureForecast | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const { build, at } = v as Record<string, unknown>
  if (typeof build !== 'object' || build === null || typeof at !== 'string') return undefined
  const b = build as Record<string, unknown>
  const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
  if (![b.median, b.p90, b.tickets].every(isCount)) return undefined
  if (!FORECAST_UNITS.includes(b.unit as ForecastUnit) || Number.isNaN(Date.parse(at)))
    return undefined
  return {
    build: {
      median: b.median as number,
      p90: b.p90 as number,
      tickets: b.tickets as number,
      unit: b.unit as ForecastUnit,
    },
    at: at as FeatureForecast['at'],
  }
}

/** Build's forecast for `tickets` tickets meant for an agent; null with no per-ticket forecast. */
export function buildForecastOf(forecast: Forecast, tickets: number): BuildForecast | null {
  const per = forecast.perTicket
  if (per === null) return null
  return { median: per.median * tickets, p90: per.p90 * tickets, tickets, unit: forecast.unit }
}

/** Dollars as a forecast reads them: cents below $10, as `usdText`, then whole dollars. */
const forecastUsdText = (usd: number) => (usd < 10 ? usdText(usd) : `$${Math.round(usd)}`)

/** `$9.20 (p90 $14)`, or `410k fresh (p90 620k)` in tokens. */
function spreadText(spread: Spread, unit: ForecastUnit): string {
  return unit === 'usd'
    ? `${forecastUsdText(spread.median)} (p90 ${forecastUsdText(spread.p90)})`
    : `${tokensText(Math.round(spread.median))} fresh (p90 ${tokensText(Math.round(spread.p90))})`
}

/** The Tickets card's Forecast row: `Build ≈ $9.20 (p90 $14) for 5 tickets`, or why there is none. */
export function buildForecastText(build: BuildForecast | null): string {
  if (build === null) return NO_FORECAST_TEXT
  const tickets = `${build.tickets} ticket${build.tickets === 1 ? '' : 's'}`
  return `Build ≈ ${spreadText(build, build.unit)} for ${tickets}`
}

/** A phase's forecast beside its spend in the Spend tab: `forecast ≈ $2.10 (p90 $3.40)`. */
export const phaseForecastText = (spread: Spread, unit: ForecastUnit) =>
  `forecast ≈ ${spreadText(spread, unit)}`
