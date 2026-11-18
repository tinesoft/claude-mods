/**
 * The Spend tab: what the active Feature cost, broken down by phase (tickets under Build and
 * Review), by model or by person, then every other Feature, archived ones last, then Outside
 * features and any spend file that could not be read. Pure: the shell gathers the rows.
 */
import type { FeatureKey, IssueRef, SpendPhase, SpendRow } from '../types'
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

/** A row with who ran the session it came from; null when that session's git had no email. */
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
  active: { key: FeatureKey; title: string; text: string | null; lines: SpendLine[] } | null
  others: SpendFeatureLine[]
  outside: string | null
  skipped: string[]
}

export const BETWEEN_LABEL = 'Between phases'
export const OUTSIDE_LABEL = 'Outside features'
export const NO_EMAIL_LABEL = 'No git email'

const SPEND_PHASES: readonly SpendPhase[] = [...PHASE_ORDER, 'between']

const phaseLabel = (p: SpendPhase) => (p === 'between' ? BETWEEN_LABEL : PHASES[p].label)

/** A line's figures: the card's Spend text, or bare fresh tokens for a total that spent little. */
const lineText = (total: SpendTotal, hasCost: boolean) => phaseSpendText(total, hasCost) ?? ''

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
): SpendLine[] {
  if (group === 'phase')
    return groupBy(
      rows.filter(r => r.phase !== null),
      r => r.phase as SpendPhase,
      SPEND_PHASES,
    ).map(([phase, list]) => {
      const tickets = phase === 'build' || phase === 'review' ? ticketLines(list, titles) : []
      return {
        key: `phase-${phase}`,
        label: phaseLabel(phase),
        text: lineText(totalOfRows(list), hasCost),
        ...(tickets.length > 0 && { children: tickets }),
      }
    })
  const keyOf =
    group === 'model' ? (r: PersonRow) => r.model : (r: PersonRow) => r.user ?? NO_EMAIL_LABEL
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
  return {
    group,
    hasCost,
    active:
      active === null
        ? null
        : {
            key: active.key,
            title: active.title,
            text: active.rows.length === 0 ? null : lineText(totalOfRows(active.rows), hasCost),
            lines: lines(active.rows, group, hasCost, args.titles ?? {}),
          },
    others,
    outside,
    skipped: [...args.skipped],
  }
}
