import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  EMPTY_SPEND,
  observe,
  reading,
  spendText,
  type SpendTotal,
  tokensOf,
  totalOf,
} from '../../src/spend'
import type { FeatureKey, SpendTarget } from '../../types'

const spendState = atom({ plugin: 'craftory', key: 'spend' } as const, EMPTY_SPEND)

/** The session's cost so far; undefined where the host keeps no cost ledger or the read failed. */
async function costOf($: EngineInterface): Promise<number | undefined> {
  return $.session
    .usage()
    .then(u => u.cost?.usd)
    .catch(() => undefined)
}

/**
 * At session start: the cost already on the session (0 for a new one, more after a resume) is the
 * baseline, so the first step is priced and nothing from before the resume is charged to it.
 */
export async function startSpend($: EngineInterface) {
  const usd = await costOf($)
  await update($, spendState, () => ({ ...EMPTY_SPEND, baseline: usd ?? null }))
}

/**
 * One answered step: rolls its tokens up under `target`, and shares out whatever the session's
 * cost moved by since the last reading. Answers whether the short spend text changed, so the
 * caller redraws the status line only then.
 */
export async function noteSpendStep(
  $: EngineInterface,
  target: SpendTarget,
  usage: {
    model: string
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  } | null,
  active: FeatureKey | null,
): Promise<boolean> {
  if (usage === null) return false
  const usd = await costOf($)
  const before = spendText(totalOf(await read($, spendState), active))
  const next = await update($, spendState, ledger =>
    observe(ledger, { ...target, model: usage.model, tokens: tokensOf(usage) }, usd),
  )
  return spendText(totalOf(next, active)) !== before
}

/** A `session.measure` whose cost grew: prices the steps still waiting for it. */
export async function noteSpendReading(
  $: EngineInterface,
  usd: number,
  active: FeatureKey | null,
): Promise<boolean> {
  const before = spendText(totalOf(await read($, spendState), active))
  const next = await update($, spendState, ledger => reading(ledger, usd))
  return spendText(totalOf(next, active)) !== before
}

export async function spendTotalOf(
  $: EngineInterface,
  feature: FeatureKey | null,
): Promise<SpendTotal> {
  return totalOf(await read($, spendState), feature)
}
