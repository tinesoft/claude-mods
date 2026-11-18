/**
 * The budget notice: raised once a phase or the Feature reaches its dollar budget, and its
 * Raise budget and Continue answers.
 */
import type { EngineInterface } from 'claude-code'
import {
  budgetNoticesDue,
  budgetText,
  parseScopeBudgets,
  raisedBudget,
  scopeBudgetOf,
  scopeName,
  STORE_BUDGETS_CONTINUED,
  STORE_BUDGETS_RAISED,
  withScopeBudgets,
  type BudgetStanding,
} from '../../src/budgets'
import type { Flow } from '../../src/evidence'
import { featureOf } from '../../src/features'
import { PHASE_ORDER } from '../../src/phases'
import type { BudgetScope, EventNotice, FeatureKey } from '../../types'
import { draftsOf, featuresOf, setOwnBudget } from './features'
import { addNotice, removeNotices } from './notices'
import { repoFacts } from './repo'
import { budgetStandingsOf } from './spend'

async function scopeBudgetsAt($: EngineInterface, key: string) {
  return parseScopeBudgets(await $.store.get(key).catch(() => undefined))
}

/**
 * Raises the notice of each scope of the active Feature that crossed into Over budget. The budget
 * each was raised at is kept in the store, so a later session does not raise it again.
 */
export async function checkSpendBudgets($: EngineInterface, flow: Flow | null) {
  if (flow === null) return
  const [standings, raised, continued] = await Promise.all([
    budgetStandingsOf($, flow.feature),
    scopeBudgetsAt($, STORE_BUDGETS_RAISED),
    scopeBudgetsAt($, STORE_BUDGETS_CONTINUED),
  ])
  const scoped = (scope: BudgetScope, standing: BudgetStanding | null | undefined) =>
    standing ? [{ scope, name: scopeName(scope, flow.title), standing }] : []
  const due = budgetNoticesDue({
    feature: flow.feature.key,
    canRaise: flow.feature.kind === 'specced',
    over: [
      ...PHASE_ORDER.flatMap(p => scoped(p, standings.phases[p])),
      ...scoped('feature', standings.feature),
    ],
    raised,
    continued,
  })
  if (due.length === 0) return
  for (const notice of due) await addNotice($, notice)
  await $.store.set(STORE_BUDGETS_RAISED, withScopeBudgets(raised, due))
}

const dropsScope = (key: FeatureKey, scope: BudgetScope) => (n: EventNotice) =>
  (n.kind === 'spend-budget' || n.kind === 'over-budget-refusal') &&
  n.key === key &&
  n.scope === scope

/** Sets the Feature's own budget for `scope` to half again its budget in force, and drops its notice. */
export async function raiseSpendBudget($: EngineInterface, key: FeatureKey, scope: BudgetScope) {
  const [{ config }, features, drafts] = await Promise.all([
    repoFacts($),
    featuresOf($),
    draftsOf($),
  ])
  const feature = featureOf(key, features, drafts)
  await removeNotices($, dropsScope(key, scope))
  if (feature === null || feature.kind !== 'specced') return
  const budget = scopeBudgetOf(config.budgets, feature, scope)
  if (budget <= 0) return
  const usd = raisedBudget(budget)
  await setOwnBudget($, key, scope, usd)
  const name = scopeName(scope, feature.record.title || feature.record.spec)
  $.ui.toast(`${name} budget raised to ${budgetText(usd)}`)
}

/** Keeps the budget Continue was pressed at, so that budget never raises the notice again. */
export async function continueSpendBudget(
  $: EngineInterface,
  key: FeatureKey,
  scope: BudgetScope,
  budget: number,
) {
  const continued = await scopeBudgetsAt($, STORE_BUDGETS_CONTINUED)
  await $.store.set(STORE_BUDGETS_CONTINUED, withScopeBudgets(continued, [{ key, scope, budget }]))
  await removeNotices($, dropsScope(key, scope))
}
