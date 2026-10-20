import type { Color, ElementTable, RenderElement } from 'claude-code'

import type { Activation, Kind, Settings, Status } from '../types'
import { errorSvg, hexOr, iconSvg, OFF_TRACK, spinnerSvg } from './icons'
import { chipId } from './model'
import {
  BORDER_MIX,
  CARD_BORDER,
  MORE_BORDER,
  ERROR_FG,
  ERROR_TINT,
  FRESH_MS,
  HOVER_MIX,
  isStopped,
  KIND_ORDER,
  mix,
  type Palette,
  SPIN_MS,
  SPINNER,
  STAT_TILE,
  STATUSES,
  STOPPED,
  STOPPED_BORDER,
  TOGGLES,
} from './theme'

/** `Svg` exists only where `$.ui.resolve(e)` is the Desktop table; it is the one Desktop switch. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button'> & {
  Svg?: ElementTable<'desktop'>['Svg']
}

export const isDesktop = (ui: Ui) => ui.Svg !== undefined

const isPill = (ui: Ui, tone: Palette) => isDesktop(ui) && tone !== undefined

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
}

export const lookOf = (kind: Kind | 'plugin', tone: Palette, status?: Status): Look => {
  const { palette, dim } = TOGGLES[kind]
  if (tone === undefined) {
    return { color: palette.key, tint: undefined, dim, border: undefined, hover: undefined }
  }
  if (status === 'error') {
    const [fg, tint] = [ERROR_FG[tone], ERROR_TINT[tone]]
    return { color: fg, tint, dim: false, border: fg, hover: mix(tint, fg, HOVER_MIX) }
  }
  const { fg, tint } = palette[tone]
  return {
    color: fg,
    tint,
    dim: false,
    border: mix(tint, fg, BORDER_MIX),
    hover: mix(tint, fg, HOVER_MIX),
  }
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

export const gapOf = (tone: Palette) => (tone === undefined ? 2 : 1)

type Parts = {
  glyph: string
  lead: string
  label: string
  count: string
  via: string
  badge: string
}

const partsOf = (a: Activation, settings: Settings, now: number, tone: Palette): Parts => {
  const status = STATUSES[a.status]
  const frame = Math.floor(now / 150)
  return {
    glyph:
      a.status === 'running'
        ? SPINNER[frame % SPINNER.length]!
        : (status.glyph ?? TOGGLES[a.kind].glyph),
    lead: a.lastAt > now - FRESH_MS ? '● ' : '',
    label: clip(a.label, LABEL_MAX),
    count: a.count > 1 && TOGGLES[a.kind].showsTally ? `×${a.count}` : '',
    via: settings.shown.plugin && a.plugin !== undefined ? `via ${clip(a.plugin, 16)}` : '',
    badge: a.status === 'error' && tone !== undefined ? 'Error' : (status.badge ?? ''),
  }
}

export const chipWidth = (
  a: Activation,
  settings: Settings,
  now: number,
  tone: Palette,
  hasHotkey: boolean,
  desktop = false,
) => {
  const p = partsOf(a, settings, now, tone)
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
    (desktop && tone ? 2 : 0)
  )
}

const moreLabel = (n: number) => `+${n} more`

const MORE_BOX = 4

export const fitChips = (
  chips: readonly Activation[],
  columns: number,
  settings: Settings,
  now: number,
  tone: Palette,
  desktop = false,
) => {
  const gap = gapOf(tone)
  const shown: Activation[] = []
  let used = 0
  for (const [index, chip] of chips.entries()) {
    if (shown.length >= settings.maxChips) break
    const width =
      chipWidth(chip, settings, now, tone, settings.hotkeys && index < 9, desktop) +
      (shown.length > 0 ? gap : 0)
    const rest = chips.length - shown.length - 1
    const reserve =
      rest > 0
        ? gap +
          moreLabel(rest).length +
          (settings.hotkeys ? 3 : 0) +
          (desktop && tone ? MORE_BOX : 0)
        : 0
    if (shown.length > 0 && used + width + reserve > columns) break
    shown.push(chip)
    used += width
  }
  return { shown, hidden: chips.length - shown.length }
}

export const summaryLabel = (chips: readonly Activation[]) => {
  const perKind = KIND_ORDER.flatMap(kind => {
    const n = chips.filter(a => a.kind === kind).length
    return n > 0 ? [`${TOGGLES[kind].glyph}${n}`] : []
  })
  return [`${chips.length} active`, perKind.join(' ')].filter(Boolean).join(' · ')
}

export const Badge = ({
  ui,
  text,
  tone,
  status,
}: {
  ui: Ui
  text: string
  tone: Palette
  status?: Status
}) => {
  const { Text } = ui
  if (tone === undefined) return <Text inverse bold color="error">{` ${text} `}</Text>
  if (status === 'error') {
    return (
      <Text bold color={ERROR_FG[tone]} backgroundColor={ERROR_TINT[tone]}>
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
  columns: number
  now: number
  tone: Palette
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
  if (a.status === 'error') return <Icon ui={ui} svg={errorSvg(hexOr(STOPPED.bg))} alt={noun} />
  return kindIcon(ui, a.kind, look)
}

const Chip = ({ args, a, index }: { args: RowArgs; a: Activation; index: number }) => {
  const { ui, now, tone, settings, selected, fits, on } = args
  const { Box, Button, Text } = ui
  const p = partsOf(a, settings, now, tone)
  const look = lookOf(a.kind, tone, a.status)
  const { color, tint, dim } = look
  const paint = { color, dimColor: dim, ...withTint(tint) }
  const id = chipId(a)
  const desktop = isDesktop(ui)
  const pill = isPill(ui, tone)
  const border =
    selected === id
      ? look.color
      : tone !== undefined && isStopped(a.status)
        ? STOPPED_BORDER[tone]
        : look.border
  return (
    <Box
      key={`box-${id}`}
      flexDirection="row"
      columnGap={1}
      paddingX={tone === undefined ? 0 : 1}
      {...withTint(tint)}
      {...(pill && {
        borderStyle: a.status === 'error' ? 'dashed' : 'round',
        borderColor: border,
      })}
      {...(desktop && look.hover !== undefined && { hover: { backgroundColor: look.hover } })}
    >
      {desktop ? (
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
      {p.count !== '' && <Text {...paint}>{p.count}</Text>}
      {p.via && (
        <Text dimColor {...withTint(tint)}>
          {p.via}
        </Text>
      )}
      {p.badge !== '' && <Badge ui={ui} text={p.badge} tone={tone} status={a.status} />}
    </Box>
  )
}

const MoreBox = ({ ui, tone, children }: { ui: Ui; tone: Palette; children: RenderElement }) =>
  isPill(ui, tone) ? (
    <ui.Box borderStyle="dashed" borderColor={MORE_BORDER[tone!]} paddingX={1}>
      {[children]}
    </ui.Box>
  ) : (
    <>{[children]}</>
  )

export const ChipRow = (args: RowArgs) => {
  const { ui, columns, now, tone, chips, settings, on } = args
  const { Box, Button, Text } = ui
  const gap = gapOf(tone)
  if (settings.layout === 'summary') {
    const stopped = chips.filter(a => isStopped(a.status)).length
    const neutral = lookOf('rule', tone)
    return (
      <Box
        flexDirection="row"
        columnGap={1}
        paddingX={tone === undefined ? 0 : 1}
        {...withTint(neutral.tint)}
      >
        <Button
          key="summary"
          plain
          {...(settings.hotkeys && { hotkey: '1' })}
          onPress={() => on.open()}
        >
          <Text {...withTint(neutral.tint)}>{summaryLabel(chips)}</Text>
        </Button>
        {stopped > 0 && (
          <Text color="error" {...withTint(neutral.tint)}>{`· ● ${stopped} stopped`}</Text>
        )}
      </Box>
    )
  }
  const { shown, hidden } = fitChips(
    chips,
    columns - MORE_RESERVE,
    settings,
    now,
    tone,
    isDesktop(ui),
  )
  return (
    <Box flexDirection="row" columnGap={gap}>
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
            <Text dimColor>{moreLabel(hidden)}</Text>
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
  color,
}: {
  ui: Ui
  tone: Palette
  title: string
  value: string
  color?: Color
}) => {
  const { Box, Text } = ui
  const tint = tone === undefined ? undefined : STAT_TILE[tone]
  return (
    <Box key={`tile-${title}`} flexDirection="column" flexGrow={1} paddingX={1} {...withTint(tint)}>
      <Text dimColor {...withTint(tint)}>
        {title}
      </Text>
      <Text bold {...(color !== undefined && { color })} {...withTint(tint)}>
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
  tone: Palette
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
  return (
    <Box
      key="card"
      flexDirection="column"
      borderStyle="round"
      borderColor={tone === undefined ? color : CARD_BORDER[tone]}
      borderDimColor={dim}
      paddingX={1}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={color} dimColor={dim}>
          {[theme.noun.toUpperCase(), a.meta].filter(Boolean).join(' · ')}
        </Text>
        {on.close && <Button key="close" plain label="✕" onPress={() => on.close?.()} />}
      </Box>
      {isDesktop(ui) ? (
        <Box flexDirection="row" columnGap={1}>
          {kindIcon(ui, a.kind, look)}
          <Text bold>{a.label}</Text>
        </Box>
      ) : (
        <Text bold>{a.label}</Text>
      )}
      <Text wrap="wrap">{a.detail}</Text>
      <Box flexDirection="row" columnGap={1}>
        <Tile
          ui={ui}
          tone={tone}
          title="Status"
          value={status.label}
          {...(status.color && { color: status.color })}
        />
        <Tile ui={ui} tone={tone} title="Activations" value={String(a.count)} />
        <Tile ui={ui} tone={tone} title="Last" value={agoLabel(now - a.lastAt)} />
      </Box>
      {a.source !== undefined && (
        <Text dimColor wrap="truncate-middle">
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
