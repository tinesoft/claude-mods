/**
 * The Spend tab: what the active Feature cost, broken down by phase (tickets under Build and
 * Review), by model or by person, then every other Feature, archived ones last, then Outside
 * features and any spend file that could not be read. Pure: the shell gathers the rows.
 */
import type { BudgetConfig, FeatureKey, IssueRef, SpendPhase, SpendRow } from '../types'
import { type BudgetLevel, type BudgetMark, budgetMarkOf, NO_BUDGET } from './budgets'
import { PHASE_ORDER, PHASES } from './phases'
import { agentSpendText, phaseSpendText, spendText, type SpendTotal, totalOfRows } from './spend'

/** How the active Feature's spend is broken down. A personal choice, kept in `$.store`. */
export const SPEND_GROUPS = ['phase', 'model', 'person'] as const
export type SpendGroup = (typeof SPEND_GROUPS)[number]
export const STORE_SPEND_GROUP = 'spendGroup'

export const SPEND_GROUP_LABELS: Record<SpendGroup, string> = {
  phase: 'Phase',
  model: 'Model',
  person: 'Person',
}

export const parseSpendGroup = (v: unknown): SpendGroup =>
  SPEND_GROUPS.includes(v as SpendGroup) ? (v as SpendGroup) : 'phase'

/** A row with who ran the session it came from; null when that session's git had no name or email. */
export type PersonRow = SpendRow & { user: string | null }

export type SpendFeatureInput = {
  key: FeatureKey
  title: string
  isArchived: boolean
  rows: readonly PersonRow[]
}

export type SpendLine = {
  key: string
  label: string
  text: string
  /** Where the line stands against its budget; absent with none. */
  level?: BudgetLevel
  /** Tickets under Build and Review, in the phase grouping. */
  children?: SpendLine[]
}

export type SpendFeatureLine = {
  key: FeatureKey
  title: string
  text: string
  isArchived: boolean
}

export type SpendTabView = {
  group: SpendGroup
  /** The host keeps a cost ledger; without one every figure is in tokens. */
  hasCost: boolean
  active: {
    key: FeatureKey
    title: string
    text: string | null
    /** Where the Feature stands against its budget. */
    level: BudgetLevel
    lines: SpendLine[]
  } | null
  others: SpendFeatureLine[]
  outside: string | null
  skipped: string[]
}

export const BETWEEN_LABEL = 'Between phases'
export const OUTSIDE_LABEL = 'Outside features'
export const NO_USER_LABEL = 'No git user'

const SPEND_PHASES: readonly SpendPhase[] = [...PHASE_ORDER, 'between']

const phaseLabel = (p: SpendPhase) => (p === 'between' ? BETWEEN_LABEL : PHASES[p].label)

/** A line's figures: the card's Spend text, or bare fresh tokens for a total that spent little. */
const lineText = (total: SpendTotal, hasCost: boolean, budget: BudgetMark = NO_BUDGET) =>
  phaseSpendText(total, hasCost, budget) ?? ''

/** The line's level, set only when a budget applies, so lines without one stay as they were. */
const levelOf = (budget: BudgetMark) => (budget.level === 'none' ? {} : { level: budget.level })

/** Groups rows by a key, in first-seen order unless `order` names one. */
function groupBy<K extends string>(
  rows: readonly PersonRow[],
  keyOf: (r: PersonRow) => K,
  order?: readonly K[],
): [K, PersonRow[]][] {
  const out = new Map<K, PersonRow[]>()
  for (const r of rows) out.set(keyOf(r), [...(out.get(keyOf(r)) ?? []), r])
  const entries = [...out.entries()]
  return order === undefined
    ? entries
    : entries.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
}

function ticketLines(
  rows: readonly PersonRow[],
  titles: Readonly<Record<string, string>>,
): SpendLine[] {
  return groupBy(
    rows.filter(r => r.ticket !== null),
    r => r.ticket as string,
  )
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([ticket, list]) => {
      const total = totalOfRows(list)
      const title = titles[ticket]
      return {
        key: `ticket-${ticket}`,
        label: title === undefined ? ticket : `${ticket} ${title}`,
        text: agentSpendText(total) ?? `${spendText(total) ?? '0'} tokens`,
      }
    })
}

function lines(
  rows: readonly PersonRow[],
  group: SpendGroup,
  hasCost: boolean,
  titles: Readonly<Record<string, string>>,
  budgets: BudgetConfig | null,
): SpendLine[] {
  if (group === 'phase')
    return groupBy(
      rows.filter(r => r.phase !== null),
      r => r.phase as SpendPhase,
      SPEND_PHASES,
    ).map(([phase, list]) => {
      const tickets = phase === 'build' || phase === 'review' ? ticketLines(list, titles) : []
      const total = totalOfRows(list)
      const budget =
        budgets === null || phase === 'between'
          ? NO_BUDGET
          : budgetMarkOf(total.usd, budgets.phaseUsd[phase], budgets, hasCost)
      return {
        key: `phase-${phase}`,
        label: phaseLabel(phase),
        text: lineText(total, hasCost, budget),
        ...levelOf(budget),
        ...(tickets.length > 0 && { children: tickets }),
      }
    })
  const keyOf =
    group === 'model' ? (r: PersonRow) => r.model : (r: PersonRow) => r.user ?? NO_USER_LABEL
  return groupBy(rows, keyOf)
    .map(([label, list]) => ({ label, total: totalOfRows(list) }))
    .sort((a, b) => (b.total.usd ?? 0) - (a.total.usd ?? 0) || b.total.fresh - a.total.fresh)
    .map(({ label, total }) => ({
      key: `${group}-${label}`,
      label,
      text: lineText(total, hasCost),
    }))
}

export function spendTabView(args: {
  group: SpendGroup
  hasCost: boolean
  active: FeatureKey | null
  features: readonly SpendFeatureInput[]
  /** Ticket titles of the active Feature, by ref, for its Build and Review lines. */
  titles?: Readonly<Record<IssueRef, string>>
  outside: readonly PersonRow[]
  skipped: readonly string[]
  /** The active Feature's budgets in force; absent, none applies. */
  budgets?: BudgetConfig
}): SpendTabView {
  const { group, hasCost, features } = args
  const spent = features.filter(f => f.rows.length > 0)
  const active = features.find(f => f.key === args.active) ?? null
  const others = spent
    .filter(f => f.key !== args.active)
    .map(f => ({ f, total: totalOfRows(f.rows) }))
    .sort(
      (a, b) =>
        Number(a.f.isArchived) - Number(b.f.isArchived) ||
        (b.total.usd ?? 0) - (a.total.usd ?? 0) ||
        b.total.fresh - a.total.fresh,
    )
    .map(({ f, total }) => ({
      key: f.key,
      title: f.title,
      text: lineText(total, hasCost),
      isArchived: f.isArchived,
    }))
  const outside = args.outside.length === 0 ? null : lineText(totalOfRows(args.outside), hasCost)
  const budgets = args.budgets ?? null
  const activeTotal = totalOfRows(active?.rows ?? [])
  const budget =
    budgets === null
      ? NO_BUDGET
      : budgetMarkOf(activeTotal.usd, budgets.featureUsd, budgets, hasCost)
  return {
    group,
    hasCost,
    active:
      active === null
        ? null
        : {
            key: active.key,
            title: active.title,
            text: active.rows.length === 0 ? null : lineText(activeTotal, hasCost, budget),
            level: budget.level,
            lines: lines(active.rows, group, hasCost, args.titles ?? {}, budgets),
          },
    others,
    outside,
    skipped: [...args.skipped],
  }
}
