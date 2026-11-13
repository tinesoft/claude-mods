import type { RenderElement, RenderSurface } from 'claude-code'
import type { CraftoryConfig, FeatureKey, IssueRef, PhaseId, RailLayout, Tone } from '../types'
import type { AgentsView } from './build'
import {
  cardDensity,
  summaryParts,
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
  DIVIDER_SIZE,
  DOT_PX,
  dotOf,
  hexOr,
  inboxSvg,
  listSvg,
  OFF_TRACK,
  spinnerSvg,
  phaseDotSvg,
  phaseSvg,
} from './icons'
import { FrontierCard, MapChip } from './map-card'
import { mapChipCompactText, mapChipText, type MapView } from './map-view'
import { NoticeRow } from './notice-row'
import type { FeatureChoice } from './features'
import type { NoticeView } from './notices'
import { PHASES } from './phases'
import {
  CARET,
  CONNECTOR,
  connectorColor,
  GEAR,
  TRAY,
  mix,
  paint,
  SPACE,
  SPINNER,
  SPINNER_ASCII,
  SUMMARY_SEP,
  SPIN_MS,
  PHASE_LOOKS,
  RAIL_DIVIDER,
  TOKENS,
} from './theme'
import { bareLook, Chip, clip, inkOf, isRich, pillLook, roleInk, stepLook, type Ui } from './ui'

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
  /** Copy a location: the frontier card's Open map, where the terminal has no link to press. */
  openFolder: (folder: string, surface: RenderSurface) => void
}

export type BandArgs = {
  ui: Ui
  surface: RenderSurface
  columns: number
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
  afterMeta,
}: {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  before: PhaseView
  /** The step before ends in its meta pill, not in the native button's own padding. */
  afterMeta: boolean
}) => {
  const { Box, Svg, Text } = ui
  const color = connectorColor(before.state.kind === 'done', tone)
  if (Svg !== undefined && color !== undefined) {
    // The steps row has no gap on rich surfaces. A step ends in the native button's padding, or in
    // its meta pill, which takes the connector's own sliver; the next step's left padding follows.
    return (
      <Box
        key={`connector-${before.phase}`}
        flexDirection="row"
        alignItems="center"
        paddingLeft={afterMeta ? SPACE.connectorSide : 0}
        paddingRight={0}
      >
        <Svg
          source={barSvg(BAR_SIZE.width, BAR_SIZE.height, hexOr(color))}
          alt="Connector"
          {...BAR_SIZE}
        />
      </Box>
    )
  }
  return (
    <Text
      key={`connector-${before.phase}`}
      {...(color === undefined ? { dimColor: true } : { color })}
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

/** The longest meta a Desktop step shows, so a long spec slug keeps its step as short as the board's `#42`. */
const STEP_META_MAX = 8

const PhaseButton = ({ args, view }: { args: PhaseArgs; view: PhaseView }) => {
  const { ui, tone, ascii, spinFrame, flow, open, on } = args
  const { Text } = ui
  const look = PHASE_LOOKS[view.state.kind]
  const meta = phaseMeta(view, flow)
  const rich = isRich(ui) && tone !== undefined
  const labelInk =
    view.state.kind === 'done'
      ? inkOf(tone, 'ink')
      : view.state.kind === 'gated' || view.state.kind === 'todo'
        ? inkOf(tone, 'text2')
        : roleInk(look.role, tone)
  const t = rich ? TOKENS[tone] : undefined
  return (
    <Chip
      ui={ui}
      tone={tone}
      id={`phase-${view.phase}`}
      role={look.role}
      look={stepLook(tone, paint(look.role, tone).fg)}
      ink={labelInk}
      // The state's colour lives on the numbered dot only; Desktop drops colour inside a Button.
      {...(rich && {
        icon: phaseDotSvg(dotOf(view.state.kind, PHASES[view.phase].n, tone), spinFrame),
        iconPx: DOT_PX,
        iconAlt: look.label,
      })}
      glyph={glyphOf(view, spinFrame, ascii)}
      glyphBold={look.bold}
      label={PHASES[view.phase].label}
      bold={look.bold}
      strike={look.strike}
      pressed={open === view.phase}
      inside
      onPress={() => on.phase(view.phase)}
    >
      {meta !== null &&
        (t === undefined ? (
          <Text {...inkOf(tone, 'text2')}>{` ${meta}`}</Text>
        ) : (
          <Text
            mono
            size="caption"
            color={t.text2}
            backgroundColor={mix(t.surface, t.countBg.base, t.countBg.alpha)}
          >
            {` ${clip(meta, STEP_META_MAX, ascii)} `}
          </Text>
        ))}
    </Chip>
  )
}

type TriageArgs = Pick<RailArgs, 'ui' | 'tone' | 'waiting' | 'open' | 'ascii'> & {
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
  const step = stepLook(tone, hook.fg)
  return (
    <Chip
      ui={ui}
      tone={tone}
      id="triage"
      role="hook"
      ink={roleInk('hook', tone)}
      look={step && t && { ...step, border: t.lineDashed, dashed: true, pressedBorder: hook.fg }}
      {...(t && { icon: inboxSvg(hexOr(t.ink2)) })}
      glyph={args.ascii ? TRAY.ascii : TRAY.glyph}
      label="Triage"
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
  return (
    <Chip
      ui={ui}
      tone={tone}
      id="gear"
      look={bareLook(tone)}
      ink={inkOf(tone, 'text2')}
      label={args.ascii ? GEAR.ascii : GEAR.glyph}
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
  const text = clip(flow.title, args.titleMax, args.ascii)
  const t = tone === undefined ? undefined : TOKENS[tone]
  const pill = {
    ui,
    tone,
    look: pillLook(tone),
    ink: inkOf(tone, 'ink'),
    ...(t && isRich(ui) && { icon: listSvg(hexOr(t.ink2)) }),
    bold: true,
  }
  if (features.length < 2) return <Chip {...pill} id="title" boxKey="box-title" label={text} />
  return (
    <Chip
      {...pill}
      id="title-switch"
      label={`${text} ${args.ascii ? CARET.ascii : CARET.glyph}`}
      pressed={isPickingFeature}
      onPress={() => on.pickFeature()}
    />
  )
}

const FeaturePicker = ({ args }: { args: BandArgs }) => {
  const { ui, tone, features, on } = args
  const { Box } = ui
  const accent = tone === undefined ? undefined : TOKENS[tone].ink
  return (
    <Box
      key="feature-picker"
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.pickerGap}
      marginBottom={SPACE.pickerBelow}
    >
      {features.map(feature => (
        // Drawn as a phase step: the feature in focus pressed, as an open phase is.
        <Chip
          key={`chip-feature-${feature.key}`}
          ui={ui}
          tone={tone}
          id={`feature-${feature.key}`}
          look={accent === undefined ? undefined : stepLook(tone, accent)}
          ink={inkOf(tone, feature.isActive ? 'ink' : 'text2')}
          label={clip(feature.title, TITLE_MAX, args.ascii)}
          bold={feature.isActive}
          pressed={feature.isActive}
          dim={!feature.isActive}
          inside
          onPress={() => on.switchFeature(feature.key)}
        />
      ))}
    </Box>
  )
}

export type StripArgs = PhaseArgs & TriageArgs & { ascii: boolean }

/**
 * Two rows, as on the boards: the Triage button, a divider, the `lead` (the map chip) and a divider,
 * the `title` and the `trailing` (the gear) on the first; the seven phases joined by connectors on
 * their own row below. Shared by the rail and the pane's mobile Flow head.
 */
export const PhaseStrip = ({
  args,
  id,
  wrap = false,
  wrapSteps = wrap,
  lead,
  title,
  trailing,
}: {
  args: StripArgs
  id: string
  wrap?: boolean
  /** The phases row may wrap too; the band keeps its seven steps on one line, a phone cannot. */
  wrapSteps?: boolean
  /** Drawn between the Triage button and the title, such as the map chip. */
  lead?: RenderElement | false
  /** Drawn last on the head row, such as the feature title. */
  title?: RenderElement
  /** Drawn at the right end of the head row, such as the gear. */
  trailing?: RenderElement
}) => {
  const { ui, tone, ascii, flow } = args
  const { Box, Svg, Text } = ui
  const rich = isRich(ui) && tone !== undefined && Svg !== undefined
  const divider = (key: string) =>
    rich ? (
      <Box key={key} flexDirection="row" alignItems="center" paddingX={SPACE.railGap}>
        <Svg
          source={barSvg(DIVIDER_SIZE.width, DIVIDER_SIZE.height, hexOr(TOKENS[tone].line))}
          alt="Divider"
          {...DIVIDER_SIZE}
        />
      </Box>
    ) : (
      <Text key={key} {...(tone === undefined ? { dimColor: true } : { color: TOKENS[tone].line })}>
        {ascii ? RAIL_DIVIDER.ascii : RAIL_DIVIDER.glyph}
      </Text>
    )
  const wraps = wrap && { flexWrap: 'wrap' as const }
  return (
    <Box key={id} flexDirection="column" rowGap={SPACE.railRowGap}>
      <Box
        key={`${id}-head`}
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        columnGap={SPACE.railGap}
      >
        <Box flexDirection="row" alignItems="center" columnGap={SPACE.railGap} {...wraps}>
          <TriageButton args={args} />
          {divider('divider')}
          {lead && lead}
          {lead && divider('divider-map')}
          {title}
        </Box>
        {trailing}
      </Box>
      <Box
        key={`${id}-steps`}
        flexDirection="row"
        alignItems="center"
        columnGap={rich ? 0 : SPACE.railGap}
        flexWrap={wrapSteps ? 'wrap' : 'nowrap'}
      >
        {flow.phases.map((view, index) => (
          <Box key={`group-${view.phase}`} flexDirection="row" alignItems="center">
            {index > 0 && (
              <Connector
                ui={ui}
                tone={tone}
                ascii={ascii}
                before={flow.phases[index - 1]!}
                afterMeta={phaseMeta(flow.phases[index - 1]!, flow) !== null}
              />
            )}
            <PhaseButton args={args} view={view} />
          </Box>
        ))}
      </Box>
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
  return (
    <Box key="rail" flexDirection="column">
      <PhaseStrip
        id="phases"
        args={args}
        lead={lead}
        title={<Title args={args} flow={flow} />}
        trailing={<Gear args={args} />}
        wrap={fit.wrap}
        wrapSteps={false}
      />
    </Box>
  )
}

/** The fewest title cells the summary keeps before it clips. */
const SUMMARY_TITLE_MIN = 6

const Summary = ({ args, flow }: { args: RailArgs; flow: Flow }) => {
  const { ui, tone, columns, on } = args
  const { Box, Text } = ui
  const view = focusPhase(flow)
  const look = PHASE_LOOKS[view.state.kind]
  const colours = paint(look.role, tone)
  const rich = isRich(ui) && tone !== undefined
  const sep = args.ascii ? SUMMARY_SEP.ascii : SUMMARY_SEP.glyph
  const mapWidth =
    args.map === null ? 0 : `${mapChipCompactText(args.map, args.ascii)} ${sep}`.length + 1
  const parts = summaryParts(flow)
  const phaseText = `· ${parts.phase}`
  const rest = 1 + phaseText.length + (parts.count === null ? 0 : 1 + parts.count.length)
  const titleMax = Math.min(TITLE_MAX, columns - GEAR_RESERVE - 6 - mapWidth - rest)
  const title = clip(parts.title, Math.max(SUMMARY_TITLE_MIN, titleMax), args.ascii)
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
        {/* Outlined with no fill at rest, so it reads as a step of the band, not a card. */}
        <Chip
          ui={ui}
          tone={tone}
          id="summary"
          boxKey="summary-chip"
          role={look.role}
          look={t && { border: t.line, padX: SPACE.summaryGap, hover: t.fill }}
          layout={{ gap: SPACE.phaseGap }}
          ink={inkOf(tone, 'ink')}
          {...(rich && {
            icon: phaseIcon(view, args.spinFrame, colours.fg, OFF_TRACK),
            iconAlt: look.label,
          })}
          glyph={glyphOf(view, args.spinFrame, args.ascii)}
          label={title}
          bold
          onPress={() => on.summary()}
        >
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
        </Chip>
      </Box>
      <Gear args={args} />
    </Box>
  )
}

export function renderBand(args: BandArgs) {
  const { ui, columns, tone, below, layout, flow, config, waiting, notices, open, on } = args
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
            compact: mapChipCompactText(args.map, args.ascii).length,
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
  const railArgs: RailArgs = { ...args, flow, titleMax: rail.titleMax }
  const mapCard = args.isMapOpen && args.map !== null && open === null
  return (
    <Box flexDirection="column">
      {below}
      {noticeRows(above)}
      {args.isPickingFeature && args.features.length > 1 && <FeaturePicker args={args} />}
      {open !== null && !asChip && (
        <Box key="card-slot" flexDirection="column" marginBottom={SPACE.cardAbove}>
          <DetailCard
            ui={ui}
            tone={tone}
            ascii={args.ascii}
            card={cardOf(open)}
            // VS Code draws spacing in cells, where compact is no padding at all, so its cards stay roomy.
            density={cardDensity(rail, isRich(ui) && args.surface !== 'vscode')}
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
