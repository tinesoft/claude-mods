import type { Space } from 'claude-code'
import type { CraftoryConfig, PhaseId, SkillName } from '../types'
import type { Action } from './action'
import { budgetK, type AgentsView } from './build'
import type { Flow, PhaseView } from './evidence'
import { PHASE_ORDER, PHASES, type PhaseSpec } from './phases'
import { across, type Role, SPACE, PHASE_LOOKS } from './theme'
import { clip } from './ui'

export const TITLE_MAX = 24

export function phaseMeta(view: PhaseView, flow: Flow): string | null {
  const s = view.state
  switch (s.kind) {
    case 'done':
      if (view.phase === 'spec')
        return flow.feature.kind === 'specced' ? flow.feature.record.spec : null
      return view.phase === 'tickets' && flow.tickets.length > 0
        ? String(flow.tickets.length)
        : null
    case 'running':
      return s.progress
    case 'needs-you':
    case 'failed':
      return s.meta
    case 'over-budget':
      return `${s.ticket} · ${budgetK(s.budget)}`
    case 'next':
      return flow.feature.kind === 'specced' &&
        flow.feature.record.entry === view.phase &&
        flow.feature.record.enteredFrom !== null
        ? flow.feature.record.enteredFrom
        : null
    case 'gated':
    case 'skipped':
    case 'todo':
      return null
    default: {
      const _exhaustive: never = s
      return _exhaustive
    }
  }
}

export function focusPhase(flow: Flow): PhaseView {
  const pick = (phase: PhaseId | null) => flow.phases.find(s => s.phase === phase)
  return (
    pick(flow.current) ??
    pick(flow.next) ??
    [...flow.phases].reverse().find(s => s.state.kind === 'done') ??
    flow.phases[0]!
  )
}

/** The summary's three parts: the feature title, the focus phase's name and its count, if any. */
export function summaryParts(flow: Flow): { title: string; phase: string; count: string | null } {
  const view = focusPhase(flow)
  return { title: flow.title, phase: PHASES[view.phase].label, count: phaseMeta(view, flow) }
}

export function chipText(flow: Flow): string {
  const { title, phase, count } = summaryParts(flow)
  return `${clip(title, TITLE_MAX)} · ${phase}${count ? ` ${count}` : ''}`
}

export const GEAR_RESERVE = 3
const RICH_PHASE_EXTRA = 4

const phaseWidth = (view: PhaseView, flow: Flow, rich: boolean) => {
  const meta = phaseMeta(view, flow)
  return (
    2 +
    PHASES[view.phase].label.length +
    (meta ? 1 + meta.length : 0) +
    (rich ? RICH_PHASE_EXTRA : 0)
  )
}

const MIN_TITLE = 8
/** The gear draws one glyph; its gap is counted with the others. */
const GEAR_CELLS = 1
/**
 * Desktop draws UI text about 30% narrower than one code-font cell, the unit of `bodyColumns`
 * (probe: ten bordered steps measured 119 cells and fitted in 85).
 */
const RICH_CELL_SCALE = 0.7

export type RailFit = {
  /** `row` draws the rail, `chip` the summary in its place. */
  mode: 'row' | 'chip'
  titleMax: number
  /** The map chip draws its compact counts (`2✓ 4?`) so the row fits the terminal. */
  compactMap: boolean
  /** The row may wrap onto further lines (rich surfaces). */
  wrap: boolean
  /** Lines the rail takes in the band, for the card's height budget. */
  lines: number
}

/**
 * How the rail fits the band. Rich surfaces always draw the row and wrap it; the terminal draws
 * the row on one line when it fits in cells, first with the full map chip, then with the compact
 * one, and otherwise the summary.
 */
export function fitRail(args: {
  flow: Flow
  columns: number
  rich: boolean
  waiting: number
  features: number
  /** Cells of the map chip, full and compact; null with no map. */
  map: { full: number; compact: number } | null
}): RailFit {
  const { flow, columns, rich, waiting, features, map } = args
  const extra = rich ? RICH_PHASE_EXTRA : 0
  const gap = across(SPACE.railGap)
  const phases = flow.phases.reduce((sum, s) => sum + phaseWidth(s, flow, rich), 0)
  const connectors = flow.phases.length - 1
  // Inbox, the divider and the phases in the strip, then the title and the gear.
  const gaps = gap * (flow.phases.length + 3)
  const triage = 'Inbox'.length + (waiting > 0 ? 1 + String(waiting).length : 0) + extra
  const fixed = (mapCells: number | null) =>
    triage +
    1 +
    phases +
    connectors +
    GEAR_CELLS +
    gaps +
    (features > 1 ? 2 : 0) +
    (mapCells === null ? 0 : mapCells + extra + 1 + 2 * gap)
  if (rich) {
    const cells = fixed(map?.full ?? null) + Math.min(TITLE_MAX, flow.title.length) + extra
    const lines = Math.max(1, Math.ceil((cells * RICH_CELL_SCALE) / Math.max(1, columns)))
    return { mode: 'row', titleMax: TITLE_MAX, compactMap: false, wrap: true, lines }
  }
  const least = Math.min(MIN_TITLE, flow.title.length)
  const chips = map === null ? [null] : [map.full, map.compact]
  for (const [index, chip] of chips.entries()) {
    const titleMax = Math.min(TITLE_MAX, columns - fixed(chip))
    if (titleMax >= least)
      return { mode: 'row', titleMax, compactMap: index > 0, wrap: false, lines: 1 }
  }
  return { mode: 'chip', titleMax: 0, compactMap: false, wrap: false, lines: 1 }
}

/**
 * Every card's spacing, on every surface, however tall the card is: a card taller than the band
 * scrolls there, so a tall card (Build with its agents) never trades padding for height.
 */
export const CARD_SPACE = { padX: 'lg', padY: 'lg', gap: 'md' } as const satisfies {
  padX: Space
  padY: Space
  gap: Space
}

export type CardView = {
  kicker: string
  role: Role
  title: string
  why: string
  commands: string[]
  noCommand: string | null
  helpers: readonly SkillName[]
  artifactLabel: string | null
  artifact: string | null
  gate: string | null
  primary: { label: string; action: Action } | null
  secondary: { id: string; label: string; action: Action }[]
  agents: AgentsView | null
}

const TRIAGE_WHY =
  'Intake for work that comes from outside the flow: bug reports, requests and outside PRs. Triage labels each one. Ready-for-agent items then enter the flow at Align; a small bug can go straight to Build.'

export function triageCard(waiting: number): CardView {
  return {
    kicker: 'Entry point · outside the 7 phases',
    role: 'hook',
    title: 'Triage inbox',
    why: TRIAGE_WHY,
    commands: ['/triage'],
    noCommand: null,
    helpers: [],
    artifactLabel: 'Waiting',
    artifact: waiting > 0 ? `${waiting} new · labelled needs-triage` : 'Nothing waiting',
    gate: null,
    primary: { label: '/triage', action: { kind: 'run-phase', phase: 'triage' } },
    secondary: [],
    agents: null,
  }
}

type Secondary = CardView['secondary']

function secondaryOf(view: PhaseView, specRef: string | null, isDone: boolean): Secondary {
  const kind = view.state.kind
  if (view.phase === 'spec' && isDone && specRef !== null)
    return [{ id: 'open-spec', label: `Open ${specRef}`, action: { kind: 'open-tickets' } }]
  if (view.phase === 'tickets' && isDone)
    return [{ id: 'open-tickets', label: 'Open in panel', action: { kind: 'open-tickets' } }]
  if (view.phase === 'build' && (kind === 'failed' || kind === 'over-budget'))
    return [
      {
        id: 'diagnose',
        label: 'Diagnose',
        action: { kind: 'diagnose', about: 'Build is failing' },
      },
    ]
  if (view.phase === 'ship' && view.artifact !== null)
    return [{ id: 'pr', label: 'Rewrite the body with /pr', action: { kind: 'write-pr' } }]
  return []
}

const markDoneButton = (phase: PhaseId): Secondary => [
  { id: 'mark-done', label: 'Mark done', action: { kind: 'mark-done', phase } },
]

/** The buttons a phase offers, on its card and on its row of the Flow tab. */
export function phaseButtons(view: PhaseView, flow: Flow): Pick<CardView, 'primary' | 'secondary'> {
  const command =
    view.command === null ? null : `/${view.command}${view.args ? ` ${view.args}` : ''}`
  const isDone = view.state.kind === 'done'
  const specRef = flow.feature.kind === 'specced' ? flow.feature.record.spec : null
  return {
    primary:
      command === null
        ? null
        : {
            label: isDone ? `Re-run ${command}` : command,
            action: { kind: 'run-phase', phase: view.phase },
          },
    secondary: [
      ...secondaryOf(view, specRef, isDone),
      ...(view.canMarkDone ? markDoneButton(view.phase) : []),
    ],
  }
}

export function phaseCard(
  view: PhaseView,
  flow: Flow,
  config: CraftoryConfig,
  agents: AgentsView | null = null,
): CardView {
  const spec: PhaseSpec = PHASES[view.phase]
  const look = PHASE_LOOKS[view.state.kind]
  const next = PHASE_ORDER.slice(PHASE_ORDER.indexOf(view.phase) + 1).find(
    p => config.phases[p].enabled,
  )
  const gate =
    view.state.kind === 'gated'
      ? `Gated: ${view.state.blockers.join(', ') || `${PHASES[view.state.by].label} is not done`}. It still runs after you confirm.`
      : config.phases[view.phase].gate && next !== undefined
        ? `Gate on: if ${spec.label} is not done when ${PHASES[next].label} starts, Craftory asks you to confirm first.`
        : null
  return {
    kicker: `Phase ${spec.n} of ${PHASE_ORDER.length} · ${look.label}`,
    role: look.role,
    title: spec.label,
    why: spec.why,
    commands: view.command === null ? [] : [`/${view.command}`],
    noCommand: view.command === null ? `None to type. ${spec.startedBy ?? ''}`.trim() : null,
    helpers: spec.helpers,
    artifactLabel: view.artifact === null ? null : spec.artifactLabel,
    artifact: view.artifact,
    gate,
    ...phaseButtons(view, flow),
    agents: view.phase === 'build' ? agents : null,
  }
}
