import type { EngineInterface } from 'claude-code'
import { isoOf } from '../../src/build'
import type { Flow } from '../../src/evidence'
import { agentTicketsOf, isFinished, specKey } from '../../src/features'
import {
  type BuildForecast,
  buildForecastOf,
  buildForecastText,
  type Forecast,
  forecastOf,
  samplesOf,
} from '../../src/forecast'
import type { FeatureKey } from '../../types'
import { featuresOf, recordChange } from './features'
import { featureRowsOf, hasCostOf } from './spend'

/**
 * The forecast from this repo's finished Features, every session's spend of each, in dollars or,
 * where the host keeps no cost ledger, in fresh tokens. `exclude` is the Feature being forecast,
 * which never forecasts itself.
 */
export async function forecastNow(
  $: EngineInterface,
  exclude: FeatureKey | null,
): Promise<Forecast> {
  const [records, hasCost] = await Promise.all([featuresOf($), hasCostOf($)])
  const finished = Object.values(records)
    .filter(isFinished)
    .map(r => specKey(r.spec))
    .filter(key => key !== exclude)
  const rows = await Promise.all(finished.map(key => featureRowsOf($, key)))
  return forecastOf(samplesOf(rows, hasCost ? 'usd' : 'tokens'))
}

/** Build's forecast for the flow's Feature; null until there is enough history. */
export async function buildForecastNow(
  $: EngineInterface,
  flow: Flow,
): Promise<BuildForecast | null> {
  return buildForecastOf(await forecastNow($, flow.feature.key), agentTicketsOf(flow))
}

/**
 * The Tickets card's Forecast row; none with no flow, nor while a forecast waits on tickets to
 * scale by.
 */
export async function buildForecastTextOf(
  $: EngineInterface,
  flow: Flow | null,
): Promise<string | null> {
  if (flow === null) return null
  const build = await buildForecastNow($, flow)
  return build?.tickets === 0 ? null : buildForecastText(build)
}

/**
 * Build starts (typed, pressed, or its first implementer spawns): its forecast is saved on the
 * Feature record, once. A record that has one keeps it, and with no forecast yet none is saved.
 */
export async function saveForecast($: EngineInterface, flow: Flow) {
  if (flow.feature.kind !== 'specced' || flow.feature.record.forecast !== undefined) return
  const build = await buildForecastNow($, flow)
  if (build === null || build.tickets === 0) return
  const at = isoOf(await $.clock.now())
  await recordChange($, flow.feature.key, { kind: 'forecast', forecast: { build, at } })
}
