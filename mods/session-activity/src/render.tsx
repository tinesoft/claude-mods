import type { ElementTable, RenderElement, RenderSurface, SelectProps } from 'claude-code'

import type { Activation, Filter, Kind, Layout, PaneTab } from '../types'
import { chipId, paneGroups, type Settings } from './model'
import { isStopped, KIND_ORDER, KINDS, STATUSES } from './theme'

export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button'> & {
  Select?: (props: SelectProps) => RenderElement
}

const GAP = 3
const LABEL_MAX = 24

export const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`

const countText = (a: Activation) => (a.count > 1 && KINDS[a.kind].counts ? ` ×${a.count}` : '')

const kindColor = (kind: Kind, surface: RenderSurface) =>
  surface === 'desktop' ? KINDS[kind].hex : KINDS[kind].color

export const chipWidth = (a: Activation, index: number) => {
  const hotkey = index < 9 ? 3 : 0
  const badge = STATUSES[a.status].badge
  return (
    hotkey +
    2 +
    clip(a.label, LABEL_MAX).length +
    countText(a).length +
    (badge ? badge.length + 3 : 0)
  )
}

const moreLabel = (n: number) => `+${n} more`

export const fitChips = (chips: readonly Activation[], columns: number, max: number) => {
  const shown: Activation[] = []
  let used = 0
  for (const [index, chip] of chips.entries()) {
    if (shown.length >= max) break
    const width = chipWidth(chip, index) + (shown.length > 0 ? GAP : 0)
    const rest = chips.length - shown.length - 1
    const reserve = rest > 0 ? GAP + 3 + moreLabel(rest).length : 0
    if (shown.length > 0 && used + width + reserve > columns) break
    shown.push(chip)
    used += width
  }
  return { shown, hidden: chips.length - shown.length }
}

const Badge = ({ ui, a }: { ui: Ui; a: Activation }) => {
  const { Text } = ui
  const status = STATUSES[a.status]
  if (!status.badge) return null
  return status.dim ? (
    <Text dimColor>{` ${status.badge}`}</Text>
  ) : (
    <Text inverse bold color={status.color}>{` ${status.badge} `}</Text>
  )
}

const Glyph = ({ ui, kind, surface }: { ui: Ui; kind: Kind; surface: RenderSurface }) => {
  const { Text } = ui
  return (
    <Text color={kindColor(kind, surface)} dimColor={KINDS[kind].dim}>
      {KINDS[kind].glyph}
    </Text>
  )
}

export type BandArgs = {
  ui: Ui
  surface: RenderSurface
  columns: number
  chips: readonly Activation[]
  settings: Settings
  below: RenderElement
  onOpen: (id?: string) => void
}

export const summaryLabel = (chips: readonly Activation[]) => {
  const perKind = KIND_ORDER.flatMap(kind => {
    const n = chips.filter(a => a.kind === kind).length
    return n > 0 ? [`${KINDS[kind].glyph}${n}`] : []
  })
  const stopped = chips.filter(a => isStopped(a.status)).length
  return [`${chips.length} active`, perKind.join(' '), stopped > 0 ? `${stopped} stopped` : '']
    .filter(Boolean)
    .join(' · ')
}

export const renderBand = ({ ui, surface, columns, chips, settings, below, onOpen }: BandArgs) => {
  const { Box, Button, Text } = ui
  if (settings.layout === 'summary') {
    return (
      <Box flexDirection="row" columnGap={GAP}>
        {below}
        <Button key="summary" plain hotkey="1" onPress={() => onOpen()}>
          <Text>{summaryLabel(chips)}</Text>
        </Button>
      </Box>
    )
  }
  const { shown, hidden } = fitChips(chips, columns, settings.maxChips)
  return (
    <Box flexDirection="row" columnGap={GAP}>
      {below}
      {shown.map((a, index) => (
        <Button
          key={`chip-${a.kind}-${a.key}`}
          plain
          {...(index < 9 && { hotkey: String(index + 1) })}
          onPress={() => onOpen(chipId(a))}
        >
          <Glyph ui={ui} kind={a.kind} surface={surface} />
          {` ${clip(a.label, LABEL_MAX)}${countText(a)}`}
          <Badge ui={ui} a={a} />
        </Button>
      ))}
      {hidden > 0 && (
        <Button key="more" plain hotkey="0" onPress={() => onOpen()}>
          <Text dimColor>{moreLabel(hidden)}</Text>
        </Button>
      )}
    </Box>
  )
}

export const ago = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h`
}

const pad = (text: string, width: number) => clip(text, width).padEnd(width)

export type PaneArgs = {
  ui: Ui
  surface: RenderSurface
  columns: number
  now: number
  activations: readonly Activation[]
  settings: Settings
  muted: readonly string[]
  selected: string | null
  tab: PaneTab
  filter: Filter
  on: {
    tab: (tab: PaneTab) => void
    filter: (filter: Filter) => void
    select: (id: string) => void
    mute: (id: string) => void
    copy: (text: string) => void
    layout: (layout: Layout) => void
    toggleKind: (kind: Kind) => void
    toggleEnabled: () => void
    reset: () => void
    allOn: () => void
  }
}

const Tabs = ({ ui, tab, on }: Pick<PaneArgs, 'ui' | 'tab' | 'on'>) => {
  const { Box, Button, Text } = ui
  const tabs: [PaneTab, string, string][] = [
    ['activity', '1', 'Activity'],
    ['settings', '2', 'Settings'],
  ]
  return (
    <Box flexDirection="row" columnGap={GAP}>
      {tabs.map(([id, hotkey, title]) => (
        <Button key={`tab-${id}`} plain hotkey={hotkey} onPress={() => on.tab(id)}>
          <Text bold={tab === id} dimColor={tab !== id}>
            {title}
          </Text>
        </Button>
      ))}
    </Box>
  )
}

const Filters = (args: PaneArgs) => {
  const { ui, activations, settings, filter, on } = args
  const { Box, Button, Text } = ui
  const kinds = KIND_ORDER.filter(
    kind => settings.shown[kind] && activations.some(a => a.kind === kind),
  )
  const total = activations.filter(a => settings.shown[a.kind]).length
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={GAP}>
      <Button key="filter-all" plain hotkey="a" onPress={() => on.filter('all')}>
        <Text bold={filter === 'all'}>{`All ${total}`}</Text>
      </Button>
      {kinds.map(kind => (
        <Button
          key={`filter-${kind}`}
          plain
          hotkey={KINDS[kind].hotkey}
          onPress={() => on.filter(kind)}
        >
          <Text bold={filter === kind}>
            {`${KINDS[kind].plural} ${activations.filter(a => a.kind === kind).length}`}
          </Text>
        </Button>
      ))}
    </Box>
  )
}

const Row = ({ args, a }: { args: PaneArgs; a: Activation }) => {
  const { ui, surface, columns, now, muted, selected, on } = args
  const { Box, Button, Text } = ui
  const id = chipId(a)
  const isSelected = selected === id
  const isMuted = muted.includes(id)
  const metaWidth = Math.max(8, Math.min(24, columns - 52))
  return (
    <Box flexDirection="column">
      <Button key={`row-${a.kind}-${a.key}`} plain onPress={() => on.select(id)}>
        {isSelected ? '▸ ' : '  '}
        <Glyph ui={ui} kind={a.kind} surface={surface} />
        {` ${pad(a.label, 18)} `}
        <Text
          dimColor
        >{`${pad(a.meta ?? '', metaWidth)} ×${a.count} · ${ago(now - a.lastAt)}`}</Text>
        {isMuted && <Text dimColor> muted</Text>}
        <Badge ui={ui} a={a} />
      </Button>
      {isSelected && (
        <Box flexDirection="column" paddingLeft={4}>
          <Text wrap="wrap">{a.detail}</Text>
          {a.source !== undefined && (
            <Text dimColor wrap="truncate-start">
              {a.source}
            </Text>
          )}
          {a.plugin !== undefined && <Text dimColor>{`from plugin ${a.plugin}`}</Text>}
          <Box flexDirection="row" columnGap={GAP}>
            <Button
              key="mute"
              plain
              hotkey="m"
              label={isMuted ? 'Unmute' : 'Mute'}
              onPress={() => on.mute(id)}
            />
            {a.source !== undefined && (
              <Button
                key="copy"
                plain
                hotkey="c"
                label="Copy path"
                onPress={() => on.copy(a.source!)}
              />
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}

const Activity = (args: PaneArgs) => {
  const { ui, activations, settings, filter } = args
  const { Box, Text } = ui
  const groups = paneGroups(activations, settings, filter)
  return (
    <Box flexDirection="column">
      <Filters {...args} />
      {groups.length === 0 && <Text dimColor>Nothing has activated yet in this session.</Text>}
      {groups.map(group => (
        <Box key={`group-${group.kind}`} flexDirection="column" marginTop={1}>
          <Text bold>{KINDS[group.kind].plural}</Text>
          {group.rows.map(a => (
            <Row args={args} a={a} />
          ))}
        </Box>
      ))}
    </Box>
  )
}

const Toggle = ({ args, kind }: { args: PaneArgs; kind: Kind }) => {
  const { ui, surface, settings, on } = args
  const { Button } = ui
  return (
    <Button key={`toggle-${kind}`} plain onPress={() => on.toggleKind(kind)}>
      {settings.shown[kind] ? '[x] ' : '[ ] '}
      <Glyph ui={ui} kind={kind} surface={surface} />
      {` ${KINDS[kind].plural}`}
    </Button>
  )
}

const SettingsTab = (args: PaneArgs) => {
  const { ui, settings, on } = args
  const { Box, Button, Text, Select } = ui
  const layouts: Layout[] = ['row', 'summary']
  return (
    <Box flexDirection="column">
      <Button key="toggle-enabled" plain onPress={() => on.toggleEnabled()}>
        {`${settings.enabled ? '[x]' : '[ ]'} Show chips above the prompt`}
        <Text dimColor> (blocked and denied always show while on)</Text>
      </Button>
      {Select ? (
        <Select
          key="layout"
          label="Layout"
          value={settings.layout}
          options={[
            { value: 'row', label: 'A row of chips' },
            { value: 'summary', label: 'One summary chip' },
          ]}
          onSelect={value => on.layout(value === 'summary' ? 'summary' : 'row')}
        />
      ) : (
        <Button
          key="layout"
          plain
          onPress={() => on.layout(layouts.find(l => l !== settings.layout)!)}
        >
          {`Layout: ${settings.layout}`}
        </Button>
      )}
      <Text bold>Shown by default</Text>
      {KIND_ORDER.filter(kind => !KINDS[kind].isOptional).map(kind => (
        <Toggle args={args} kind={kind} />
      ))}
      <Text bold>Optional</Text>
      {KIND_ORDER.filter(kind => KINDS[kind].isOptional).map(kind => (
        <Toggle args={args} kind={kind} />
      ))}
      <Text dimColor>Memory and checkpoints are not supported yet.</Text>
      <Box flexDirection="row" columnGap={2} marginTop={1}>
        <Button key="reset" label="Reset to defaults" onPress={() => on.reset()} />
        <Button key="all-on" label="Turn everything on" onPress={() => on.allOn()} />
      </Box>
    </Box>
  )
}

export const renderPane = (args: PaneArgs) => {
  const { Box } = args.ui
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Tabs ui={args.ui} tab={args.tab} on={args.on} />
      </Box>
      {args.tab === 'activity' ? <Activity {...args} /> : <SettingsTab {...args} />}
    </Box>
  )
}
