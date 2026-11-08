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
  ticketLabel,
  type MapView,
} from './map-view'
import { paint, SPACE, TOKENS } from './theme'
import { diamondSvg, hexOr } from './icons'
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

/** The frontier card: where the map is, how far along, and the tickets that can be taken now. */
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
  on: Pick<MapActions, 'closeCard' | 'pickMap'>
}) => {
  const { Box, Button, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const surface = rich ? TOKENS[tone].surface : undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  const colours = paint('skill', tone)
  const shown = view.takeable.slice(0, FRONTIER_ROWS)
  const statusLine =
    routeStatus(view) ??
    (!view.map.isClosed && view.takeable.length === 0 ? 'Nothing takeable' : null)
  return (
    <Box
      key="map-card"
      flexDirection="column"
      borderStyle="round"
      borderColor={t === undefined ? colours.fg : t.line}
      paddingX={SPACE.cardPadX}
      rowGap={SPACE.cardGap}
      {...withTint(surface)}
    >
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.cardHeadGap}>
        <Box flexShrink={1} minWidth={0}>
          <Text mono size="caption" color={colours.fg} wrap="truncate-end" {...withTint(surface)}>
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
      {shown.map(ticket => (
        <Text key={`frontier-${ticket.ref}`} {...inkOf(tone, 'ink')} {...withTint(surface)}>
          {`${glyph('takeable', ascii)} ${ticketLabel(ticket)}`}
        </Text>
      ))}
      {view.takeable.length > shown.length && (
        <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
          {`+${view.takeable.length - shown.length} more`}
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
      {statusLine !== null && (
        <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
          {statusLine}
        </Text>
      )}
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
  on: { wayfinder: (arg: string) => void; decided: () => void }
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
      <Link key={`row-link-${ticket.ref}`} href={ticket.location} label={ticketLabel(ticket)} />
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
      <Text key="map-kicker" mono size="caption" {...inkOf(tone, 'text2')}>
        {view.kicker}
      </Text>
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
