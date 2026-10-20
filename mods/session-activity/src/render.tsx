import type { Color, ElementTable, RenderElement, RenderSurface } from 'claude-code'

import type { Activation, Kind, Settings, Status } from '../types'
import { errorSvg, hexOr, iconSvg, OFF_TRACK, spinnerSvg } from './icons'
import { chipId } from './model'
import {
  FRESH_MS,
  HOVER_MIX,
  isStopped,
  isUrgent,
  KIND_ORDER,
  mix,
  SPIN_MS,
  SPINNER,
  STATUSES,
  STOPPED,
  type Tone,
  TOGGLES,
  TOKENS,
} from './theme'

/** `Svg` exists on every surface that draws rich (remote) elements, never on the terminal. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button'> & {
  Svg?: ElementTable<'desktop'>['Svg']
}

export const isRich = (ui: Ui) => ui.Svg !== undefined

const isPill = (ui: Ui, tone: Tone | undefined) => isRich(ui) && tone !== undefined

const ICON_PX = 14

const LABEL_MAX = 24
const MORE_RESERVE = 2
const PROMPT_ROWS = 6

export const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`

export const ago = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h`
}

export const agoLabel = (ms: number) => (ago(ms) === 'now' ? 'now' : `${ago(ms)} ago`)

export type Look = {
  color: Color
  tint: Color | undefined
  dim: boolean
  border: Color | undefined
  hover: Color | undefined
  /** The wash behind a `×N` count, blended over the chip. */
  count: Color | undefined
}

const countWash = (tint: string, tone: Tone) => {
  const { base, alpha } = TOKENS[tone].countBg
  return mix(tint, base, alpha)
}

export const lookOf = (kind: Kind | 'plugin', tone: Tone | undefined, status?: Status): Look => {
  const { palette, dim } = TOGGLES[kind]
  if (tone === undefined) {
    return {
      color: palette.key,
      tint: undefined,
      dim,
      border: undefined,
      hover: undefined,
      count: undefined,
    }
  }
  if (status === 'error') {
    const { danger: fg, surface: tint } = TOKENS[tone]
    return {
      color: fg,
      tint,
      dim: false,
      border: fg,
      hover: mix(tint, fg, HOVER_MIX),
      count: countWash(tint, tone),
    }
  }
  const { fg, bg: tint, bd: border } = palette[tone]
  return {
    color: fg,
    tint,
    dim: false,
    border,
    hover: mix(tint, fg, HOVER_MIX),
    count: countWash(tint, tone),
  }
}

type Role = 'ink' | 'ink2' | 'text2' | 'muted' | 'danger'

/**
 * Paint for text in a neutral role. A token colour needs a known background: rich surfaces
 * draw their own, and a `bg` pins one in the terminal. Elsewhere the terminal keeps its
 * own colours, dimmed for quiet text, and `error` stands for danger.
 */
export const inkOf = (ui: Ui, tone: Tone | undefined, role: Role, bg?: Color) => {
  const back = bg === undefined ? {} : { backgroundColor: bg }
  if (tone !== undefined && (isRich(ui) || bg !== undefined)) {
    return { color: TOKENS[tone][role], ...back }
  }
  if (role === 'danger') return { color: 'error' as Color, ...back }
  return role === 'text2' || role === 'muted' ? { dimColor: true, ...back } : back
}

type IconArgs = { ui: Ui; svg: string; alt: string; width?: number; height?: number }

export const Icon = ({ ui, svg, alt, width = ICON_PX, height = ICON_PX }: IconArgs) => {
  const { Svg } = ui
  return Svg && <Svg source={svg} alt={alt} width={width} height={height} />
}

export const kindIcon = (ui: Ui, kind: Kind | 'plugin', look: Look, extra?: string) => (
  <Icon ui={ui} svg={iconSvg(kind, hexOr(look.color))} alt={extra ?? TOGGLES[kind].noun} />
)

const withTint = (tint: Color | undefined) => (tint === undefined ? {} : { backgroundColor: tint })

export const gapOf = (tone: Tone | undefined) => (tone === undefined ? 2 : 1)

type Parts = {
  glyph: string
  lead: string
  label: string
  count: string
  via: string
  badge: string
}

/** The badge a status wears: the design's mixed-case word on rich tinted chips, else the upper-case one. */
export const badgeOf = (status: Status, tone: Tone | undefined, rich: boolean) => {
  if (status === 'error' && tone !== undefined) return 'Error'
  const theme = STATUSES[status]
  return rich && tone !== undefined && isStopped(status) ? theme.label : (theme.badge ?? '')
}

const partsOf = (
  a: Activation,
  settings: Settings,
  now: number,
  tone: Tone | undefined,
  rich: boolean,
): Parts => {
  const status = STATUSES[a.status]
  const frame = Math.floor(now / SPIN_MS)
  const tally = a.count > 1 && TOGGLES[a.kind].showsTally ? `×${a.count}` : ''
  return {
    glyph:
      a.status === 'running'
        ? SPINNER[frame % SPINNER.length]!
        : (status.glyph ?? TOGGLES[a.kind].glyph),
    lead: a.lastAt > now - FRESH_MS ? '● ' : '',
    label: clip(a.label, LABEL_MAX),
    count: tone !== undefined && tally !== '' ? ` ${tally} ` : tally,
    via: settings.shown.plugin && a.plugin !== undefined ? `via ${clip(a.plugin, 16)}` : '',
    badge: badgeOf(a.status, tone, rich),
  }
}

export const chipWidth = (
  a: Activation,
  settings: Settings,
  now: number,
  tone: Tone | undefined,
  hasHotkey: boolean,
  rich = false,
) => {
  const p = partsOf(a, settings, now, tone, rich)
  const padding = a.status === 'error' && tone !== undefined ? 0 : 2
  const segments = [
    1,
    p.lead.length + p.label.length + (hasHotkey ? 3 : 0),
    p.count.length,
    p.via.length,
    p.badge.length > 0 ? p.badge.length + padding : 0,
  ].filter(n => n > 0)
  return (
    segments.reduce((sum, n) => sum + n, 0) +
    segments.length -
    1 +
    (tone ? 2 : 0) +
    (rich && tone ? 2 : 0)
  )
}

const moreLabel = (n: number) => `+${n} more`

const MORE_BOX = 4

export const fitChips = (
  chips: readonly Activation[],
  columns: number,
  settings: Settings,
  now: number,
  tone: Tone | undefined,
  rich = false,
) => {
  const gap = gapOf(tone)
  const shown: Activation[] = []
  let used = 0
  for (const [index, chip] of chips.entries()) {
    if (shown.length >= settings.maxChips) break
    const width =
      chipWidth(chip, settings, now, tone, settings.hotkeys && index < 9, rich) +
      (shown.length > 0 ? gap : 0)
    const rest = chips.length - shown.length - 1
    const reserve =
      rest > 0
        ? gap + moreLabel(rest).length + (settings.hotkeys ? 3 : 0) + (rich && tone ? MORE_BOX : 0)
        : 0
    if (shown.length > 0 && used + width + reserve > columns) break
    shown.push(chip)
    used += width
  }
  return { shown, hidden: chips.length - shown.length }
}

const stoppedCount = (chips: readonly Activation[]) => chips.filter(a => isStopped(a.status)).length

export const Badge = ({
  ui,
  text,
  tone,
  status,
  bg,
}: {
  ui: Ui
  text: string
  tone: Tone | undefined
  status?: Status
  bg?: Color
}) => {
  const { Text } = ui
  if (tone === undefined) return <Text inverse bold color="error">{` ${text} `}</Text>
  if (status === 'error') {
    return (
      <Text bold {...inkOf(ui, tone, 'danger', bg)}>
        {text}
      </Text>
    )
  }
  return <Text bold color={STOPPED.fg} backgroundColor={STOPPED.bg}>{` ${text} `}</Text>
}

export type Actions = {
  pick: (id: string, fitsCard: boolean) => void
  open: () => void
  close: () => void
  mute: (id: string) => void
  copy: (text: string) => void
}

type RowArgs = {
  ui: Ui
  surface: RenderSurface
  columns: number
  now: number
  tone: Tone | undefined
  chips: readonly Activation[]
  settings: Settings
  selected: string | null
  fits: (a: Activation) => boolean
  on: Pick<Actions, 'pick' | 'open'>
}

const ChipIcon = ({ ui, a, look, now }: { ui: Ui; a: Activation; look: Look; now: number }) => {
  const noun = TOGGLES[a.kind].noun
  if (a.status === 'running') {
    const frame = Math.floor(now / SPIN_MS)
    const svg = spinnerSvg(frame, hexOr(look.color), hexOr(look.border, OFF_TRACK))
    return <Icon ui={ui} svg={svg} alt={noun} />
  }
  if (a.status === 'error') return <Icon ui={ui} svg={errorSvg(hexOr(look.color))} alt={noun} />
  return kindIcon(ui, a.kind, look)
}

const chipBorder = (look: Look, a: Activation, tone: Tone | undefined, isSelected: boolean) => {
  if (isSelected) return look.color
  return tone !== undefined && isStopped(a.status) ? TOKENS[tone].dangerBd : look.border
}

const Chip = ({ args, a, index }: { args: RowArgs; a: Activation; index: number }) => {
  const { ui, now, tone, settings, selected, fits, on } = args
  const { Box, Button, Text } = ui
  const rich = isRich(ui)
  const p = partsOf(a, settings, now, tone, rich)
  const look = lookOf(a.kind, tone, a.status)
  const { color, tint, dim } = look
  const paint = { color, dimColor: dim, ...withTint(tint) }
  const id = chipId(a)
  const pill = isPill(ui, tone)
  return (
    <Box
      key={`box-${id}`}
      flexDirection="row"
      columnGap={1}
      paddingX={tone === undefined ? 0 : 1}
      {...withTint(tint)}
      {...(pill && {
        borderStyle: a.status === 'error' ? 'dashed' : 'round',
        borderColor: chipBorder(look, a, tone, selected === id),
      })}
      {...(rich && look.hover !== undefined && { hover: { backgroundColor: look.hover } })}
    >
      {rich ? (
        <ChipIcon ui={ui} a={a} look={look} now={now} />
      ) : (
        <Text {...paint} {...(a.status === 'error' && { color: 'error', dimColor: false })}>
          {p.glyph}
        </Text>
      )}
      <Button
        key={`chip-${a.kind}-${a.key}`}
        plain
        {...(settings.hotkeys && index < 9 && { hotkey: String(index + 1) })}
        onPress={() => on.pick(id, fits(a))}
      >
        <Text {...paint} bold={p.lead !== ''} underline={selected === id}>
          {p.lead + p.label}
        </Text>
      </Button>
      {p.count !== '' && (
        <Text {...paint} {...(look.count !== undefined && { backgroundColor: look.count })}>
          {p.count}
        </Text>
      )}
      {p.via && (
        <Text dimColor {...withTint(tint)}>
          {p.via}
        </Text>
      )}
      {p.badge !== '' && <Badge ui={ui} text={p.badge} tone={tone} status={a.status} bg={tint} />}
    </Box>
  )
}

const MoreBox = ({
  ui,
  tone,
  children,
}: {
  ui: Ui
  tone: Tone | undefined
  children: RenderElement
}) =>
  isPill(ui, tone) ? (
    <ui.Box borderStyle="dashed" borderColor={TOKENS[tone!].lineDashed} paddingX={1}>
      {[children]}
    </ui.Box>
  ) : (
    <>{[children]}</>
  )

const urgentCount = (chips: readonly Activation[]) => chips.filter(a => isUrgent(a.status)).length

const LEAD_BOX = 4

const leadText = (chips: readonly Activation[]) => `${chips.length} active`

/** Mobile's first chip: how many are active, a red dot when something stopped or failed. */
const Lead = ({ args }: { args: RowArgs }) => {
  const { ui, tone, chips, on } = args
  const { Box, Button, Text } = ui
  const surface = tone === undefined ? undefined : TOKENS[tone].surface
  return (
    <Box
      key="lead-box"
      flexDirection="row"
      columnGap={1}
      paddingX={tone === undefined ? 0 : 1}
      {...withTint(surface)}
      {...(tone !== undefined && { borderStyle: 'round', borderColor: TOKENS[tone].line })}
    >
      <Button key="lead" plain onPress={() => on.open()}>
        <Text bold {...inkOf(ui, tone, 'ink', surface)}>
          {leadText(chips)}
        </Text>
        {urgentCount(chips) > 0 && <Text {...inkOf(ui, tone, 'danger', surface)}>{' ●'}</Text>}
      </Button>
    </Box>
  )
}

const leadWidth = (chips: readonly Activation[], tone: Tone | undefined) =>
  leadText(chips).length +
  (urgentCount(chips) > 0 ? 2 : 0) +
  (tone === undefined ? 0 : LEAD_BOX) +
  1

const Summary = ({ args }: { args: RowArgs }) => {
  const { ui, tone, chips, settings, on } = args
  const { Box, Button, Text } = ui
  const rich = isRich(ui)
  const neutral = tone === undefined ? undefined : TOKENS[tone].surface
  const stopped = stoppedCount(chips)
  const first = KIND_ORDER.findIndex(kind => chips.some(a => a.kind === kind))
  return (
    <Box
      flexDirection="row"
      columnGap={1}
      paddingX={tone === undefined ? 0 : 1}
      {...withTint(neutral)}
      {...(isPill(ui, tone) && { borderStyle: 'round', borderColor: TOKENS[tone!].line })}
    >
      {KIND_ORDER.flatMap((kind, index) => {
        const n = chips.filter(a => a.kind === kind).length
        if (n === 0) return []
        const look = lookOf(kind, tone)
        const paint = { color: look.color, dimColor: look.dim, ...withTint(neutral) }
        return [
          <Box key={`sum-${kind}`} flexDirection="row" columnGap={1}>
            {rich && kindIcon(ui, kind, look)}
            <Button
              key={`summary-${kind}`}
              plain
              {...(settings.hotkeys && index === first && { hotkey: '1' })}
              onPress={() => on.open()}
            >
              <Text {...paint}>{rich ? String(n) : `${TOGGLES[kind].glyph}${n}`}</Text>
            </Button>
          </Box>,
        ]
      })}
      {stopped > 0 && (
        <Button key="summary-stopped" plain onPress={() => on.open()}>
          <Text {...inkOf(ui, tone, 'danger', neutral)}>{`● ${stopped} blocked`}</Text>
        </Button>
      )}
    </Box>
  )
}

export const ChipRow = (args: RowArgs) => {
  const { ui, surface, columns, now, tone, chips, settings, on } = args
  const { Box, Button, Text } = ui
  const gap = gapOf(tone)
  if (settings.layout === 'summary') return <Summary args={args} />
  const leads = surface === 'mobile'
  const { shown, hidden } = fitChips(
    chips,
    columns - MORE_RESERVE - (leads ? leadWidth(chips, tone) : 0),
    settings,
    now,
    tone,
    isRich(ui),
  )
  return (
    <Box flexDirection="row" columnGap={gap}>
      {leads && <Lead args={args} />}
      {shown.map((a, index) => (
        <Chip args={args} a={a} index={index} />
      ))}
      {hidden > 0 && (
        <MoreBox ui={ui} tone={tone}>
          <Button
            key="more"
            plain
            dimColor
            {...(settings.hotkeys && { hotkey: '0' })}
            onPress={() => on.open()}
          >
            <Text {...inkOf(ui, tone, 'text2')}>{moreLabel(hidden)}</Text>
          </Button>
        </MoreBox>
      )}
    </Box>
  )
}

const Tile = ({
  ui,
  tone,
  title,
  value,
  danger = false,
}: {
  ui: Ui
  tone: Tone | undefined
  title: string
  value: string
  danger?: boolean
}) => {
  const { Box, Text } = ui
  const tint = tone === undefined ? undefined : TOKENS[tone].tile
  return (
    <Box key={`tile-${title}`} flexDirection="column" flexGrow={1} paddingX={1} {...withTint(tint)}>
      <Text {...inkOf(ui, tone, 'muted', tint)}>{title}</Text>
      <Text bold {...inkOf(ui, tone, danger ? 'danger' : 'ink', tint)}>
        {value}
      </Text>
    </Box>
  )
}

export const cardRows = (a: Activation, columns: number) => {
  const inner = Math.max(10, columns - 4)
  const why = Math.max(1, Math.ceil(a.detail.length / inner))
  return 2 + 1 + 1 + why + 2 + (a.source === undefined ? 0 : 1) + 1
}

export type CardArgs = {
  ui: Ui
  tone: Tone | undefined
  now: number
  a: Activation
  isMuted: boolean
  on: Pick<Actions, 'mute' | 'copy'> & { close?: () => void }
}

export const DetailCard = ({ ui, tone, now, a, isMuted, on }: CardArgs) => {
  const { Box, Button, Text } = ui
  const look = lookOf(a.kind, tone)
  const { color, dim } = look
  const theme = TOGGLES[a.kind]
  const status = STATUSES[a.status]
  const id = chipId(a)
  const surface = tone !== undefined && isRich(ui) ? TOKENS[tone].surface : undefined
  return (
    <Box
      key="card"
      flexDirection="column"
      borderStyle="round"
      borderColor={tone === undefined ? color : TOKENS[tone].line}
      borderDimColor={dim}
      paddingX={1}
      {...withTint(surface)}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={color} dimColor={dim} {...withTint(surface)}>
          {[theme.noun.toUpperCase(), a.meta].filter(Boolean).join(' · ')}
        </Text>
        {on.close && <Button key="close" plain label="✕" onPress={() => on.close?.()} />}
      </Box>
      {isRich(ui) ? (
        <Box flexDirection="row" columnGap={1}>
          {kindIcon(ui, a.kind, look)}
          <Text bold {...inkOf(ui, tone, 'ink', surface)}>
            {a.label}
          </Text>
        </Box>
      ) : (
        <Text bold>{a.label}</Text>
      )}
      <Text wrap="wrap" {...inkOf(ui, tone, 'ink2', surface)}>
        {a.detail}
      </Text>
      <Box flexDirection="row" columnGap={1}>
        <Tile ui={ui} tone={tone} title="Status" value={status.label} danger={isUrgent(a.status)} />
        <Tile ui={ui} tone={tone} title="Activations" value={String(a.count)} />
        <Tile ui={ui} tone={tone} title="Last" value={agoLabel(now - a.lastAt)} />
      </Box>
      {a.source !== undefined && (
        <Text wrap="truncate-middle" {...inkOf(ui, tone, 'muted', surface)}>
          {a.source}
        </Text>
      )}
      <Box flexDirection="row" columnGap={2}>
        {a.source !== undefined && (
          <Button key="open" hotkey="o" label="o: Open source" onPress={() => on.copy(a.source!)} />
        )}
        <Button
          key="mute"
          hotkey="m"
          label={isMuted ? 'm: Unmute' : 'm: Mute for this session'}
          onPress={() => on.mute(id)}
        />
      </Box>
    </Box>
  )
}

export type BandArgs = Omit<RowArgs, 'fits' | 'on'> & {
  maxRows: number
  below: RenderElement
  on: Actions
}

export const renderBand = (args: BandArgs) => {
  const { ui, columns, maxRows, now, tone, chips, settings, selected, below, on } = args
  const { Box } = ui
  const chipRowRows = isPill(ui, tone) ? 3 : 1
  const fits = (a: Activation) => maxRows >= PROMPT_ROWS + chipRowRows + cardRows(a, columns)
  const current = settings.layout === 'row' ? chips.find(a => chipId(a) === selected) : undefined
  return (
    <Box flexDirection="column">
      {below}
      {current && fits(current) && (
        <DetailCard
          ui={ui}
          tone={tone}
          now={now}
          a={current}
          isMuted={false}
          on={{ mute: on.mute, copy: on.copy, close: on.close }}
        />
      )}
      <ChipRow {...args} fits={fits} on={on} />
    </Box>
  )
}
