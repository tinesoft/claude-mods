import { atom, type EngineInterface, read, update } from 'claude-code'
import type { Flow } from '../../src/evidence'
import {
  type SpendSummary,
  spendSummaryMarkdown,
  spendSummaryOf,
  spendSummaryPath,
  spendSummaryRows,
  type SummaryRow,
} from '../../src/spend-summary'
import { exists, writableContext, writeRepoFile } from './repo'
import { featureRowsOf, hasCostOf } from './spend'

/** The summaries this session found written, so a Feature through is not checked again each settle. */
const summariesState = atom({ plugin: 'craftory', key: 'spendSummaries' } as const, [])

/** The flow's Feature's spend summary, from every session's rows; null when it spent nothing. */
async function summaryOf($: EngineInterface, flow: Flow): Promise<SpendSummary | null> {
  const [rows, hasCost] = await Promise.all([featureRowsOf($, flow.feature.key), hasCostOf($)])
  const forecast = flow.feature.kind === 'specced' ? flow.feature.record.forecast?.build : undefined
  return spendSummaryOf({ rows, forecast: forecast ?? null, hasCost })
}

/** The Retro card's summary rows; none with no flow or no spend. */
export async function retroSummaryRowsOf(
  $: EngineInterface,
  flow: Flow | null,
): Promise<SummaryRow[]> {
  const summary = flow === null ? null : await summaryOf($, flow)
  return summary === null ? [] : spendSummaryRows(summary)
}

/** What `/retro` is given beside its prompt: the summary as Markdown; null with no spend. */
export async function retroContextOf($: EngineInterface, flow: Flow): Promise<string | null> {
  const summary = await summaryOf($, flow)
  if (summary === null) return null
  return `Craftory: this Feature’s spend, to weigh cost-saving suggestions against.\n\n${spendSummaryMarkdown(summary, flow.title)}`
}

/** Whether the Feature is through: Retro done, or Ship done with Retro turned off. */
const isThrough = (flow: Flow) => {
  const state = (phase: 'ship' | 'retro') => flow.phases.find(p => p.phase === phase)?.state
  const retro = state('retro')
  return retro?.kind === 'done' || (retro?.kind === 'skipped' && state('ship')?.kind === 'done')
}

/**
 * Once the Feature is through, its summary is written to `spend.md`, once: a file already there,
 * edited or not, is never rewritten. Nothing is written for a Feature that spent nothing.
 */
export async function writeSpendSummary($: EngineInterface, flow: Flow | null) {
  if (flow?.feature.kind !== 'specced' || !isThrough(flow)) return
  const path = spendSummaryPath(flow.feature.record.spec)
  if ((await read($, summariesState)).includes(path)) return
  if (!(await exists($, path))) {
    const summary = await summaryOf($, flow)
    if (summary === null) return
    const after = spendSummaryMarkdown(summary, flow.title)
    const ctx = await writableContext($)
    const wrote = await writeRepoFile($, { path, before: null, after }, ctx).then(
      r => r.ok,
      () => false,
    )
    if (!wrote) return
  }
  await update($, summariesState, held => [...held, path])
}
