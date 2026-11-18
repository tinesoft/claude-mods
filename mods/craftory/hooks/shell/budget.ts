import { atom, type EngineInterface, read, update } from 'claude-code'
import type { Flow } from '../../src/evidence'
import { type FlowBudgetView, flowBudgetView, ownBudgetOf } from '../../src/flow-budget'
import { setOwnBudget } from './features'
import { currentFlow, settle } from './flow'
import { repoFacts } from './repo'
import { hasCostOf, spendTotalOf } from './spend'

/** Why the last own budget typed in the Flow tab was refused; null once one is taken. */
const budgetProblemState = atom({ plugin: 'craftory', key: 'budgetProblem' } as const, null)

/** The Flow tab's Budget row for the active Feature, and the refusal of the last edit. */
export async function flowBudgetOf(
  $: EngineInterface,
  flow: Flow | null,
): Promise<{ view: FlowBudgetView; problem: string | null } | null> {
  if (flow === null) return null
  const [{ config }, total, hasCost, problem] = await Promise.all([
    repoFacts($),
    spendTotalOf($, flow.feature.key),
    hasCostOf($),
    read($, budgetProblemState),
  ])
  const view = flowBudgetView({ feature: flow.feature, defaults: config.budgets, total, hasCost })
  return { view, problem }
}

/** Writes the active Feature's own budget as typed, or keeps why it was refused. */
export async function editFeatureBudget($: EngineInterface, text: string) {
  const flow = await currentFlow($)
  if (flow === null || flow.feature.kind !== 'specced') return
  const own = ownBudgetOf(text)
  if ('problem' in own) {
    await update($, budgetProblemState, () => own.problem)
  } else {
    await update($, budgetProblemState, () => null)
    await setOwnBudget($, flow.feature.key, 'feature', own.usd)
    await settle($)
  }
  $.ui.invalidate('ui.render')
}
