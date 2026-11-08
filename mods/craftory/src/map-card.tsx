import type { IssueRef, Tone, WayTicket } from '../types'
import {
  mapArg,
  mapChipCompact,
  mapChipCounts,
  mapChipGlyph,
  mapChipName,
  mapCountsText,
  routeStatus,
  ticketArg,
  ticketTypeLabel,
  ticketTypeRole,
  type MapView,
} from './map-view'
import { paint, SPACE, TOKENS } from './theme'
import { diamondSvg, hexOr, ruleSvg } from './icons'
import { Chip, inkOf, isRich, withTint, type Ui } from './ui'
import { CardButton } from './widgets'

/** The most Takeable rows the card lists; the rest are a count. */
const FRONTIER_ROWS = 5

/** What marks a ticket's state, and a group's fold, on rich surfaces and with the glyphs off. */
const GLYPHS = {
  takeable: { rich: '▸', ascii: '>' },
  claimed: { rich: '◐', ascii: 'o' },
  blocked: { rich: '⊘', ascii: 'x' },
  decided: { rich: '✓', ascii: '+' },
  switch: { rich: '⇄', ascii: '>' },
  expanded: { rich: '▾', ascii: 'v' },
  collapsed: { rich: '▸', ascii: '>' },
} as const

const glyph = (name: keyof typeof GLYPHS, ascii: boolean) => GLYPHS[name][ascii ? 'ascii' : 'rich']

/** The quiet line for a Feature whose `map` link names nothing map-shaped. */
const MapNotFound = ({ ui, tone, tint }: { ui: Ui; tone: Tone | undefined; tint?: string }) => {
  const { Text } = ui
  return (
    <Text key="map-stale" {...inkOf(tone, 'text2')} {...withTint(tint)}>
      Map not found
    </Text>
  )
}

export type MapActions = {
  map: () => void
  closeCard: () => void
  pickMap: (ref: IssueRef) => void
}

/**
 * One chip for the active map, in the agent colour: `◆ <name> · n decided · n open`, or with
 * `compact` the summary's `◆ <name> 2✓ 4?`. Drawn with the chip pattern; `map-chip` is the press.
 */
export const MapChip = ({
  ui,
  tone,
  ascii,
  view,
  isOpen,
  compact = false,
  on,
}: {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  view: MapView
  isOpen: boolean
  compact?: boolean
  on: Pick<MapActions, 'map'>
}) => {
  const { Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const agent = paint('agent', tone)
  const counts = compact ? mapChipCompact(view, ascii) : `· ${mapChipCounts(view)}`
  return (
    <Chip
      ui={ui}
      tone={tone}
      id="map-chip"
      role="agent"
      icon={diamondSvg(hexOr(agent.fg))}
      glyph={mapChipGlyph(ascii)}
      label={mapChipName(view)}
      bold={rich}
      pressed={isOpen}
      onPress={() => on.map()}
    >
      {rich ? (
        <Text mono size="caption" color={agent.fg}>
          {counts}
        </Text>
      ) : (
        <Text underline={isOpen}>{` ${counts}`}</Text>
      )}
    </Chip>
  )
}

/** One Takeable row: `▸ title` and the ticket's type, as an outlined badge where the surface is rich. */
const FrontierRow = ({
  ui,
  tone,
  ascii,
  ticket,
  tint,
}: {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  ticket: WayTicket
  tint: string | undefined
}) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const type = ticketTypeLabel(ticket.type)
  const typeInk = ticket.type === null ? undefined : paint(ticketTypeRole(ticket.type), tone).fg
  const key = `frontier-${ticket.ref}`
  if (!rich) {
    return (
      <Box key={key} flexDirection="row">
        <Text {...inkOf(tone, 'ink')}>
          {`${glyph('takeable', ascii)} ${ticket.title}${type === null ? '' : ' '}`}
        </Text>
        {type !== null && <Text color={typeInk}>{type}</Text>}
      </Box>
    )
  }
  return (
    <Box
      key={key}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.rowLabelGap}
      paddingX={SPACE.chipPadX}
      {...withTint(tint)}
    >
      <Text color={paint('skill', tone).fg}>{glyph('takeable', ascii)}</Text>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text bold {...inkOf(tone, 'ink')} wrap="truncate-end">
          {ticket.title}
        </Text>
      </Box>
      {type !== null && (
        <Box
          key={`frontier-type-${ticket.ref}`}
          paddingX={SPACE.chipPadX}
          borderStyle="round"
          borderColor={typeInk}
        >
          <Text bold size="caption" color={typeInk}>
            {type}
          </Text>
        </Box>
      )}
    </Box>
  )
}

/**
 * The frontier card: where the map is, how far along, the Takeable tickets under "Frontier ·
 * takeable now", then Work next ticket and Open map. Desktop frames the list with a header strip.
 */
export const FrontierCard = ({
  ui,
  tone,
  ascii,
  view,
  on,
}: {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  view: MapView
  on: Pick<MapActions, 'closeCard' | 'pickMap'> & { wayfinder: (arg: string) => void }
}) => {
  const { Box, Button, Link, Svg, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const surface = rich ? TOKENS[tone].surface : undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  const agent = paint('agent', tone)
  const shown = view.takeable.slice(0, FRONTIER_ROWS)
  const route = routeStatus(view)
  const more = view.takeable.length - shown.length
  const heading = 'Frontier · takeable now'
  const rows = shown.map(ticket => (
    <FrontierRow
      key={ticket.ref}
      ui={ui}
      tone={tone}
      ascii={ascii}
      ticket={ticket}
      tint={surface}
    />
  ))
  const frontier =
    shown.length === 0 ? null : rich && t !== undefined ? (
      <Box
        key="frontier"
        flexDirection="column"
        borderStyle="round"
        borderColor={t.line}
        {...withTint(surface)}
      >
        <Box key="frontier-head" paddingX={SPACE.chipPadX} backgroundColor={t.surface2}>
          <Text bold size="caption" {...inkOf(tone, 'ink')}>
            {heading}
          </Text>
        </Box>
        {rows.flatMap((row, i) =>
          i === 0 || Svg === undefined
            ? [row]
            : [<Svg key={`rule-${i}`} source={ruleSvg(t.lineSoft)} alt="" height={1} />, row],
        )}
      </Box>
    ) : (
      <Box key="frontier" flexDirection="column">
        <Box key="frontier-head">
          <Text bold {...inkOf(tone, 'ink')}>
            {heading}
          </Text>
        </Box>
        {rows}
      </Box>
    )
  return (
    <Box
      key="map-card"
      flexDirection="column"
      borderStyle="round"
      borderColor={t === undefined ? agent.fg : t.line}
      paddingX={SPACE.cardPadX}
      rowGap={SPACE.cardGap}
      {...withTint(surface)}
    >
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.cardHeadGap}>
        <Box flexShrink={1} minWidth={0}>
          <Text mono size="caption" color={agent.fg} wrap="truncate-end" {...withTint(surface)}>
            {view.kicker}
          </Text>
        </Box>
        <Button key="close" plain hotkey="x" label="Close" onPress={() => on.closeCard()} />
      </Box>
      <Text bold {...inkOf(tone, 'ink')} {...withTint(surface)}>
        {view.map.title}
      </Text>
      <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
        {mapCountsText(view)}
      </Text>
      {view.map.destination !== '' && (
        <Text {...inkOf(tone, 'ink2')} {...withTint(surface)}>
          {`Destination: ${view.map.destination}`}
        </Text>
      )}
      {frontier}
      {more > 0 && (
        <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
          {`+${more} more`}
        </Text>
      )}
      {view.isLinkStale && <MapNotFound ui={ui} tone={tone} tint={surface} />}
      {view.others.map(other => (
        <Button key={`map-switch-${other.ref}`} plain onPress={() => on.pickMap(other.ref)}>
          <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
            {`${glyph('switch', ascii)} ${other.title}`}
          </Text>
        </Button>
      ))}
      {route !== null && (
        <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
          {route}
        </Text>
      )}
      <Box flexDirection="row" alignItems="center" flexWrap="wrap" columnGap={SPACE.buttonsGap}>
        {view.takeable.length > 0 ? (
          <CardButton
            ui={ui}
            tone={tone}
            id="frontier-work-next"
            label="Work next ticket"
            primary
            onPress={() => on.wayfinder(mapArg(view.map))}
          />
        ) : (
          // the engine's Button has no disabled prop, so the off state is the hint, not pressable
          <Box key="frontier-work-next-off">
            <Text {...inkOf(tone, 'muted')} {...withTint(surface)}>
              Work next ticket · Nothing takeable
            </Text>
          </Box>
        )}
        {/* the Tickets tab's link, framed as the secondary button on rich surfaces */}
        <Box
          key="frontier-open-map"
          {...(rich &&
            t !== undefined && {
              paddingX: SPACE.buttonPadX,
              borderStyle: 'round',
              borderColor: t.line,
              backgroundColor: t.surface,
            })}
        >
          <Link href={view.map.location} label="Open map" />
        </Box>
      </Box>
    </Box>
  )
}

/** The map card that opens the Tickets tab: counts, Work next ticket, then Takeable, Claimed, Blocked, Decided. */
export const MapTicketsCard = ({
  ui,
  tone,
  ascii,
  view,
  isDecidedOpen,
  on,
}: {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  view: MapView
  isDecidedOpen: boolean
  on: { wayfinder: (arg: string) => void; decided: () => void } & Pick<MapActions, 'pickMap'>
}) => {
  const { Box, Button, Link, Text } = ui
  const decided = view.map.tickets.filter(t => t.state === 'resolved')
  const claimed = view.map.tickets.filter(t => t.state === 'claimed')
  const route = routeStatus(view)
  const row = (ticket: WayTicket, glyph: string, note: string | null, isTakeable: boolean) => (
    <Box
      key={`row-${ticket.ref}`}
      flexDirection="row"
      columnGap={SPACE.rowLabelGap}
      flexWrap="wrap"
    >
      <Text {...inkOf(tone, 'ink')}>{glyph}</Text>
      <Link key={`row-link-${ticket.ref}`} href={ticket.location} label={ticket.title} />
      {ticket.type !== null && (
        <Text mono size="caption" {...inkOf(tone, 'text2')}>
          {ticketTypeLabel(ticket.type)}
        </Text>
      )}
      {note !== null && <Text {...inkOf(tone, 'text2')}>{note}</Text>}
      {isTakeable && (
        <CardButton
          ui={ui}
          tone={tone}
          id={`take-${ticket.ref}`}
          label="Take"
          onPress={() => on.wayfinder(ticketArg(view.map, ticket))}
        />
      )}
    </Box>
  )
  const heading = (text: string) => (
    <Text key={`group-${text}`} bold {...inkOf(tone, 'ink')}>
      {text}
    </Text>
  )
  return (
    <Box key="tickets-map" flexDirection="column" rowGap={SPACE.lineGap}>
      <Box
        key="tickets-map-head"
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        columnGap={SPACE.rowLabelGap}
      >
        <Text key="map-kicker" mono size="caption" {...inkOf(tone, 'text2')}>
          {view.kicker}
        </Text>
        {view.others.map(other => (
          <Button
            key={`tickets-switch-${other.ref}`}
            plain
            label={`${glyph('switch', ascii)} ${other.title}`}
            onPress={() => on.pickMap(other.ref)}
          />
        ))}
      </Box>
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        columnGap={SPACE.rowLabelGap}
      >
        <Text {...inkOf(tone, 'text2')}>{mapCountsText(view)}</Text>
        {view.takeable.length > 0 ? (
          <CardButton
            ui={ui}
            tone={tone}
            id="work-next"
            label="Work next ticket"
            primary
            onPress={() => on.wayfinder(mapArg(view.map))}
          />
        ) : (
          // the engine's Button has no disabled prop, so the off state is the hint, not pressable
          <Text key="work-next-off" {...inkOf(tone, 'muted')}>
            Work next ticket · Nothing takeable
          </Text>
        )}
      </Box>
      {route !== null && <Text {...inkOf(tone, 'text2')}>{route}</Text>}
      {view.takeable.length > 0 && heading('Takeable')}
      {view.takeable.map(t => row(t, glyph('takeable', ascii), null, true))}
      {claimed.length > 0 && heading('Claimed')}
      {claimed.map(t =>
        row(t, glyph('claimed', ascii), t.assignee === null ? null : `@${t.assignee}`, false),
      )}
      {view.blocked.length > 0 && heading('Blocked')}
      {view.blocked.map(({ ticket, waitsOn }) =>
        row(
          ticket,
          glyph('blocked', ascii),
          waitsOn.length > 0 ? `waits on ${waitsOn.join(', ')}` : 'blockers unknown',
          false,
        ),
      )}
      {decided.length > 0 && (
        <Button key="decided-toggle" plain onPress={() => on.decided()}>
          <Text {...inkOf(tone, 'text2')}>
            {`Decided (${decided.length}) ${glyph(isDecidedOpen ? 'expanded' : 'collapsed', ascii)}`}
          </Text>
        </Button>
      )}
      {isDecidedOpen && decided.map(t => row(t, glyph('decided', ascii), null, false))}
      {view.isLinkStale && <MapNotFound ui={ui} tone={tone} />}
      <Link key="open-map" href={view.map.location} label="Open map" />
    </Box>
  )
}
