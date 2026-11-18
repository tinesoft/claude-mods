/**
 * The Flow tab's Budget row: the active Feature's spend of its budget, and the own budget typed
 * into its field.
 */
import type { BudgetConfig, Feature } from '../types'
import { budgetMarkOf, budgetText, featureBudgetOf, parseBudget, type BudgetLevel } from './budgets'
import { BUDGET_MAX_USD } from './config'
import { NO_COST_LEDGER_NOTE, spendText, type SpendTotal, usdText } from './spend'

export type FlowBudgetView = {
  /** `$9.80 of $20 · Near budget`, `$0.85 · No budget`. */
  text: string
  level: BudgetLevel
  /** Where the budget comes from, or why it does not apply; null for the Feature's own. */
  note: string | null
  /** A specced Feature's own budget can be edited; a draft has no record to keep it on. */
  isEditable: boolean
}

export const DEFAULT_BUDGET_NOTE = 'The default from Settings › Pipeline'
export const DRAFT_BUDGET_NOTE = 'The default · set once the spec binds'

/** The active Feature's Budget row, from its spend and the config's budget defaults. */
export function flowBudgetView(args: {
  feature: Feature
  defaults: BudgetConfig
  total: SpendTotal
  hasCost: boolean
}): FlowBudgetView {
  const { feature, defaults, total, hasCost } = args
  const isEditable = feature.kind === 'specced'
  if (!hasCost)
    return {
      text: spendText(total) ?? 'Nothing spent',
      level: 'none',
      note: NO_COST_LEDGER_NOTE,
      isEditable,
    }
  const budget = featureBudgetOf(defaults, feature)
  const usd = total.usd ?? 0
  const mark = budgetMarkOf(usd, budget, defaults, hasCost)
  const isOwn = feature.kind === 'specced' && typeof feature.record.budgets?.usd === 'number'
  return {
    text: budget > 0 ? spendText({ ...total, usd }, mark)! : `${usdText(usd)} · No budget`,
    level: mark.level,
    note: !isEditable ? DRAFT_BUDGET_NOTE : isOwn || budget === 0 ? null : DEFAULT_BUDGET_NOTE,
    isEditable,
  }
}

const OWN_BUDGET_PROBLEM = `Budget: use whole dollars up to ${budgetText(BUDGET_MAX_USD)}, or 0 for none`

/**
 * An own budget as typed: whole dollars, with or without `$`. `0` is no budget for this Feature,
 * even with a default set; empty (`usd: null`) drops the own budget, so the default applies again.
 */
export function ownBudgetOf(text: string): { usd: number | null } | { problem: string } {
  if (text.trim() === '') return { usd: null }
  const usd = parseBudget(text)
  return usd === null || usd > BUDGET_MAX_USD ? { problem: OWN_BUDGET_PROBLEM } : { usd }
}
