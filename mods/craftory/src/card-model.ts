import type { Space } from 'claude-code'
import type { CraftoryConfig, PhaseId, SkillName } from '../types'
import type { Action } from './action'
import { budgetK, hasMeterLine, hasWorktreeLine, type AgentRow, type AgentsView } from './build'
import type { Flow, Step } from './evidence'
import { PHASE_ORDER, PHASES, type PhaseSpec } from './phases'
import { across, down, type Role, SPACE, STEP_LOOKS } from './theme'
import { clip } from './ui'

export const TITLE_MAX = 24
const PROMPT_ROWS = 6

export function stepMeta(step: Step, flow: Flow): string | null {
  const s = step.state
  switch (s.kind) {
    case 'done':
      if (step.phase === 'spec')
        return flow.feature.kind === 'specced' ? flow.feature.record.spec : null
      return step.phase === 'tickets' && flow.tickets.length > 0
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
        flow.feature.record.entry === step.phase &&
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

export function focusStep(flow: Flow): Step {
  const pick = (phase: PhaseId | null) => flow.steps.find(s => s.phase === phase)
  return (
    pick(flow.current) ??
    pick(flow.next) ??
    [...flow.steps].reverse().find(s => s.state.kind === 'done') ??
    flow.steps[0]!
  )
}

export function chipText(flow: Flow): string {
  const step = focusStep(flow)
  const meta = stepMeta(step, flow)
  return `${clip(flow.title, TITLE_MAX)} · ${PHASES[step.phase].label}${meta ? ` ${meta}` : ''}`
}

export const GEAR_RESERVE = 3
const RICH_STEP_EXTRA = 4

const stepWidth = (step: Step, flow: Flow, rich: boolean) => {
  const meta = stepMeta(step, flow)
  return (
    2 +
    PHASES[step.phase].label.length +
    (meta ? 1 + meta.length : 0) +
    (rich ? RICH_STEP_EXTRA : 0)
  )
}

const MIN_TITLE = 8

export function fitRail(args: {
  flow: Flow
  columns: number
  rich: boolean
  waiting: number
  features: number
}): { mode: 'row' | 'chip'; titleMax: number } {
  const { flow, columns, rich, waiting, features } = args
  const steps = flow.steps.reduce((sum, s) => sum + stepWidth(s, flow, rich), 0)
  const connectors = flow.steps.length - 1
  const items = flow.steps.length + 3
  const triage =
    'Inbox'.length + (waiting > 0 ? 1 + String(waiting).length : 0) + (rich ? RICH_STEP_EXTRA : 0)
  const gaps = across(SPACE.railGap) * items
  const fixed = triage + 1 + steps + connectors + GEAR_RESERVE + gaps + (features > 1 ? 2 : 0)
  const titleMax = Math.min(TITLE_MAX, columns - fixed)
  return titleMax >= Math.min(MIN_TITLE, flow.title.length)
    ? { mode: 'row', titleMax }
    : { mode: 'chip', titleMax: 0 }
}

export type CardDensity = 'roomy' | 'compact'

export const CARD_SPACE = {
  roomy: { padX: 'lg', padY: 'lg', gap: 'md' },
  // `xs` is no row on the terminal, and a little air on desktop.
  compact: { padX: 'lg', padY: 'xs', gap: 'xs' },
} as const satisfies Record<CardDensity, { padX: Space; padY: Space; gap: Space }>

const DENSITIES = ['roomy', 'compact'] as const satisfies readonly CardDensity[]

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

function secondaryOf(step: Step, specRef: string | null, isDone: boolean): Secondary {
  const kind = step.state.kind
  if (step.phase === 'spec' && isDone && specRef !== null)
    return [{ id: 'open-spec', label: `Open ${specRef}`, action: { kind: 'open-tickets' } }]
  if (step.phase === 'tickets' && isDone)
    return [{ id: 'open-tickets', label: 'Open in panel', action: { kind: 'open-tickets' } }]
  if (step.phase === 'build' && (kind === 'failed' || kind === 'over-budget'))
    return [{ id: 'diagnose', label: 'Diagnose', action: { kind: 'diagnose' } }]
  if (step.phase === 'ship' && step.artifact !== null)
    return [{ id: 'pr', label: 'Rewrite the body with /pr', action: { kind: 'write-pr' } }]
  return []
}

const markDoneButton = (phase: PhaseId): Secondary => [
  { id: 'mark-done', label: 'Mark done', action: { kind: 'mark-done', phase } },
]

export function phaseCard(
  step: Step,
  flow: Flow,
  config: CraftoryConfig,
  agents: AgentsView | null = null,
): CardView {
  const spec: PhaseSpec = PHASES[step.phase]
  const look = STEP_LOOKS[step.state.kind]
  const next = PHASE_ORDER.slice(PHASE_ORDER.indexOf(step.phase) + 1).find(
    p => config.phases[p].enabled,
  )
  const gate =
    step.state.kind === 'gated'
      ? `Gated: ${step.state.blockers.join(', ') || `${PHASES[step.state.by].label} is not done`}. It still runs after you confirm.`
      : config.phases[step.phase].gate && next !== undefined
        ? `Gate on: if ${spec.label} is not done when ${PHASES[next].label} starts, Craftory asks you to confirm first.`
        : null
  const command =
    step.command === null ? null : `/${step.command}${step.args ? ` ${step.args}` : ''}`
  const isDone = step.state.kind === 'done'
  const specRef = flow.feature.kind === 'specced' ? flow.feature.record.spec : null
  return {
    kicker: `Phase ${spec.n} of ${PHASE_ORDER.length} · ${look.label}`,
    role: look.role,
    title: spec.label,
    why: spec.why,
    commands: step.command === null ? [] : [`/${step.command}`],
    noCommand: step.command === null ? `None to type. ${spec.startedBy ?? ''}`.trim() : null,
    helpers: spec.helpers,
    artifactLabel: step.artifact === null ? null : spec.artifactLabel,
    artifact: step.artifact,
    gate,
    primary:
      command === null
        ? null
        : {
            label: isDone ? `Re-run ${command}` : command,
            action: { kind: 'run-phase', phase: step.phase },
          },
    secondary: [
      ...secondaryOf(step, specRef, isDone),
      ...(step.canMarkDone ? markDoneButton(step.phase) : []),
    ],
    agents: step.phase === 'build' ? agents : null,
  }
}

const agentLines = (row: AgentRow) =>
  1 + (hasMeterLine(row) ? 1 : 0) + (hasWorktreeLine(row) ? 1 : 0)

export const agentsRows = (view: AgentsView) =>
  2 +
  view.rows.reduce((sum, row) => sum + agentLines(row), 0) +
  (view.more > 0 ? 1 : 0) +
  (view.note === null ? 0 : 1)

export function cardRows(card: CardView, columns: number, density: CardDensity): number {
  const space = CARD_SPACE[density]
  const inner = Math.max(10, columns - 2 - 2 * across(space.padX))
  const lines = (text: string | null) =>
    text === null ? 0 : Math.max(1, Math.ceil(text.length / inner))
  const parts = [
    1 + 1 + down(SPACE.lineGap),
    lines(card.why),
    1,
    card.helpers.length > 0 ? 1 : 0,
    card.artifact === null ? 0 : 1,
    card.agents === null ? 0 : agentsRows(card.agents),
    lines(card.gate),
    card.primary !== null || card.secondary.length > 0 ? 1 : 0,
  ].filter(n => n > 0)
  return (
    2 +
    2 * down(space.padY) +
    parts.reduce((a, b) => a + b, 0) +
    (parts.length - 1) * down(space.gap)
  )
}

const DESKTOP_PT = {
  line: 20.5,
  step: { xs: 6, sm: 9, md: 12, lg: 16, xl: 24 },
  border: 2,
  header: 36,
  whyLine: 20,
  whyPerCell: 1.2,
  row: 28,
  gateLine: 20,
  buttons: 36,
  band: 13,
  railRow: 36,
  agentsHead: 34,
  agentsFoot: 46,
  agentLine: 24,
  agentGap: 14,
  agentsNote: 34,
} as const

const points = (space: Space) => (typeof space === 'number' ? space : DESKTOP_PT.step[space])

const agentsPoints = (view: AgentsView) =>
  DESKTOP_PT.agentsHead +
  DESKTOP_PT.agentsFoot +
  view.rows.reduce(
    (sum, row) => sum + agentLines(row) * DESKTOP_PT.agentLine + DESKTOP_PT.agentGap,
    0,
  ) +
  (view.more > 0 ? DESKTOP_PT.agentLine : 0) +
  (view.note === null ? 0 : DESKTOP_PT.agentsNote)

/** Points the card takes on desktop, where the band shows `maxRows` lines whole and scrolls the rest. */
export function cardPoints(card: CardView, columns: number, density: CardDensity): number {
  const space = CARD_SPACE[density]
  const inner = Math.max(10, columns - 2 * across(space.padX))
  const wrapped = (text: string | null, perLine: number, line: number) =>
    text === null ? 0 : Math.max(1, Math.ceil(text.length / (inner * perLine))) * line
  const parts = [
    DESKTOP_PT.header,
    wrapped(card.why, DESKTOP_PT.whyPerCell, DESKTOP_PT.whyLine),
    DESKTOP_PT.row,
    card.helpers.length > 0 ? DESKTOP_PT.row : 0,
    card.artifact === null ? 0 : DESKTOP_PT.row + 16,
    card.agents === null ? 0 : agentsPoints(card.agents),
    wrapped(card.gate, DESKTOP_PT.whyPerCell, DESKTOP_PT.gateLine),
    card.primary !== null || card.secondary.length > 0 ? DESKTOP_PT.buttons : 0,
  ].filter(n => n > 0)
  return (
    DESKTOP_PT.border +
    2 * points(space.padY) +
    parts.reduce((a, b) => a + b, 0) +
    (parts.length - 1) * points(space.gap)
  )
}

export function fitCard(args: {
  card: CardView
  columns: number
  maxRows: number
  rich: boolean
  extraRows: number
}): CardDensity | undefined {
  const { card, columns, maxRows, rich, extraRows } = args
  return DENSITIES.find(density =>
    rich
      ? maxRows * DESKTOP_PT.line >=
        DESKTOP_PT.band +
          DESKTOP_PT.railRow +
          extraRows * DESKTOP_PT.line +
          points(SPACE.cardAbove) +
          cardPoints(card, columns, density)
      : maxRows >=
        PROMPT_ROWS + 1 + extraRows + down(SPACE.cardAbove) + cardRows(card, columns, density),
  )
}
