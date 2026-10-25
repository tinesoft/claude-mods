import type { RenderElement, RenderSurface } from 'claude-code'
import type { CraftoryConfig, FeatureKey, PhaseId, RailLayout, Tone } from '../types'
import type { AgentsView } from './build'
import {
  chipText,
  fitCard,
  fitRail,
  focusStep,
  GEAR_RESERVE,
  phaseCard,
  stepMeta,
  TITLE_MAX,
  triageCard,
  type CardView,
} from './card-model'
import { DetailCard, type CardActions } from './card'
import type { Flow, Step } from './evidence'
import { hexOr, inboxSvg, OFF_TRACK, spinnerSvg, stepSvg } from './icons'
import { NoticeRow } from './notice-row'
import type { FeatureChoice } from './features'
import type { NoticeView } from './notices'
import { PHASES } from './phases'
import {
  CONNECTOR,
  HOVER_MIX,
  mix,
  paint,
  SPACE,
  SPINNER,
  SPINNER_ASCII,
  SPIN_MS,
  STEP_LOOKS,
  TOKENS,
  TRIPLES,
} from './theme'
import { clip, Icon, inkOf, isRich, roleInk, type Ui } from './ui'

const glyphOf = (step: Step, frame: number, ascii: boolean) => {
  const look = STEP_LOOKS[step.state.kind]
  if (step.state.kind === 'running')
    return (ascii ? SPINNER_ASCII : SPINNER)[frame % SPINNER.length]!
  return ascii ? look.ascii : look.glyph
}

export type BandActions = CardActions & {
  step: (phase: PhaseId, fitsCard: boolean) => void
  triage: (fitsCard: boolean) => void
  summary: () => void
  gear: () => void
  pickFeature: () => void
  switchFeature: (key: FeatureKey) => void
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

export type StripArgs = StepArgs & TriageArgs & { ascii: boolean }

/** The Inbox button, a divider and the seven steps joined by connectors, shared by the rail and the pane. */
export const StepStrip = ({
  args,
  fits,
  id,
  wrap = false,
}: {
  args: StripArgs
  fits: (phase: PhaseId | 'triage') => boolean
  id: string
  wrap?: boolean
}) => {
  const { ui, tone, ascii, flow } = args
  const { Box, Text } = ui
  return (
    <Box
      key={id}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.railGap}
      {...(wrap && { flexWrap: 'wrap' as const })}
    >
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
            <Connector ui={ui} tone={tone} ascii={ascii} before={flow.steps[index - 1]!} />
          )}
          <StepButton args={args} step={step} fits={fits(step.phase)} />
        </Box>
      ))}
    </Box>
  )
}

const Rail = ({ args, fits }: { args: RailArgs; fits: (phase: PhaseId | 'triage') => boolean }) => {
  const { ui, tone, flow } = args
  const { Box } = ui
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
        <StepStrip id="steps" args={args} fits={fits} />
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

export function renderBand(args: BandArgs) {
  const { ui, columns, maxRows, tone, below, layout, flow, config, waiting, notices, open, on } =
    args
  const { Box } = ui
  const replacing = notices.find(n => n.replacesRail)
  const above = notices.filter(n => !n.replacesRail)
  const noticeRows = (list: readonly NoticeView[]) =>
    list.map(n => <NoticeRow key={n.id} ui={ui} tone={tone} notice={n} on={on} />)
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
