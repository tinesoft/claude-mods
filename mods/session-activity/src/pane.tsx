import type { Color, RenderSurface } from 'claude-code'

import type {
  Activation,
  ChipStyle,
  Filter,
  Layout,
  Overrides,
  PaneView,
  Settings,
  Toggle,
} from '../types'
import { chipId, inPane, paneGroups, sampleActivations, startedAgo } from './model'
import { hexOr, switchSvg, SWITCH_SIZE } from './icons'
import {
  agoLabel,
  Badge,
  ago,
  ChipRow,
  clip,
  DetailCard,
  Icon,
  isRich,
  kindIcon,
  lookOf,
  type Ui,
} from './render'
import { isUrgent, KIND_ORDER, type Tone, STATUSES, TOGGLE_ORDER, TOGGLES } from './theme'

const GAP = 3

const ACCENT = '#2F6FED'

export type PaneFlag = 'enabled' | 'hotkeys' | 'toastOnBlock' | 'textSummary'

export type PaneArgs = {
  ui: Ui
  surface: RenderSurface
  columns: number
  now: number
  tone: Tone | undefined
  activations: readonly Activation[]
  settings: Settings
  muted: readonly string[]
  selected: string | null
  view: PaneView
  filter: Filter
  on: {
    view: (view: PaneView) => void
    filter: (filter: Filter) => void
    select: (id: string) => void
    mute: (id: string) => void
    copy: (text: string) => void
    set: (patch: Overrides) => void
    toggle: (flag: PaneFlag) => void
    toggleShown: (toggle: Toggle) => void
    reset: () => void
    allOn: () => void
  }
}

const withTint = (tint: Color | undefined) => (tint === undefined ? {} : { backgroundColor: tint })

const Tabs = ({ ui, view, on }: Pick<PaneArgs, 'ui' | 'view' | 'on'>) => {
  const { Box, Button, Text } = ui
  const tabs: [PaneView, string, string][] = [
    ['activity', '1', 'Activity'],
    ['settings', '2', 'Settings'],
  ]
  return (
    <Box flexDirection="row" columnGap={GAP}>
      {tabs.map(([id, hotkey, title]) => (
        <Button key={`tab-${id}`} plain hotkey={hotkey} onPress={() => on.view(id)}>
          <Text bold={view === id} dimColor={view !== id}>
            {title}
          </Text>
        </Button>
      ))}
    </Box>
  )
}

const Filters = ({ ui, tone, activations, settings, filter, on }: PaneArgs) => {
  const { Box, Button, Text } = ui
  const listed = activations.filter(a => inPane(a, settings))
  const kinds = KIND_ORDER.filter(kind => listed.some(a => a.kind === kind))
  const choices: [Filter, string, string, number][] = [
    ['all', 'a', 'All', listed.length],
    ...kinds.map((kind): [Filter, string, string, number] => [
      kind,
      TOGGLES[kind].hotkey,
      TOGGLES[kind].plural,
      listed.filter(a => a.kind === kind).length,
    ]),
  ]
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={GAP}>
      {choices.map(([id, hotkey, title, n]) => (
        <Box key={`filterbox-${id}`} flexDirection="row" columnGap={1}>
          {isRich(ui) && id !== 'all' && kindIcon(ui, id, lookOf(id, tone))}
          <Button key={`filter-${id}`} plain hotkey={hotkey} onPress={() => on.filter(id)}>
            <Text bold={filter === id} dimColor={filter !== id}>{`${title} ${n}`}</Text>
          </Button>
        </Box>
      ))}
    </Box>
  )
}

const Row = ({ args, a }: { args: PaneArgs; a: Activation }) => {
  const { ui, columns, now, tone, muted, selected, on } = args
  const { Box, Button, Text } = ui
  const id = chipId(a)
  const isSelected = selected === id
  const isMuted = muted.includes(id)
  const look = lookOf(a.kind, tone)
  const { color, tint, dim } = look
  const badgeText = STATUSES[a.status].badge
  const desktop = isRich(ui)
  return (
    <Box
      key={`rowbox-${id}`}
      flexDirection="column"
      {...(desktop && look.hover !== undefined && { hover: { backgroundColor: look.hover } })}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          {desktop && <Box paddingRight={1}>{kindIcon(ui, a.kind, look)}</Box>}
          <Button key={`row-${a.kind}-${a.key}`} plain onPress={() => on.select(id)}>
            <Text>{isSelected ? '▸' : ' '}</Text>
            {!desktop && (
              <Text
                color={color}
                dimColor={dim || isMuted}
                {...withTint(tint)}
              >{` ${TOGGLES[a.kind].glyph} `}</Text>
            )}
            <Text bold dimColor={isMuted}>{` ${clip(a.label, 28)}`}</Text>
            {a.meta !== undefined && (
              <Text dimColor>{` ${clip(a.meta, Math.max(8, columns - 52))}`}</Text>
            )}
            {badgeText !== undefined && <Badge ui={ui} text={badgeText} tone={tone} />}
            {isMuted && (
              <Text bold inverse dimColor>
                {' Muted '}
              </Text>
            )}
          </Button>
        </Box>
        <Text dimColor>{`×${a.count} · ${ago(now - a.lastAt)}`}</Text>
      </Box>
      <Box flexDirection="column" paddingLeft={6}>
        {!isSelected && (
          <Text dimColor wrap="truncate-end">
            {a.detail}
          </Text>
        )}
        {isSelected && (
          <Box flexDirection="column">
            <Text wrap="wrap">{a.detail}</Text>
            {a.plugin !== undefined && <Text dimColor>{`from plugin ${a.plugin}`}</Text>}
            {a.source !== undefined && (
              <Text dimColor wrap="truncate-middle">
                {a.source}
              </Text>
            )}
            <Box flexDirection="row" columnGap={GAP}>
              {isUrgent(a.status) ? (
                <Text dimColor>Stopped and errored chips always show.</Text>
              ) : (
                <Button
                  key="mute"
                  plain
                  hotkey="m"
                  label={isMuted ? 'Unmute' : 'Mute'}
                  onPress={() => on.mute(id)}
                />
              )}
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
    </Box>
  )
}

const Activity = (args: PaneArgs) => {
  const { ui, now, tone, activations, settings, filter, on } = args
  const { Box, Button, Text } = ui
  const groups = paneGroups(activations, settings, filter)
  const listed = activations.filter(a => inPane(a, settings))
  const total = listed.reduce((sum, a) => sum + a.count, 0)
  const started = startedAgo(listed, now)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={GAP}>
        <Text dimColor>
          {`${listed.length} items · ${total} activations · started ${started < 60_000 ? 'just now' : agoLabel(started)}`}
        </Text>
        <Button key="customize" plain dimColor onPress={() => on.view('settings')}>
          <Text dimColor>Customize</Text>
        </Button>
      </Box>
      <Filters {...args} />
      {groups.length === 0 && <Text dimColor>Nothing has activated yet in this session.</Text>}
      {groups.map(group => {
        const { color, dim } = lookOf(group.kind, tone)
        return (
          <Box key={`group-${group.kind}`} flexDirection="column" marginTop={1}>
            <Box flexDirection="row" columnGap={1}>
              <Text color={color} dimColor={dim}>
                {TOGGLES[group.kind].plural.toUpperCase()}
              </Text>
              <Text dimColor>{String(group.rows.length)}</Text>
            </Box>
            {group.rows.map(a => (
              <Row args={args} a={a} />
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

const Detail = ({ ui, tone, now, activations, selected, muted, on }: PaneArgs) => {
  const { Box, Button, Text } = ui
  const a = activations.find(x => chipId(x) === selected)
  return (
    <Box flexDirection="column">
      {a ? (
        <DetailCard
          ui={ui}
          tone={tone}
          now={now}
          a={a}
          isMuted={muted.includes(chipId(a))}
          on={{ mute: on.mute, copy: on.copy }}
        />
      ) : (
        <Text dimColor>Nothing is selected.</Text>
      )}
      <Button
        key="back"
        plain
        hotkey="a"
        label="All activity"
        onPress={() => on.view('activity')}
      />
    </Box>
  )
}

const Switch = ({
  ui,
  id,
  isOn,
  title,
  description,
  glyph,
  accent,
  onPress,
}: {
  ui: Ui
  id: string
  isOn: boolean
  title: string
  description: string
  glyph?: { text: string; color: Color; tint?: Color }
  accent?: Color
  onPress: () => void
}) => {
  const { Box, Button, Text } = ui
  return (
    <Box key={`row-${id}`} flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        <Icon
          ui={ui}
          svg={switchSvg(isOn, hexOr(accent, ACCENT))}
          alt={isOn ? 'On' : 'Off'}
          width={SWITCH_SIZE.width}
          height={SWITCH_SIZE.height}
        />
        <Button key={id} plain dimColor={!isOn} onPress={onPress}>
          <Text dimColor={!isOn}>{isOn ? '●' : '○'}</Text>
          {glyph && (
            <Text color={glyph.color} dimColor={!isOn} {...withTint(glyph.tint)}>
              {` ${glyph.text} `}
            </Text>
          )}
          <Text bold dimColor={!isOn}>{` ${title}`}</Text>
        </Button>
      </Box>
      <Box paddingLeft={3}>
        <Text dimColor wrap="wrap">
          {description}
        </Text>
      </Box>
    </Box>
  )
}

const Segments = <T extends string>({
  ui,
  title,
  current,
  choices,
  onPick,
}: {
  ui: Ui
  title: string
  current: T
  choices: [T, string, string][]
  onPick: (value: T) => void
}) => {
  const { Box, Button, Text } = ui
  return (
    <Box flexDirection="row" columnGap={GAP}>
      <Text bold>{title}</Text>
      {choices.map(([value, key, label]) => (
        <Button key={key} plain onPress={() => onPick(value)}>
          <Text bold={current === value} dimColor={current !== value}>
            {label}
          </Text>
        </Button>
      ))}
    </Box>
  )
}

const SettingsTab = (args: PaneArgs) => {
  const { ui, surface, columns, now, tone, settings, on } = args
  const { Box, Button, Text } = ui
  const optional = TOGGLE_ORDER.filter(t => TOGGLES[t].optional)
  const optionalOn = optional.filter(t => settings.shown[t]).length
  const toggleRow = (toggle: Toggle) => {
    const theme = TOGGLES[toggle]
    const { color, tint } = lookOf(toggle, tone)
    return (
      <Switch
        ui={ui}
        id={`toggle-${toggle}`}
        isOn={settings.shown[toggle]}
        title={theme.title}
        description={theme.description}
        glyph={{ text: theme.glyph, color, ...(tint !== undefined && { tint }) }}
        accent={color}
        onPress={() => on.toggleShown(toggle)}
      />
    )
  }
  const samples = sampleActivations(settings, now)
  const layouts: [Layout, string, string][] = [
    ['row', 'layout-row', 'Chip row'],
    ['summary', 'layout-summary', 'Collapsed summary'],
  ]
  const styles: [ChipStyle, string, string][] = [
    ['tinted', 'style-tinted', 'Tinted'],
    ['text', 'style-text', 'Text'],
  ]
  return (
    <Box flexDirection="column" rowGap={1}>
      <Switch
        ui={ui}
        id="toggle-enabled"
        isOn={settings.enabled}
        title="Show chips above the prompt bar"
        description="Blocked and denied actions are always shown while this is on."
        onPress={() => on.toggle('enabled')}
      />
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={GAP}>
          <Text bold>Preview</Text>
          {layouts.map(([value, key, label]) => (
            <Button key={key} plain onPress={() => on.set({ layout: value })}>
              <Text bold={settings.layout === value} dimColor={settings.layout !== value}>
                {label}
              </Text>
            </Button>
          ))}
        </Box>
        {settings.enabled ? (
          <ChipRow
            ui={ui}
            surface={surface}
            columns={columns}
            now={now}
            tone={tone}
            chips={samples}
            settings={{ ...settings, hotkeys: false, maxChips: 20 }}
            selected={null}
            fits={() => false}
            on={{ pick: () => undefined, open: () => undefined }}
          />
        ) : (
          <Text dimColor>Chips are hidden. Activity is still listed in the session tray.</Text>
        )}
      </Box>
      <Box flexDirection="column">
        <Text bold>Shown by default</Text>
        {TOGGLE_ORDER.filter(t => !TOGGLES[t].optional).map(toggleRow)}
      </Box>
      <Box flexDirection="column">
        <Text bold>{`Optional · off by default (${optionalOn} of ${optional.length} on)`}</Text>
        {optional.map(toggleRow)}
      </Box>
      <Segments
        ui={ui}
        title="Chip style"
        current={settings.chipStyle}
        choices={styles}
        onPick={chipStyle => on.set({ chipStyle })}
      />
      <Switch
        ui={ui}
        id="toggle-hotkeys"
        isOn={settings.hotkeys}
        title="Digit hotkeys on chips"
        description="Type 1-9 alone in an empty prompt to open a chip."
        onPress={() => on.toggle('hotkeys')}
      />
      <Switch
        ui={ui}
        id="toggle-toast"
        isOn={settings.toastOnBlock}
        title="Toast when blocked or denied"
        description="Show a short notice when an action is blocked or denied."
        onPress={() => on.toggle('toastOnBlock')}
      />
      <Switch
        ui={ui}
        id="toggle-text-summary"
        isOn={settings.textSummary}
        title="Text summary after each answer"
        description="Where nothing can be drawn (cloud sessions), add a one-line activity summary."
        onPress={() => on.toggle('textSummary')}
      />
      <Box flexDirection="row" columnGap={2}>
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
        <Tabs ui={args.ui} view={args.view} on={args.on} />
      </Box>
      {args.view === 'settings' ? (
        <SettingsTab {...args} />
      ) : args.view === 'detail' ? (
        <Detail {...args} />
      ) : (
        <Activity {...args} />
      )}
    </Box>
  )
}
