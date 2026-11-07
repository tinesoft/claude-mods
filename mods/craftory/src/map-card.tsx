import type { IssueRef, Tone, WayTicket } from '../types'
import { mapChipText, routeClearText, type MapView } from './map-view'
import { paint, SPACE, TOKENS } from './theme'
import { inkOf, isRich, withTint, type Ui } from './ui'
import { CardButton } from './widgets'

/** The most Takeable rows the card lists; the rest are a count. */
const FRONTIER_ROWS = 5

export type MapActions = {
  map: () => void
  closeCard: () => void
  pickMap: (ref: IssueRef) => void
}

/** One chip for the active map: its name, how many tickets are decided and how many are open. */
export const MapChip = ({
  ui,
  tone,
  ascii,
  view,
  isOpen,
  on,
}: {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  view: MapView
  isOpen: boolean
  on: Pick<MapActions, 'map'>
}) => {
  const { Box, Button, Text } = ui
  const text = mapChipText(view, ascii)
  const button = (
    <Button key="map-chip" plain onPress={() => on.map()}>
      <Text {...(tone === undefined ? {} : { color: paint('skill', tone).fg })} underline={isOpen}>
        {text}
      </Text>
    </Button>
  )
  if (!isRich(ui) || tone === undefined) return button
  const t = TOKENS[tone]
  return (
    <Box
      key="box-map-chip"
      flexDirection="row"
      alignItems="center"
      paddingX={SPACE.phasePadX}
      borderStyle="round"
      borderColor={isOpen ? t.lineStrong : t.surface}
      backgroundColor={isOpen ? t.fill : t.surface}
    >
      {button}
    </Box>
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
  const claimed = view.claimed > 0 ? ` (${view.claimed} claimed)` : ''
  const frontier = view.map.isClosed
    ? null
    : view.open === 0
      ? routeClearText(view.map)
      : view.takeable.length === 0
        ? 'Nothing takeable'
        : null
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
        {`${view.decided} decided · ${view.open} open${claimed}${view.map.isClosed ? ' · Closed' : ''}`}
      </Text>
      {view.map.destination !== '' && (
        <Text {...inkOf(tone, 'ink2')} {...withTint(surface)}>
          {`Destination: ${view.map.destination}`}
        </Text>
      )}
      {shown.map(ticket => (
        <Text key={`frontier-${ticket.ref}`} {...inkOf(tone, 'ink')} {...withTint(surface)}>
          {`${ascii ? '>' : '▸'} ${ticket.title}${ticket.type === null ? '' : ` (${ticket.type})`}`}
        </Text>
      ))}
      {view.takeable.length > shown.length && (
        <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
          {`+${view.takeable.length - shown.length} more`}
        </Text>
      )}
      {view.isLinkStale && (
        <Text key="map-stale" {...inkOf(tone, 'text2')} {...withTint(surface)}>
          Map not found
        </Text>
      )}
      {view.others.map(other => (
        <Button key={`map-switch-${other.ref}`} plain onPress={() => on.pickMap(other.ref)}>
          <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
            {`${ascii ? '>' : '⇄'} ${other.title}`}
          </Text>
        </Button>
      ))}
      {frontier !== null && (
        <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
          {frontier}
        </Text>
      )}
    </Box>
  )
}

/** The `/wayfinder` argument that takes the next ticket of a map. */
export const workNextArg = (view: MapView) => view.map.location

/** The `/wayfinder` argument that takes one named ticket of a map. */
export const takeArg = (view: MapView, ticket: WayTicket) =>
  `${view.map.location} ${ticket.location}`

/** The map card that opens the Tickets tab: counts, Work next ticket, then Takeable, Claimed, Blocked, Decided. */
export const MapTicketsCard = ({
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
  on: { wayfinder: (arg: string) => void }
}) => {
  const { Box, Link, Text } = ui
  const decided = view.map.tickets.filter(t => t.state === 'resolved')
  const claimed = view.map.tickets.filter(t => t.state === 'claimed')
  const claimedNote = view.claimed > 0 ? ` (${view.claimed} claimed)` : ''
  const row = (ticket: WayTicket, glyph: string, note: string | null, action: boolean) => (
    <Box
      key={`row-${ticket.ref}`}
      flexDirection="row"
      columnGap={SPACE.rowLabelGap}
      flexWrap="wrap"
    >
      <Text {...inkOf(tone, 'ink')}>{glyph}</Text>
      <Link
        key={`row-link-${ticket.ref}`}
        href={ticket.location}
        label={`${ticket.title}${ticket.type === null ? '' : ` (${ticket.type})`}`}
      />
      {note !== null && <Text {...inkOf(tone, 'text2')}>{note}</Text>}
      {action && (
        <CardButton
          ui={ui}
          tone={tone}
          id={`take-${ticket.ref}`}
          label="Take"
          onPress={() => on.wayfinder(takeArg(view, ticket))}
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
        <Text {...inkOf(tone, 'text2')}>
          {`${view.decided} decided · ${view.open} open${claimedNote}${view.map.isClosed ? ' · Closed' : ''}`}
        </Text>
        {view.takeable.length > 0 ? (
          <CardButton
            ui={ui}
            tone={tone}
            id="work-next"
            label="Work next ticket"
            primary
            onPress={() => on.wayfinder(workNextArg(view))}
          />
        ) : (
          <Text key="work-next-off" {...inkOf(tone, 'muted')}>
            Work next ticket · Nothing takeable
          </Text>
        )}
      </Box>
      {view.open === 0 && <Text {...inkOf(tone, 'text2')}>{routeClearText(view.map)}</Text>}
      {view.takeable.length > 0 && heading('Takeable')}
      {view.takeable.map(t => row(t, ascii ? '>' : '▸', null, true))}
      {claimed.length > 0 && heading('Claimed')}
      {claimed.map(t =>
        row(t, ascii ? 'o' : '◐', t.assignee === null ? null : `@${t.assignee}`, false),
      )}
      {view.blocked.length > 0 && heading('Blocked')}
      {view.blocked.map(({ ticket, waitsOn }) =>
        row(
          ticket,
          ascii ? 'x' : '⊘',
          waitsOn.length > 0 ? `waits on ${waitsOn.join(', ')}` : 'blockers unknown',
          false,
        ),
      )}
      {decided.length > 0 && (
        <Text key="group-decided" {...inkOf(tone, 'text2')}>
          {`Decided (${decided.length}) ${ascii ? '>' : '▸'}`}
        </Text>
      )}
      <Link key="open-map" href={view.map.location} label="Open map" />
    </Box>
  )
}
