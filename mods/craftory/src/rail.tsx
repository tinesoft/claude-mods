import type { RenderElement, RenderSurface } from 'claude-code'
import type { CraftoryConfig, FeatureKey, IssueRef, PhaseId, RailLayout, Tone } from '../types'
import type { AgentsView } from './build'
import {
  summaryParts,
  fitCard,
  fitRail,
  focusPhase,
  GEAR_RESERVE,
  phaseCard,
  phaseMeta,
  TITLE_MAX,
  triageCard,
  type CardView,
  type RailFit,
} from './card-model'
import { DetailCard, type CardActions } from './card'
import type { Flow, PhaseView } from './evidence'
import {
  BAR_SIZE,
  barSvg,
  hexOr,
  inboxSvg,
  listSvg,
  OFF_TRACK,
  spinnerSvg,
  phaseSvg,
} from './icons'
import { FrontierCard, MapChip } from './map-card'
import { mapChipCompact, mapChipGlyph, mapChipName, mapChipText, type MapView } from './map-view'
import { NoticeRow } from './notice-row'
import type { FeatureChoice } from './features'
import type { NoticeView } from './notices'
import { PHASES } from './phases'
import {
  CLEAR,
  CONNECTOR,
  HOVER_MIX,
  mix,
  paint,
  SPACE,
  SPINNER,
  SPINNER_ASCII,
  SUMMARY_SEP,
  SPIN_MS,
  PHASE_LOOKS,
  TOKENS,
  TRIPLES,
} from './theme'
import { Chip, clip, Icon, inkOf, isRich, roleInk, type Ui, withTint } from './ui'

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
  /** Run /wayfinder with this argument: the frontier card's Work next ticket. */
  wayfinder: (arg: string) => void
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
  const { Box, Svg, Text } = ui
  const isDone = before.state.kind === 'done'
  if (Svg !== undefined && tone !== undefined) {
    const bar = isDone ? TRIPLES.perm[tone].bd : TOKENS[tone].line
    return (
      <Box key={`connector-${before.phase}`} flexDirection="row" alignItems="center">
        <Svg source={barSvg(bar)} alt="" {...BAR_SIZE} />
      </Box>
    )
  }
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
  // The state's colour lives on the marker only; Desktop drops colour inside a Button.
  const marker = (
    <Icon ui={ui} svg={phaseIcon(view, spinFrame, colours.fg, OFF_TRACK)} alt={look.label} />
  )
  return (
    <Box
      key={`box-phase-${view.phase}`}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.phaseGap}
      paddingX={SPACE.phasePadX}
      borderStyle="round"
      borderColor={isOpen ? t.lineStrong : CLEAR}
      {...withTint(isOpen ? t.fill : undefined)}
      hover={{ backgroundColor: mix(t.fill, colours.fg, HOVER_MIX) }}
    >
      {marker}
      <Button key={`phase-${view.phase}`} plain onPress={press}>
        <Text bold={look.bold} {...(look.strike && { strikethrough: true })}>
          {label}
        </Text>
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
  const { Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const hook = paint('hook', tone)
  const count =
    waiting === 0 ? undefined : rich ? (
      <Text mono bold size="caption" color={hook.fg} backgroundColor={hook.bg}>
        {` ${waiting} `}
      </Text>
    ) : (
      <Text {...roleInk('hook', tone)}>{` ${waiting}`}</Text>
    )
  const t = tone === undefined ? undefined : TOKENS[tone]
  return (
    <Chip
      ui={ui}
      tone={tone}
      id="triage"
      role="hook"
      ink={roleInk('hook', tone)}
      {...(t && {
        look: {
          border: t.lineDashed,
          dashed: true,
          pressedBorder: hook.fg,
          pressedFill: t.fill,
          hover: mix(t.fill, hook.fg, HOVER_MIX),
        },
        icon: inboxSvg(hexOr(t.ink2)),
      })}
      label="Inbox"
      pressed={open === 'triage'}
      onPress={() => on.triage()}
    >
      {count}
    </Chip>
  )
}

/** A one-glyph plain Button: Desktop draws the glyph alone, with a hover tint. */
const Gear = ({ args }: { args: BandArgs }) => {
  const { ui, tone, on } = args
  const t = tone === undefined ? undefined : TOKENS[tone]
  return (
    <Chip
      ui={ui}
      tone={tone}
      id="gear"
      role="neutral"
      ink={inkOf(tone, 'text2')}
      {...(t && { look: { border: CLEAR, hover: t.fill } })}
      label={'\u2699'}
      pressed={false}
      onPress={() => on.gear()}
    />
  )
}

/**
 * The feature title, between the map chip and the phases. On rich surfaces a fill-tinted pill with
 * a list icon; with several features in flight it is the Feature switcher.
 */
const Title = ({ args, flow }: { args: RailArgs; flow: Flow }) => {
  const { ui, tone, features, isPickingFeature, on } = args
  const { Box, Text } = ui
  const text = clip(flow.title, args.titleMax)
  const rich = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  const look = t && {
    border: t.fill,
    fill: t.fill,
    pressedBorder: t.lineStrong,
    hover: mix(t.fill, t.ink, HOVER_MIX),
  }
  const icon = t && listSvg(hexOr(t.ink2))
  if (features.length < 2) {
    const label = (
      <Text key="title" bold {...inkOf(tone, 'ink')}>
        {text}
      </Text>
    )
    if (!rich || look === undefined) return <Box key="box-title">{label}</Box>
    return (
      <Box
        key="box-title"
        flexDirection="row"
        alignItems="center"
        columnGap={SPACE.phaseGap}
        paddingX={SPACE.phasePadX}
        borderStyle="round"
        borderColor={look.border}
        backgroundColor={look.fill}
      >
        {icon !== undefined && <Icon ui={ui} svg={icon} alt="" />}
        {label}
      </Box>
    )
  }
  return (
    <Chip
      ui={ui}
      tone={tone}
      id="title-switch"
      role="neutral"
      ink={inkOf(tone, 'ink')}
      {...(look && { look })}
      {...(icon !== undefined && { icon })}
      label={`${text} ▾`}
      bold
      pressed={isPickingFeature}
      onPress={() => on.pickFeature()}
    />
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

/**
 * The Inbox button, a divider, the `lead` (the map chip) and a divider, the `title`, then the seven
 * phases joined by connectors. Shared by the rail and the pane's mobile Flow head.
 */
export const PhaseStrip = ({
  args,
  id,
  wrap = false,
  lead,
  title,
}: {
  args: StripArgs
  id: string
  wrap?: boolean
  /** Drawn between the Inbox and the phases, such as the map chip. */
  lead?: RenderElement | false
  /** Drawn just before the phases, such as the feature title. */
  title?: RenderElement
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
      {title}
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

const ChipOf = ({
  args,
  view,
  compact = false,
}: {
  args: BandArgs
  view: MapView
  compact?: boolean
}) => (
  <MapChip
    compact={compact}
    ui={args.ui}
    tone={args.tone}
    ascii={args.ascii}
    view={view}
    isOpen={args.isMapOpen}
    on={args.on}
  />
)

/** The rail draws no frame of its own: Desktop frames the band, the terminal never framed it. */
const Rail = ({ args, fit }: { args: RailArgs; fit: RailFit }) => {
  const { ui, flow } = args
  const { Box } = ui
  const lead = args.map !== null && <ChipOf args={args} view={args.map} compact={fit.compactMap} />
  const wrap = fit.wrap && { flexWrap: 'wrap' as const }
  return (
    <Box
      key="rail"
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      columnGap={SPACE.railGap}
      {...wrap}
    >
      <PhaseStrip
        id="phases"
        args={args}
        lead={lead}
        title={<Title args={args} flow={flow} />}
        wrap={fit.wrap}
      />
      <Gear args={args} />
    </Box>
  )
}

/** The fewest title cells the summary keeps before it clips. */
const SUMMARY_TITLE_MIN = 6

const Summary = ({ args, flow }: { args: RailArgs; flow: Flow }) => {
  const { ui, tone, columns, on } = args
  const { Box, Button, Text } = ui
  const view = focusPhase(flow)
  const look = PHASE_LOOKS[view.state.kind]
  const colours = paint(look.role, tone)
  const rich = isRich(ui) && tone !== undefined
  const sep = args.ascii ? SUMMARY_SEP.ascii : SUMMARY_SEP.glyph
  const mapWidth =
    args.map === null
      ? 0
      : `${mapChipGlyph(args.ascii)} ${mapChipName(args.map)} ${mapChipCompact(args.map, args.ascii)} ${sep}`
          .length + 1
  const parts = summaryParts(flow)
  const phaseText = `· ${parts.phase}`
  const rest = 1 + phaseText.length + (parts.count === null ? 0 : 1 + parts.count.length)
  const titleMax = Math.min(TITLE_MAX, columns - GEAR_RESERVE - 6 - mapWidth - rest)
  const title = clip(parts.title, Math.max(SUMMARY_TITLE_MIN, titleMax))
  const t = rich ? TOKENS[tone] : undefined
  return (
    <Box
      key="summary-row"
      flexDirection="row"
      justifyContent="space-between"
      columnGap={SPACE.railGap}
    >
      <Box flexDirection="row" alignItems="center" columnGap={SPACE.railGap}>
        {args.map !== null && <ChipOf args={args} view={args.map} compact />}
        {args.map !== null && (
          <Text key="summary-sep" {...inkOf(tone, 'muted')}>
            {sep}
          </Text>
        )}
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
            <Text {...(t === undefined && inkOf(tone, 'ink'))} bold>
              {title}
            </Text>
          </Button>
          {t === undefined ? (
            <Text key="summary-phase" {...inkOf(tone, 'ink')} bold>{` ${phaseText}`}</Text>
          ) : (
            <Text key="summary-phase" color={colours.fg}>
              {phaseText}
            </Text>
          )}
          {parts.count !== null &&
            (t === undefined ? (
              <Text key="summary-count" {...inkOf(tone, 'ink')} bold>{` ${parts.count}`}</Text>
            ) : (
              <Text
                key="summary-count"
                mono
                size="caption"
                color={t.text2}
                backgroundColor={mix(t.surface, t.countBg.base, t.countBg.alpha)}
              >
                {` ${parts.count} `}
              </Text>
            ))}
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
    map:
      args.map === null
        ? null
        : {
            full: mapChipText(args.map, args.ascii).length,
            compact:
              `${mapChipGlyph(args.ascii)} ${mapChipName(args.map)} ${mapChipCompact(args.map, args.ascii)}`
                .length,
          },
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
      : (fitCard({
          card: cardOf(open),
          columns,
          maxRows,
          rich: isRich(ui),
          extraRows,
          railLines: rail.lines,
        }) ?? 'compact')
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
      {asChip ? <Summary args={railArgs} flow={flow} /> : <Rail args={railArgs} fit={rail} />}
    </Box>
  )
}
