import type { Tone } from '../types'
import { mapChipText, type MapView } from './map-view'
import { paint, SPACE, TOKENS } from './theme'
import { inkOf, isRich, withTint, type Ui } from './ui'

/** The most Takeable rows the card lists; the rest are a count. */
const FRONTIER_ROWS = 5

export type MapActions = { map: () => void; closeCard: () => void }

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
  on: Pick<MapActions, 'closeCard'>
}) => {
  const { Box, Button, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const surface = rich ? TOKENS[tone].surface : undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  const colours = paint('skill', tone)
  const shown = view.takeable.slice(0, FRONTIER_ROWS)
  const claimed = view.claimed > 0 ? ` (${view.claimed} claimed)` : ''
  const frontier =
    view.open === 0
      ? `No open tickets · Route clear?${view.map.hasFog ? ' Not yet specified still has fog.' : ''}`
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
        {`${view.decided} decided · ${view.open} open${claimed}`}
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
      {frontier !== null && (
        <Text {...inkOf(tone, 'text2')} {...withTint(surface)}>
          {frontier}
        </Text>
      )}
    </Box>
  )
}
