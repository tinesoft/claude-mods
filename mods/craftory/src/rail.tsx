import type { RenderElement, RenderSurface } from 'claude-code'
import type { CraftoryConfig, FeatureKey, IssueRef, PhaseId, RailLayout, Tone } from '../types'
import type { AgentsView } from './build'
import {
  chipText,
  fitCard,
  fitRail,
  focusPhase,
  GEAR_RESERVE,
  phaseCard,
  phaseMeta,
  TITLE_MAX,
  triageCard,
  type CardView,
} from './card-model'
import { DetailCard, type CardActions } from './card'
import type { Flow, PhaseView } from './evidence'
import { hexOr, inboxSvg, OFF_TRACK, spinnerSvg, phaseSvg } from './icons'
import { FrontierCard, MapChip } from './map-card'
import { mapChipText, type MapView } from './map-view'
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
  PHASE_LOOKS,
  TOKENS,
  TRIPLES,
} from './theme'
import { clip, Icon, inkOf, isRich, roleInk, type Ui } from './ui'

const glyphOf = (view: PhaseView, frame: number, ascii: boolean) => {
  const look = PHASE_LOOKS[view.state.kind]
  if (view.state.kind === 'running')
    return (ascii ? SPINNER_ASCII : SPINNER)[frame % SPINNER.length]!
  return ascii ? look.ascii : look.glyph
}

export type BandActions = CardActions & {
  phase: (phase: PhaseId) => void
  triage: () => void
  summary: () => void
  gear: () => void
  pickFeature: () => void
  switchFeature: (key: FeatureKey) => void
  map: () => void
  pickMap: (ref: IssueRef) => void
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
  map: MapView | null
  isMapOpen: boolean
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
  before: PhaseView
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

const phaseIcon = (view: PhaseView, frame: number, color: string, track: string) =>
  view.state.kind === 'running'
    ? spinnerSvg(frame, hexOr(color), track)
    : phaseSvg(view.state.kind === 'next' ? 'next' : view.state.kind, hexOr(color))

type PhaseArgs = Pick<RailArgs, 'ui' | 'tone' | 'ascii' | 'spinFrame' | 'flow' | 'open'> & {
  on: Pick<BandActions, 'phase'>
}

const PhaseButton = ({ args, view }: { args: PhaseArgs; view: PhaseView }) => {
  const { ui, tone, ascii, spinFrame, flow, open, on } = args
  const { Box, Button, Text } = ui
  const look = PHASE_LOOKS[view.state.kind]
  const colours = paint(look.role, tone)
  const meta = phaseMeta(view, flow)
  const isOpen = open === view.phase
  const label = PHASES[view.phase].label
  const rich = isRich(ui) && tone !== undefined
  const labelInk =
    view.state.kind === 'done'
      ? inkOf(tone, 'ink')
      : view.state.kind === 'gated' || view.state.kind === 'todo'
        ? inkOf(tone, 'text2')
        : roleInk(look.role, tone)
  const ink = {
    ...labelInk,
    bold: look.bold,
    ...(look.strike && { strikethrough: true }),
  }
  const press = () => on.phase(view.phase)
  if (!rich) {
    return (
      <Button key={`phase-${view.phase}`} plain onPress={press}>
        <Text
          {...roleInk(look.role, tone)}
          bold={look.bold}
        >{`${glyphOf(view, spinFrame, ascii)} `}</Text>
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
      key={`box-phase-${view.phase}`}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.phaseGap}
      paddingX={SPACE.phasePadX}
      borderStyle="round"
      borderColor={selected ? t.lineStrong : t.surface}
      backgroundColor={selected ? t.fill : t.surface}
      hover={{ backgroundColor: mix(t.surface, colours.fg, HOVER_MIX) }}
    >
      <Icon ui={ui} svg={phaseIcon(view, spinFrame, colours.fg, OFF_TRACK)} alt={look.label} />
      <Button key={`phase-${view.phase}`} plain onPress={press}>
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

const TriageButton = ({ args }: { args: TriageArgs }) => {
  const { ui, tone, waiting, open, on } = args
  const { Box, Button, Text } = ui
  const isOpen = open === 'triage'
  const label = waiting > 0 ? `Inbox ${waiting}` : 'Inbox'
  const rich = isRich(ui) && tone !== undefined
  if (!rich) {
    return (
      <Button key="triage" plain onPress={() => on.triage()}>
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
      columnGap={SPACE.phaseGap}
      paddingX={SPACE.phasePadX}
      borderStyle="dashed"
      borderColor={isOpen ? hook.fg : t.lineDashed}
      backgroundColor={isOpen ? t.fill : t.surface}
    >
      <Icon ui={ui} svg={inboxSvg(hexOr(t.ink2))} alt="Inbox" />
      <Button key="triage" plain onPress={() => on.triage()}>
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

export type StripArgs = PhaseArgs & TriageArgs & { ascii: boolean }

/** The Inbox button, a divider and the seven phases joined by connectors, shared by the rail and the pane. */
export const PhaseStrip = ({
  args,
  id,
  wrap = false,
  lead,
}: {
  args: StripArgs
  id: string
  wrap?: boolean
  /** Drawn between the Inbox and the phases, such as the map chip. */
  lead?: RenderElement | false
}) => {
  const { ui, tone, ascii, flow } = args
  const { Box, Text } = ui
  const divider = (key: string) => (
    <Text key={key} {...(tone === undefined ? { dimColor: true } : { color: TOKENS[tone].line })}>
      {'│'}
    </Text>
  )
  return (
    <Box
      key={id}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.railGap}
      {...(wrap && { flexWrap: 'wrap' as const })}
    >
      <TriageButton args={args} />
      {divider('divider')}
      {lead && lead}
      {lead && divider('divider-map')}
      {flow.phases.map((view, index) => (
        <Box key={`group-${view.phase}`} flexDirection="row" alignItems="center">
          {index > 0 && (
            <Connector ui={ui} tone={tone} ascii={ascii} before={flow.phases[index - 1]!} />
          )}
          <PhaseButton args={args} view={view} />
        </Box>
      ))}
    </Box>
  )
}

const ChipOf = ({ args, view }: { args: BandArgs; view: MapView }) => (
  <MapChip
    ui={args.ui}
    tone={args.tone}
    ascii={args.ascii}
    view={view}
    isOpen={args.isMapOpen}
    on={args.on}
  />
)

const Rail = ({ args }: { args: RailArgs }) => {
  const { ui, tone, flow } = args
  const { Box } = ui
  const rich = isRich(ui) && tone !== undefined
  const lead = args.map !== null && <ChipOf args={args} view={args.map} />
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
        <PhaseStrip id="phases" args={args} lead={lead} />
        <Title args={args} flow={flow} />
      </Box>
      <Gear args={args} />
    </Box>
  )
}

const Summary = ({ args, flow }: { args: RailArgs; flow: Flow }) => {
  const { ui, tone, columns, on } = args
  const { Box, Button, Text } = ui
  const view = focusPhase(flow)
  const look = PHASE_LOOKS[view.state.kind]
  const colours = paint(look.role, tone)
  const rich = isRich(ui) && tone !== undefined
  const mapWidth = args.map === null ? 0 : mapChipText(args.map, args.ascii).length + 1
  const text = clip(chipText(flow), Math.max(10, columns - GEAR_RESERVE - 6 - mapWidth))
  return (
    <Box
      key="summary-row"
      flexDirection="row"
      justifyContent="space-between"
      columnGap={SPACE.railGap}
    >
      <Box flexDirection="row" alignItems="center" columnGap={SPACE.railGap}>
        {args.map !== null && <ChipOf args={args} view={args.map} />}
        <Box
          key="summary-chip"
          flexDirection="row"
          alignItems="center"
          columnGap={SPACE.phaseGap}
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
              svg={phaseIcon(view, args.spinFrame, colours.fg, OFF_TRACK)}
              alt={look.label}
            />
          ) : (
            <Text
              {...roleInk(look.role, tone)}
            >{`${glyphOf(view, args.spinFrame, args.ascii)} `}</Text>
          )}
          <Button key="summary" plain onPress={() => on.summary()}>
            <Text {...inkOf(tone, 'ink')} bold>
              {text}
            </Text>
          </Button>
        </Box>
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
  const rail = fitRail({
    flow,
    columns,
    rich: isRich(ui),
    waiting,
    features: args.features.length,
    mapWidth: args.map === null ? 0 : mapChipText(args.map, args.ascii).length,
  })
  const asChip = layout === 'summary' || rail.mode === 'chip'
  const cardOf = (phase: PhaseId | 'triage'): CardView =>
    phase === 'triage'
      ? triageCard(waiting)
      : phaseCard(
          flow.phases.find(s => s.phase === phase)!,
          flow,
          config,
          args.agents,
        )
  const extraRows = above.length + (args.isPickingFeature ? 1 : 0)
  // A card taller than the band scrolls there, so one that fits in no density is still drawn, compact.
  const density =
    open === null || asChip
      ? undefined
      : (fitCard({ card: cardOf(open), columns, maxRows, rich: isRich(ui), extraRows }) ??
        'compact')
  const railArgs: RailArgs = { ...args, flow, titleMax: rail.titleMax }
  const mapCard = args.isMapOpen && args.map !== null && open === null
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
      {mapCard && args.map !== null && (
        <Box key="map-slot" flexDirection="column" marginBottom={SPACE.cardAbove}>
          <FrontierCard ui={ui} tone={tone} ascii={args.ascii} view={args.map} on={on} />
        </Box>
      )}
      {asChip ? <Summary args={railArgs} flow={flow} /> : <Rail args={railArgs} />}
    </Box>
  )
}
