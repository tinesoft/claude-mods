import type { Color, ElementTable, RenderElement, RenderSurface, Space } from 'claude-code'
import type {
  CraftoryConfig,
  FeatureKey,
  IssueRef,
  PhaseId,
  RailLayout,
  SkillName,
  Tone,
} from '../types'
import {
  barPercent,
  barRole,
  elapsedText,
  hasMeterLine,
  hasWorktreeLine,
  kTokens,
  ROW_LABELS,
  type AgentRow,
  type AgentsView,
} from './build'
import type { Flow, Step } from './evidence'
import {
  helperSvg,
  hexOr,
  inboxSvg,
  lockSvg,
  noticeSvg,
  OFF_TRACK,
  spinnerSvg,
  stepSvg,
  type NoticeIcon,
} from './icons'
import type { NoticeAction, NoticeButton, NoticeView } from './notices'
import { PHASE_ORDER, PHASES, PLUGIN, type PhaseSpec } from './phases'
import {
  across,
  CONNECTOR,
  down,
  HOVER_MIX,
  mix,
  paint,
  type Role,
  ROW_ROLES,
  SPACE,
  SPINNER,
  SPINNER_ASCII,
  SPIN_MS,
  STEP_LOOKS,
  TOKENS,
  TRIPLES,
} from './theme'

/** `Svg` exists on every surface that draws rich (remote) elements, never on the terminal. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button' | 'Link'> & {
  Svg?: ElementTable<'desktop'>['Svg']
  /** Every surface but mobile has a text field. */
  Input?: ElementTable<'desktop'>['Input']
}

export const isRich = (ui: Ui) => ui.Svg !== undefined

export const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`

const TITLE_MAX = 24
const PROMPT_ROWS = 6
const ICON_PX = 14

const roleInk = (role: Role, tone: Tone | undefined) => {
  if (tone === undefined) {
    if (role === 'muted') return { dimColor: true }
    return role === 'neutral' ? {} : { color: paint(role, tone).fg }
  }
  return { color: paint(role, tone).fg }
}

const inkOf = (tone: Tone | undefined, key: 'ink' | 'ink2' | 'text2' | 'muted') =>
  tone === undefined
    ? key === 'ink' || key === 'ink2'
      ? {}
      : { dimColor: true }
    : { color: TOKENS[tone][key] }

const withTint = (tint: Color | undefined) => (tint === undefined ? {} : { backgroundColor: tint })

const Icon = ({
  ui,
  svg,
  alt,
  px = ICON_PX,
}: {
  ui: Ui
  svg: string
  alt: string
  px?: number
}) => {
  const { Svg } = ui
  return Svg && <Svg source={svg} alt={alt} width={px} height={px} />
}

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
      return `${s.ticket} · ${Math.round(s.budget / 1000)}k`
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

const glyphOf = (step: Step, frame: number, ascii: boolean) => {
  const look = STEP_LOOKS[step.state.kind]
  if (step.state.kind === 'running')
    return (ascii ? SPINNER_ASCII : SPINNER)[frame % SPINNER.length]!
  return ascii ? look.ascii : look.glyph
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

const RICH_STEP_EXTRA = 4
const GEAR_RESERVE = 3

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

const CARD_SPACE = {
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
  primary: { label: string; phase: PhaseId | 'triage' } | null
  secondary: (
    | { id: string; label: string; action: 'open-tickets' | 'diagnose' | 'pr' }
    | { id: string; label: string; action: 'mark-done'; phase: PhaseId }
  )[]
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
    primary: { label: '/triage', phase: 'triage' },
    secondary: [],
    agents: null,
  }
}

type Secondary = CardView['secondary']

function secondaryOf(step: Step, specRef: string | null, isDone: boolean): Secondary {
  const kind = step.state.kind
  if (step.phase === 'spec' && isDone && specRef !== null)
    return [{ id: 'open-spec', label: `Open ${specRef}`, action: 'open-tickets' }]
  if (step.phase === 'tickets' && isDone)
    return [{ id: 'open-tickets', label: 'Open in panel', action: 'open-tickets' }]
  if (step.phase === 'build' && (kind === 'failed' || kind === 'over-budget'))
    return [{ id: 'diagnose', label: 'Diagnose', action: 'diagnose' }]
  if (step.phase === 'ship' && step.artifact !== null)
    return [{ id: 'pr', label: 'Rewrite the body with /pr', action: 'pr' }]
  return []
}

const markDoneButton = (phase: PhaseId): Secondary => [
  { id: 'mark-done', label: 'Mark done', action: 'mark-done', phase },
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
        : { label: isDone ? `Re-run ${command}` : command, phase: step.phase },
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

export type FeatureChoice = { key: FeatureKey; title: string; isActive: boolean }

export type BandActions = {
  step: (phase: PhaseId, fitsCard: boolean) => void
  triage: (fitsCard: boolean) => void
  summary: () => void
  gear: () => void
  run: (phase: PhaseId | 'triage') => void
  openTickets: () => void
  closeCard: () => void
  pickFeature: () => void
  switchFeature: (key: FeatureKey) => void
  notice: (action: NoticeAction) => void
  pauseAll: () => void
  openPanel: () => void
  raiseBudget: (ticket: IssueRef) => void
  diagnose: () => void
  writePr: () => void
  markDone: (phase: PhaseId) => void
}

export type BandArgs = {
  ui: Ui
  surface: RenderSurface
  columns: number
  maxRows: number
  tone: Tone | undefined
  ascii: boolean
  spinFrame: number
  below: RenderElement | undefined
  layout: RailLayout
  flow: Flow | null
  config: CraftoryConfig
  waiting: number
  agents: AgentsView | null
  notices: readonly NoticeView[]
  open: PhaseId | 'triage' | null
  features: readonly FeatureChoice[]
  isPickingFeature: boolean
  on: BandActions
}

export const spinFrameOf = (now: number) => Math.floor(now / SPIN_MS)

const NOTICE_GLYPH: Record<Role, string> = {
  hook: '!',
  danger: '!',
  skill: '>',
  perm: '>',
  neutral: '>',
  muted: '>',
}

const noticeIcon = (notice: NoticeView): NoticeIcon =>
  notice.isBusy ? 'busy' : notice.role === 'hook' || notice.role === 'danger' ? 'warn' : 'info'

type NoticeArgs = {
  ui: Ui
  tone: Tone | undefined
  notice: NoticeView
  on: (action: NoticeAction) => void
}

const NoticeLabel = ({ ui, notice, color }: { ui: Ui; notice: NoticeView; color: string }) => {
  const { Text } = ui
  const at = notice.text.indexOf(PLUGIN)
  if (at === -1) return <Text color={color}>{notice.text}</Text>
  const rich = ui.Svg !== undefined
  return (
    <Text color={color}>
      {notice.text.slice(0, at)}
      <Text color={color} mono={rich}>
        {PLUGIN}
      </Text>
      {notice.text.slice(at + PLUGIN.length)}
    </Text>
  )
}

const NoticeButtonView = ({
  ui,
  tone,
  button,
  on,
}: Omit<NoticeArgs, 'notice'> & { button: NoticeButton }) => {
  const { Box, Button, Text } = ui
  const key = `notice-${button.id}`
  if (ui.Svg === undefined || tone === undefined) {
    return (
      <Button key={key} plain onPress={() => on(button.action)}>
        <Text
          bold={button.primary === true}
          {...(tone === undefined ? {} : { color: TOKENS[tone].ink })}
        >
          {button.primary ? `[ ${button.label} ]` : button.label}
        </Text>
      </Button>
    )
  }
  const t = TOKENS[tone]
  return (
    <Box
      key={`${key}-box`}
      paddingX={SPACE.buttonPadX}
      borderStyle="round"
      borderColor={button.primary ? t.inverseBg : t.line}
      backgroundColor={button.primary ? t.inverseBg : t.surface}
    >
      <Button key={key} plain onPress={() => on(button.action)}>
        <Text color={button.primary ? t.onInk : t.ink}>{button.label}</Text>
      </Button>
    </Box>
  )
}

export const NoticeRow = ({ ui, tone, notice, on }: NoticeArgs) => {
  const { Box, Text, Svg } = ui
  const colours = paint(notice.role, tone)
  const lead = Svg ? (
    <Svg source={noticeSvg(noticeIcon(notice), hexOr(colours.fg))} alt="" width={14} height={14} />
  ) : (
    <Text color={colours.fg}>{NOTICE_GLYPH[notice.role]}</Text>
  )
  return (
    <Box
      key={`notice-${notice.id}`}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.noticeGap}
      paddingX={SPACE.noticePadX}
      borderStyle="round"
      {...(colours.bd !== undefined && { borderColor: colours.bd })}
      {...(colours.bg !== undefined && { backgroundColor: colours.bg })}
    >
      {lead}
      <Box flexGrow={1}>
        <NoticeLabel ui={ui} notice={notice} color={colours.fg} />
      </Box>
      {notice.actions.map(button => (
        <NoticeButtonView key={button.id} ui={ui} tone={tone} button={button} on={on} />
      ))}
    </Box>
  )
}

type RailArgs = BandArgs & { flow: Flow; titleMax: number }

const Connector = ({
  ui,
  tone,
  ascii,
  before,
}: {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  before: Step
}) => {
  const { Text } = ui
  const isDone = before.state.kind === 'done'
  const color = isDone
    ? tone === undefined
      ? paint('perm', tone).fg
      : TRIPLES.perm[tone].bd
    : tone === undefined
      ? undefined
      : TOKENS[tone].line
  return (
    <Text
      key={`connector-${before.phase}`}
      {...(color !== undefined && { color })}
      {...(color === undefined && { dimColor: true })}
    >
      {ascii ? CONNECTOR.ascii : CONNECTOR.glyph}
    </Text>
  )
}

const stepIcon = (step: Step, frame: number, color: string, track: string) =>
  step.state.kind === 'running'
    ? spinnerSvg(frame, hexOr(color), track)
    : stepSvg(step.state.kind === 'next' ? 'next' : step.state.kind, hexOr(color))

type StepArgs = Pick<RailArgs, 'ui' | 'tone' | 'ascii' | 'spinFrame' | 'flow' | 'open'> & {
  on: Pick<BandActions, 'step'>
}

const StepButton = ({ args, step, fits }: { args: StepArgs; step: Step; fits: boolean }) => {
  const { ui, tone, ascii, spinFrame, flow, open, on } = args
  const { Box, Button, Text } = ui
  const look = STEP_LOOKS[step.state.kind]
  const colours = paint(look.role, tone)
  const meta = stepMeta(step, flow)
  const isOpen = open === step.phase
  const label = PHASES[step.phase].label
  const rich = isRich(ui) && tone !== undefined
  const labelInk =
    step.state.kind === 'done'
      ? inkOf(tone, 'ink')
      : step.state.kind === 'gated' || step.state.kind === 'todo'
        ? inkOf(tone, 'text2')
        : roleInk(look.role, tone)
  const ink = {
    ...labelInk,
    bold: look.bold,
    ...(look.strike && { strikethrough: true }),
  }
  const press = () => on.step(step.phase, fits)
  if (!rich) {
    return (
      <Button key={`step-${step.phase}`} plain onPress={press}>
        <Text
          {...roleInk(look.role, tone)}
          bold={look.bold}
        >{`${glyphOf(step, spinFrame, ascii)} `}</Text>
        <Text {...ink} underline={isOpen}>
          {label}
        </Text>
        {meta !== null && <Text {...inkOf(tone, 'text2')}>{` ${meta}`}</Text>}
      </Button>
    )
  }
  const t = TOKENS[tone]
  const selected = isOpen
  return (
    <Box
      key={`box-step-${step.phase}`}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.stepGap}
      paddingX={SPACE.stepPadX}
      borderStyle="round"
      borderColor={selected ? t.lineStrong : t.surface}
      backgroundColor={selected ? t.fill : t.surface}
      hover={{ backgroundColor: mix(t.surface, colours.fg, HOVER_MIX) }}
    >
      <Icon ui={ui} svg={stepIcon(step, spinFrame, colours.fg, OFF_TRACK)} alt={look.label} />
      <Button key={`step-${step.phase}`} plain onPress={press}>
        <Text {...ink}>{label}</Text>
      </Button>
      {meta !== null && (
        <Text
          mono
          size="caption"
          color={t.text2}
          backgroundColor={mix(t.surface, t.countBg.base, t.countBg.alpha)}
        >
          {` ${meta} `}
        </Text>
      )}
    </Box>
  )
}

type TriageArgs = Pick<RailArgs, 'ui' | 'tone' | 'waiting' | 'open'> & {
  on: Pick<BandActions, 'triage'>
}

const TriageButton = ({ args, fits }: { args: TriageArgs; fits: boolean }) => {
  const { ui, tone, waiting, open, on } = args
  const { Box, Button, Text } = ui
  const isOpen = open === 'triage'
  const label = waiting > 0 ? `Inbox ${waiting}` : 'Inbox'
  const rich = isRich(ui) && tone !== undefined
  if (!rich) {
    return (
      <Button key="triage" plain onPress={() => on.triage(fits)}>
        <Text {...roleInk('hook', tone)} underline={isOpen}>
          {label}
        </Text>
      </Button>
    )
  }
  const t = TOKENS[tone]
  const hook = TRIPLES.hook[tone]
  return (
    <Box
      key="box-triage"
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.stepGap}
      paddingX={SPACE.stepPadX}
      borderStyle="dashed"
      borderColor={isOpen ? hook.fg : t.lineDashed}
      backgroundColor={isOpen ? t.fill : t.surface}
    >
      <Icon ui={ui} svg={inboxSvg(hexOr(t.ink2))} alt="Inbox" />
      <Button key="triage" plain onPress={() => on.triage(fits)}>
        <Text color={t.ink2}>Inbox</Text>
      </Button>
      {waiting > 0 && (
        <Text mono bold size="caption" color={hook.fg} backgroundColor={hook.bg}>
          {` ${waiting} `}
        </Text>
      )}
    </Box>
  )
}

const Gear = ({ args }: { args: BandArgs }) => {
  const { ui, tone, on } = args
  const { Button, Text } = ui
  return (
    <Button key="gear" plain onPress={() => on.gear()}>
      <Text {...inkOf(tone, 'text2')}>{'\u2699'}</Text>
    </Button>
  )
}

const Title = ({ args, flow }: { args: RailArgs; flow: Flow }) => {
  const { ui, tone, features, isPickingFeature, on } = args
  const { Button, Text } = ui
  const text = clip(flow.title, args.titleMax)
  if (features.length < 2) {
    return (
      <Text key="title" bold {...inkOf(tone, 'ink')}>
        {text}
      </Text>
    )
  }
  return (
    <Button key="title-switch" plain onPress={() => on.pickFeature()}>
      <Text bold underline={isPickingFeature} {...inkOf(tone, 'ink')}>
        {`${text} ▾`}
      </Text>
    </Button>
  )
}

const FeaturePicker = ({ args }: { args: BandArgs }) => {
  const { ui, tone, features, on } = args
  const { Box, Button, Text } = ui
  return (
    <Box key="feature-picker" flexDirection="row" columnGap={SPACE.pickerGap}>
      {features.map(feature => (
        <Button key={`feature-${feature.key}`} plain onPress={() => on.switchFeature(feature.key)}>
          <Text bold={feature.isActive} underline={feature.isActive} {...inkOf(tone, 'ink2')}>
            {clip(feature.title, TITLE_MAX)}
          </Text>
        </Button>
      ))}
    </Box>
  )
}

const Rail = ({ args, fits }: { args: RailArgs; fits: (phase: PhaseId | 'triage') => boolean }) => {
  const { ui, tone, flow } = args
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  return (
    <Box
      key="rail"
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      columnGap={SPACE.railGap}
      {...(rich && {
        borderStyle: 'round' as const,
        borderColor: TOKENS[tone].line,
        backgroundColor: TOKENS[tone].surface,
        paddingX: SPACE.railPadX,
      })}
    >
      <Box flexDirection="row" alignItems="center" columnGap={SPACE.railGap}>
        <TriageButton args={args} fits={fits('triage')} />
        <Text
          key="divider"
          {...(tone === undefined ? { dimColor: true } : { color: TOKENS[tone].line })}
        >
          {'│'}
        </Text>
        {flow.steps.map((step, index) => (
          <Box key={`group-${step.phase}`} flexDirection="row" alignItems="center">
            {index > 0 && (
              <Connector ui={ui} tone={tone} ascii={args.ascii} before={flow.steps[index - 1]!} />
            )}
            <StepButton args={args} step={step} fits={fits(step.phase)} />
          </Box>
        ))}
        <Title args={args} flow={flow} />
      </Box>
      <Gear args={args} />
    </Box>
  )
}

const Summary = ({ args, flow }: { args: RailArgs; flow: Flow }) => {
  const { ui, tone, columns, on } = args
  const { Box, Button, Text } = ui
  const step = focusStep(flow)
  const look = STEP_LOOKS[step.state.kind]
  const colours = paint(look.role, tone)
  const rich = isRich(ui) && tone !== undefined
  const text = clip(chipText(flow), Math.max(10, columns - GEAR_RESERVE - 6))
  return (
    <Box
      key="summary-row"
      flexDirection="row"
      justifyContent="space-between"
      columnGap={SPACE.railGap}
    >
      <Box
        key="summary-chip"
        flexDirection="row"
        alignItems="center"
        columnGap={SPACE.stepGap}
        {...(rich && {
          paddingX: SPACE.summaryGap,
          borderStyle: 'round' as const,
          borderColor: TOKENS[tone].line,
          backgroundColor: TOKENS[tone].surface,
        })}
      >
        {rich ? (
          <Icon
            ui={ui}
            svg={stepIcon(step, args.spinFrame, colours.fg, OFF_TRACK)}
            alt={look.label}
          />
        ) : (
          <Text
            {...roleInk(look.role, tone)}
          >{`${glyphOf(step, args.spinFrame, args.ascii)} `}</Text>
        )}
        <Button key="summary" plain onPress={() => on.summary()}>
          <Text {...inkOf(tone, 'ink')} bold>
            {text}
          </Text>
        </Button>
      </Box>
      <Gear args={args} />
    </Box>
  )
}

export const PaneRail = ({
  ui,
  tone,
  ascii,
  spinFrame,
  flow,
  waiting,
  on,
}: Pick<RailArgs, 'ui' | 'tone' | 'ascii' | 'spinFrame' | 'flow' | 'waiting'> & {
  on: Pick<BandActions, 'step' | 'triage'>
}) => {
  const { Box, Text } = ui
  const args = { ui, tone, ascii, spinFrame, flow, waiting, open: null, on }
  return (
    <Box
      key="pane-rail"
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      columnGap={SPACE.railGap}
    >
      <TriageButton args={args} fits={false} />
      <Text
        key="divider"
        {...(tone === undefined ? { dimColor: true } : { color: TOKENS[tone].line })}
      >
        {'│'}
      </Text>
      {flow.steps.map((step, index) => (
        <Box key={`group-${step.phase}`} flexDirection="row" alignItems="center">
          {index > 0 && (
            <Connector ui={ui} tone={tone} ascii={ascii} before={flow.steps[index - 1]!} />
          )}
          <StepButton args={args} step={step} fits={false} />
        </Box>
      ))}
    </Box>
  )
}

const CommandChip = ({ ui, tone, text }: { ui: Ui; tone: Tone | undefined; text: string }) => {
  const { Box, Text } = ui
  if (!isRich(ui) || tone === undefined) return <Text bold>{text}</Text>
  const t = TOKENS[tone]
  return (
    <Box key={`cmd-${text}`} paddingX={SPACE.chipPadX} backgroundColor={t.inverseBg}>
      <Text mono color={t.onInk}>
        {text}
      </Text>
    </Box>
  )
}

const HelperChip = ({ ui, tone, text }: { ui: Ui; tone: Tone | undefined; text: string }) => {
  const { Box, Text } = ui
  if (!isRich(ui) || tone === undefined) return <Text {...roleInk('skill', tone)}>{text}</Text>
  const skill = TRIPLES.skill[tone]
  return (
    <Box
      key={`helper-${text}`}
      flexDirection="row"
      columnGap={SPACE.chipGap}
      paddingX={SPACE.chipPadX}
      borderStyle="round"
      borderColor={skill.bd}
      backgroundColor={skill.bg}
    >
      <Icon ui={ui} svg={helperSvg(hexOr(skill.fg))} alt="" px={12} />
      <Text mono color={skill.fg}>
        {text}
      </Text>
    </Box>
  )
}

const CardRow = ({
  ui,
  tone,
  label,
  children,
}: {
  ui: Ui
  tone: Tone | undefined
  label: string
  children: RenderElement
}) => {
  const { Box, Text } = ui
  return (
    <Box key={`row-${label}`} flexDirection="row" columnGap={SPACE.rowLabelGap} flexWrap="wrap">
      <Box width={9}>
        <Text {...inkOf(tone, 'muted')}>{label}</Text>
      </Box>
      <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexWrap="wrap" flexShrink={1}>
        {[children]}
      </Box>
    </Box>
  )
}

const BAR_CELLS = { terminal: 12, rich: 16 } as const
const BAR_GLYPHS = { full: '█', empty: '░', fullAscii: '#', emptyAscii: '-' } as const

type AgentArgs = {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  on: Pick<BandActions, 'raiseBudget' | 'diagnose'>
}

const StatusBadge = ({ ui, tone, row }: Pick<AgentArgs, 'ui' | 'tone'> & { row: AgentRow }) => {
  const { Box, Text } = ui
  const role = ROW_ROLES[row.status]
  const colours = paint(role, tone)
  const label = ROW_LABELS[row.status]
  if (!isRich(ui) || tone === undefined) {
    return (
      <Text bold {...roleInk(role, tone)}>
        {`[${label}]`}
      </Text>
    )
  }
  return (
    <Box
      key={`agent-status-${row.ref}`}
      paddingX={SPACE.chipPadX}
      borderStyle="round"
      {...(colours.bd !== undefined && { borderColor: colours.bd })}
      backgroundColor={colours.bg ?? TOKENS[tone].fill}
    >
      <Text bold color={colours.fg}>
        {label}
      </Text>
    </Box>
  )
}

const TokenBar = ({ ui, tone, ascii, row }: Omit<AgentArgs, 'on'> & { row: AgentRow }) => {
  const { Box, Text } = ui
  const colour = paint(barRole(row), tone).fg
  const pct = barPercent(row)
  if (isRich(ui) && tone !== undefined) {
    return (
      <Box key={`agent-bar-${row.ref}`} width={BAR_CELLS.rich} backgroundColor={TOKENS[tone].fill2}>
        <Box key={`agent-bar-fill-${row.ref}`} width={`${pct}%`} backgroundColor={colour}>
          <Text backgroundColor={colour}> </Text>
        </Box>
      </Box>
    )
  }
  const cells = BAR_CELLS.terminal
  const filled = pct === 0 ? 0 : Math.min(cells, Math.max(1, Math.round((pct / 100) * cells)))
  return (
    <Box key={`agent-bar-${row.ref}`} flexDirection="row">
      <Text color={colour}>{(ascii ? BAR_GLYPHS.fullAscii : BAR_GLYPHS.full).repeat(filled)}</Text>
      <Text dimColor>
        {(ascii ? BAR_GLYPHS.emptyAscii : BAR_GLYPHS.empty).repeat(cells - filled)}
      </Text>
    </Box>
  )
}

export const CardButton = ({
  ui,
  tone,
  id,
  label,
  onPress,
}: Pick<AgentArgs, 'ui' | 'tone'> & {
  id: string
  label: string
  onPress: (surface: RenderSurface) => void
}) => {
  const { Box, Button, Text } = ui
  if (!isRich(ui) || tone === undefined) {
    return (
      <Button key={id} plain onPress={press => onPress(press.surface)}>
        <Text {...inkOf(tone, 'ink')}>{`[ ${label} ]`}</Text>
      </Button>
    )
  }
  const t = TOKENS[tone]
  return (
    <Box
      key={`${id}-box`}
      paddingX={SPACE.buttonPadX}
      borderStyle="round"
      borderColor={t.line}
      backgroundColor={t.surface}
    >
      <Button key={id} plain onPress={press => onPress(press.surface)}>
        <Text color={t.ink}>{label}</Text>
      </Button>
    </Box>
  )
}

const AgentRowView = ({ ui, tone, ascii, on, row }: AgentArgs & { row: AgentRow }) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  const stepInk =
    row.status === 'over' || row.status === 'failed'
      ? roleInk('danger', tone)
      : row.status === 'running' || row.status === 'near'
        ? inkOf(tone, 'ink2')
        : inkOf(tone, 'muted')
  return (
    <Box key={`agent-${row.ref}`} flexDirection="column" rowGap={SPACE.agentLineGap}>
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.rowLabelGap}>
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexShrink={1} minWidth={0}>
          <Text mono={rich} {...inkOf(tone, 'muted')}>
            {row.ref}
          </Text>
          <Text bold wrap="truncate-end" {...inkOf(tone, 'ink')}>
            {row.title}
          </Text>
        </Box>
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap} alignItems="center">
          {row.status === 'over' && (
            <CardButton
              ui={ui}
              tone={tone}
              id={`agent-raise-${row.ref}`}
              label="Raise budget"
              onPress={() => on.raiseBudget(row.ref)}
            />
          )}
          {row.status === 'failed' && (
            <CardButton
              ui={ui}
              tone={tone}
              id={`agent-diagnose-${row.ref}`}
              label="Diagnose"
              onPress={() => on.diagnose()}
            />
          )}
          <StatusBadge ui={ui} tone={tone} row={row} />
        </Box>
      </Box>
      {hasMeterLine(row) && (
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap} alignItems="center">
          {row.step !== null && (
            <Text mono={rich} wrap="truncate-end" {...stepInk}>
              {row.step}
            </Text>
          )}
          <Box flexGrow={1} />
          {row.tokens > 0 && <TokenBar ui={ui} tone={tone} ascii={ascii} row={row} />}
          <Text mono={rich} {...inkOf(tone, 'text2')}>
            {`${kTokens(row.tokens)} · ${elapsedText(row.elapsedMs)}`}
          </Text>
        </Box>
      )}
      {hasWorktreeLine(row) && (
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexWrap="wrap">
          {row.worktree !== null && (
            <Text mono={rich} {...inkOf(tone, 'ink2')}>
              {row.worktree}
            </Text>
          )}
          {row.branch !== null && (
            <Text
              mono={rich}
              {...inkOf(tone, 'text2')}
              {...(t !== undefined && rich && { backgroundColor: t.fill })}
            >
              {row.branch}
            </Text>
          )}
          {row.added !== null && (
            <Text mono={rich} {...roleInk('perm', tone)}>{`+${row.added}`}</Text>
          )}
          {row.deleted !== null && (
            <Text mono={rich} {...roleInk('danger', tone)}>{`−${row.deleted}`}</Text>
          )}
          {row.commits !== null && (
            <Text mono={rich} {...inkOf(tone, 'muted')}>
              {row.commits}
            </Text>
          )}
          {row.note !== null && <Text {...inkOf(tone, 'muted')}>{row.note}</Text>}
        </Box>
      )}
    </Box>
  )
}

export const AgentsList = ({
  ui,
  tone,
  ascii,
  view,
  on,
}: AgentArgs & {
  view: AgentsView
  on: Pick<BandActions, 'raiseBudget' | 'diagnose' | 'pauseAll' | 'openPanel'>
}) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  const skill = paint('skill', tone)
  return (
    <Box
      key="agents"
      flexDirection="column"
      rowGap={SPACE.agentsGap}
      {...(t !== undefined &&
        rich && {
          borderStyle: 'round' as const,
          borderColor: t.line,
          paddingX: SPACE.agentsPadX,
          paddingY: SPACE.agentsPadY,
        })}
    >
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.rowLabelGap}>
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap}>
          <Text color={skill.fg}>{rich ? '●' : ascii ? '*' : '●'}</Text>
          <Text bold {...inkOf(tone, 'ink')}>
            Agents
          </Text>
          <Text {...inkOf(tone, 'text2')}>{view.summary}</Text>
        </Box>
        <Text mono={rich} {...inkOf(tone, 'text2')}>
          {view.tokens}
        </Text>
      </Box>
      {view.note !== null && (
        <Box
          key="agents-note"
          flexDirection="row"
          columnGap={SPACE.gateGap}
          paddingX={SPACE.gatePadX}
          {...(tone !== undefined && {
            borderStyle: 'round' as const,
            borderColor: TRIPLES.hook[tone].bd,
            backgroundColor: TRIPLES.hook[tone].bg,
          })}
        >
          <Text {...roleInk('hook', tone)}>{'!'}</Text>
          <Text wrap="wrap" {...roleInk('hook', tone)}>
            {view.note}
          </Text>
        </Box>
      )}
      {view.rows.map(row => (
        <AgentRowView key={row.ref} ui={ui} tone={tone} ascii={ascii} on={on} row={row} />
      ))}
      {view.more > 0 && (
        <Text {...inkOf(tone, 'muted')}>{`and ${view.more} more · Open panel`}</Text>
      )}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        columnGap={SPACE.rowLabelGap}
      >
        <Box flexShrink={1} minWidth={0}>
          <Text size="footnote" wrap="truncate-end" {...inkOf(tone, 'muted')}>
            {view.footer}
          </Text>
        </Box>
        <Box flexDirection="row" columnGap={SPACE.buttonsGap}>
          <CardButton
            ui={ui}
            tone={tone}
            id="agents-pause"
            label={view.isPaused ? 'Resume' : 'Pause all'}
            onPress={() => on.pauseAll()}
          />
          <CardButton
            ui={ui}
            tone={tone}
            id="agents-open-panel"
            label="Open panel"
            onPress={() => on.openPanel()}
          />
        </Box>
      </Box>
    </Box>
  )
}

export const DetailCard = ({
  ui,
  tone,
  card,
  density,
  on,
  ascii = false,
}: {
  ui: Ui
  tone: Tone | undefined
  card: CardView
  density: CardDensity
  on: Pick<
    BandActions,
    | 'closeCard'
    | 'run'
    | 'openTickets'
    | 'pauseAll'
    | 'openPanel'
    | 'raiseBudget'
    | 'diagnose'
    | 'writePr'
    | 'markDone'
  >
  ascii?: boolean
}) => {
  const { Box, Button, Text } = ui
  const space = CARD_SPACE[density]
  const rich = isRich(ui) && tone !== undefined
  const surface = rich ? TOKENS[tone].surface : undefined
  const colours = paint(card.role, tone)
  const t = tone === undefined ? undefined : TOKENS[tone]
  return (
    <Box
      key="card"
      flexDirection="column"
      borderStyle="round"
      borderColor={t === undefined ? colours.fg : t.line}
      paddingX={space.padX}
      paddingY={space.padY}
      rowGap={space.gap}
      {...withTint(surface)}
    >
      <Box flexDirection="column" rowGap={SPACE.lineGap}>
        <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.cardHeadGap}>
          <Box flexShrink={1} minWidth={0}>
            <Text mono size="caption" color={colours.fg} wrap="truncate-end" {...withTint(surface)}>
              {card.kicker}
            </Text>
          </Box>
          <Button key="close" plain hotkey="x" label="Close" onPress={() => on.closeCard()} />
        </Box>
        <Text bold size={rich ? 'heading' : 'body'} {...inkOf(tone, 'ink')} {...withTint(surface)}>
          {card.title}
        </Text>
      </Box>
      <Text {...inkOf(tone, 'ink2')} {...withTint(surface)}>
        {card.why}
      </Text>
      <Box flexDirection="column" rowGap={SPACE.lineGap}>
        <CardRow ui={ui} tone={tone} label="Command">
          {card.noCommand !== null ? (
            <Text {...inkOf(tone, 'text2')}>{card.noCommand}</Text>
          ) : (
            <>
              {card.commands.map(c => (
                <CommandChip key={c} ui={ui} tone={tone} text={c} />
              ))}
            </>
          )}
        </CardRow>
        {card.helpers.length > 0 && (
          <CardRow ui={ui} tone={tone} label="Helpers">
            <>
              {card.helpers.map(helper => (
                <HelperChip key={helper} ui={ui} tone={tone} text={helper} />
              ))}
            </>
          </CardRow>
        )}
      </Box>
      {card.artifact !== null && (
        <Box key="artifact" flexDirection="column" paddingX={SPACE.chipPadX} {...withTint(t?.tile)}>
          <Text size="footnote" {...inkOf(tone, 'muted')} {...withTint(t?.tile)}>
            {card.artifactLabel ?? ''}
          </Text>
          <Text bold size="footnote" {...inkOf(tone, 'ink')} {...withTint(t?.tile)}>
            {card.artifact}
          </Text>
        </Box>
      )}
      {card.agents !== null && (
        <AgentsList ui={ui} tone={tone} ascii={ascii} view={card.agents} on={on} />
      )}
      {card.gate !== null && (
        <Box
          key="gate-line"
          flexDirection="row"
          columnGap={SPACE.gateGap}
          paddingX={SPACE.gatePadX}
          {...(tone !== undefined && {
            borderStyle: 'round' as const,
            borderColor: TRIPLES.hook[tone].bd,
            backgroundColor: TRIPLES.hook[tone].bg,
          })}
        >
          {rich ? (
            <Icon ui={ui} svg={lockSvg(hexOr(TRIPLES.hook[tone].fg))} alt="" />
          ) : (
            <Text {...roleInk('hook', tone)}>{'!'}</Text>
          )}
          <Text
            wrap="wrap"
            {...roleInk('hook', tone)}
            {...withTint(rich ? TRIPLES.hook[tone].bg : undefined)}
          >
            {card.gate}
          </Text>
        </Box>
      )}
      {(card.primary !== null || card.secondary.length > 0) && (
        <Box flexDirection="row" columnGap={SPACE.buttonsGap}>
          {card.primary !== null && (
            <Button
              key="primary"
              hotkey="r"
              label={`r: ${card.primary.label}`}
              onPress={() => on.run(card.primary!.phase)}
            />
          )}
          {card.secondary.map(button => (
            <Button
              key={button.id}
              label={button.label}
              onPress={() => {
                if (button.action === 'diagnose') on.diagnose()
                else if (button.action === 'pr') on.writePr()
                else if (button.action === 'mark-done') on.markDone(button.phase)
                else on.openTickets()
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

export function renderBand(args: BandArgs) {
  const { ui, columns, maxRows, tone, below, layout, flow, config, waiting, notices, open, on } =
    args
  const { Box } = ui
  const replacing = notices.find(n => n.replacesRail)
  const above = notices.filter(n => !n.replacesRail)
  const noticeRows = (list: readonly NoticeView[]) =>
    list.map(n => <NoticeRow key={n.id} ui={ui} tone={tone} notice={n} on={on.notice} />)
  if (replacing !== undefined || flow === null) {
    return (
      <Box flexDirection="column">
        {below}
        {noticeRows(replacing ? [replacing] : above)}
      </Box>
    )
  }
  const rail = fitRail({ flow, columns, rich: isRich(ui), waiting, features: args.features.length })
  const asChip = layout === 'summary' || rail.mode === 'chip'
  const cardOf = (phase: PhaseId | 'triage'): CardView =>
    phase === 'triage'
      ? triageCard(waiting)
      : phaseCard(
          flow.steps.find(s => s.phase === phase)!,
          flow,
          config,
          args.agents,
        )
  const extraRows = above.length + (args.isPickingFeature ? 1 : 0)
  const fits = (phase: PhaseId | 'triage') =>
    fitCard({ card: cardOf(phase), columns, maxRows, rich: isRich(ui), extraRows }) !== undefined
  const density =
    open === null || asChip
      ? undefined
      : fitCard({ card: cardOf(open), columns, maxRows, rich: isRich(ui), extraRows })
  const railArgs: RailArgs = { ...args, flow, titleMax: rail.titleMax }
  return (
    <Box flexDirection="column">
      {below}
      {noticeRows(above)}
      {args.isPickingFeature && args.features.length > 1 && <FeaturePicker args={args} />}
      {open !== null && density !== undefined && (
        <Box key="card-slot" flexDirection="column" marginBottom={SPACE.cardAbove}>
          <DetailCard
            ui={ui}
            tone={tone}
            ascii={args.ascii}
            card={cardOf(open)}
            density={density}
            on={on}
          />
        </Box>
      )}
      {asChip ? <Summary args={railArgs} flow={flow} /> : <Rail args={railArgs} fits={fits} />}
    </Box>
  )
}
