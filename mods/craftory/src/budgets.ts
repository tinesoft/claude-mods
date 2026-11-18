/**
 * Budgets: dollar caps on a Feature and on each phase, set in config and overridden on the
 * Feature's record. The budget level is the one place every display asks, so they agree.
 */
import type {
  BudgetConfig,
  BudgetScope,
  Feature,
  FeatureKey,
  Overrun,
  PhaseId,
  SpendBudgetNotice,
} from '../types'
import { PHASES } from './phases'
import type { Role } from './theme'

export const BUDGET_LEVELS = ['none', 'ok', 'near', 'over'] as const
export type BudgetLevel = (typeof BUDGET_LEVELS)[number]

/**
 * How spent `usd` stands against `budget`: none with no budget, no dollars, or where the host
 * keeps no cost ledger; near from `warnAtPercent`; over from 100%.
 */
export function budgetLevel(args: {
  usd: number | null
  budget: number
  warnAtPercent: number
  hasCost: boolean
}): BudgetLevel {
  const { usd, budget, warnAtPercent, hasCost } = args
  if (!hasCost || usd === null || budget <= 0) return 'none'
  if (usd >= budget) return 'over'
  return usd * 100 >= budget * warnAtPercent ? 'near' : 'ok'
}

/**
 * The Feature's budget: its own when set, else the default, as an own `null` asks. `0` is none.
 * A draft has no record.
 */
export const featureBudgetOf = (defaults: BudgetConfig, feature: Feature): number =>
  (feature.kind === 'specced' ? feature.record.budgets?.usd : undefined) ?? defaults.featureUsd

/** A phase's budget: the Feature's own for it when set, else the default. `0` is none. */
export const phaseBudgetOf = (defaults: BudgetConfig, feature: Feature, phase: PhaseId): number =>
  (feature.kind === 'specced' ? feature.record.budgets?.phases?.[phase] : undefined) ??
  defaults.phaseUsd[phase]

/** The word a figure says at its level, so a budget is never told by colour alone. */
export const BUDGET_WORDS: Record<BudgetLevel, string | null> = {
  none: null,
  ok: null,
  near: 'Near budget',
  over: 'Over budget',
}

/** The role a figure takes at its level; null keeps its usual ink. */
export const BUDGET_ROLES: Record<BudgetLevel, Role | null> = {
  none: null,
  ok: null,
  near: 'hook',
  over: 'danger',
}

/** A budget and where spend stands against it. */
export type BudgetMark = { budget: number; level: BudgetLevel }

export const NO_BUDGET: BudgetMark = { budget: 0, level: 'none' }

/** What a phase or the Feature has spent in dollars, its budget, and where one stands against the other. */
export type BudgetStanding = Pick<Overrun, 'usd' | 'budget'> & { level: BudgetLevel }

/** A spend figure as a display draws it: its text, and the level that picks its ink. */
export type SpendFigure = { text: string; level: BudgetLevel }

/** Budgets are whole dollars: `$12`. */
export const budgetText = (usd: number) => `$${usd}`

/** A whole-dollar budget as typed, with or without `$`: `12`, `$12`, `$ 12`; null when it is not one. */
export function parseBudget(text: string): number | null {
  const match = /^\$?\s*(\d+)$/.exec(text.trim())
  return match === null ? null : Number(match[1])
}

/** What a scope is called: the phase's label, or the Feature's `title`. */
export const scopeName = (scope: BudgetScope, title: string) =>
  scope === 'feature' ? title : PHASES[scope].label

/** Spent dollars of a budget, to the cent: `$12.40 of $12`. */
export const ofBudgetText = (usd: number, budget: number) =>
  `$${usd.toFixed(2)} of ${budgetText(budget)}`

/** Where `usd` spent stands against `budget`, with the warning share from config. */
export const budgetMarkOf = (
  usd: number | null,
  budget: number,
  defaults: BudgetConfig,
  hasCost: boolean,
): BudgetMark => ({
  budget,
  level: budgetLevel({ usd, budget, warnAtPercent: defaults.warnAtPercent, hasCost }),
})

/** A Feature's budgets in force: its own where set, else the defaults. A draft gets the defaults. */
export const budgetsOfFeature = (defaults: BudgetConfig, feature: Feature): BudgetConfig => ({
  featureUsd: featureBudgetOf(defaults, feature),
  phaseUsd: Object.fromEntries(
    Object.keys(defaults.phaseUsd).map(p => [p, phaseBudgetOf(defaults, feature, p as PhaseId)]),
  ) as Record<PhaseId, number>,
  warnAtPercent: defaults.warnAtPercent,
})

/** A phase's or the Feature's budget in force; `0` is none. */
export const scopeBudgetOf = (defaults: BudgetConfig, feature: Feature, scope: BudgetScope) =>
  scope === 'feature' ? featureBudgetOf(defaults, feature) : phaseBudgetOf(defaults, feature, scope)

/** Raise budget adds half the budget again, rounded up to a whole dollar. */
export const raisedBudget = (budget: number) => Math.ceil(budget * 1.5)

/** `Build is at $12.40 of $12`. */
export const overBudgetText = (n: Pick<Overrun, 'name' | 'usd' | 'budget'>) =>
  `${n.name} is at ${ofBudgetText(n.usd, n.budget)}`

/** Where Continue keeps, per Feature, the budget of each scope it was pressed at. */
export const STORE_BUDGETS_CONTINUED = 'budgetsContinued'

/** Where the budget notice keeps, per Feature, the budget of each scope it was last raised at. */
export const STORE_BUDGETS_RAISED = 'budgetsRaised'

/** A budget per Feature and scope, as Continue and the notice keep them in the store. */
export type ScopeBudgets = Record<string, Partial<Record<BudgetScope, number>>>

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Budgets kept per Feature and scope; anything unreadable is dropped. */
export function parseScopeBudgets(v: unknown): ScopeBudgets {
  if (!isRecord(v)) return {}
  return Object.fromEntries(
    Object.entries(v).flatMap(([key, scopes]) =>
      isRecord(scopes)
        ? [
            [
              key,
              Object.fromEntries(
                Object.entries(scopes).filter(([, usd]) => typeof usd === 'number'),
              ) as Partial<Record<BudgetScope, number>>,
            ],
          ]
        : [],
    ),
  )
}

/** `held` with `budget` kept for each scope of each notice. */
export const withScopeBudgets = (
  held: ScopeBudgets,
  marks: readonly Pick<SpendBudgetNotice, 'key' | 'scope' | 'budget'>[],
): ScopeBudgets =>
  marks.reduce<ScopeBudgets>(
    (all, m) => ({ ...all, [m.key]: { ...all[m.key], [m.scope]: m.budget } }),
    held,
  )

export const spendBudgetNoticeId = (feature: FeatureKey, scope: BudgetScope) =>
  `spend-budget-${feature}-${scope}`

/**
 * The budget notices due now: each scope over its budget that has not raised one at that budget,
 * and that Continue was not pressed on at that budget.
 */
export function budgetNoticesDue(args: {
  feature: FeatureKey
  canRaise: boolean
  over: readonly { scope: BudgetScope; name: string; standing: BudgetStanding }[]
  raised: ScopeBudgets
  continued: ScopeBudgets
}): SpendBudgetNotice[] {
  const { feature: key } = args
  return args.over.flatMap(({ scope, name, standing }) =>
    standing.level !== 'over' ||
    args.raised[key]?.[scope] === standing.budget ||
    args.continued[key]?.[scope] === standing.budget
      ? []
      : [
          {
            kind: 'spend-budget' as const,
            id: spendBudgetNoticeId(key, scope),
            key,
            scope,
            name,
            usd: standing.usd,
            budget: standing.budget,
            canRaise: args.canRaise,
          },
        ],
  )
}

/**
 * What is over budget for a run of `phase`: the phase itself first, then the Feature titled
 * `title`. Null unless one is positively over, so a missing ledger or budget lets the run through.
 */
export function overrunOf(args: {
  phase: PhaseId
  phaseUsd: number | null
  featureUsd: number | null
  title: string
  /** The Feature's budgets in force. */
  budgets: BudgetConfig
  hasCost: boolean
}): Overrun | null {
  const { phase, phaseUsd, featureUsd, title, budgets, hasCost } = args
  const isOver = (usd: number | null, budget: number): usd is number =>
    budgetLevel({ usd, budget, warnAtPercent: budgets.warnAtPercent, hasCost }) === 'over'
  if (isOver(phaseUsd, budgets.phaseUsd[phase]))
    return {
      scope: phase,
      name: scopeName(phase, title),
      usd: phaseUsd,
      budget: budgets.phaseUsd[phase],
    }
  if (isOver(featureUsd, budgets.featureUsd))
    return {
      scope: 'feature',
      name: scopeName('feature', title),
      usd: featureUsd,
      budget: budgets.featureUsd,
    }
  return null
}
