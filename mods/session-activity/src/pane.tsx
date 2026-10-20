import type { Color, RenderSurface } from 'claude-code'

import type {
  Activation,
  ChipStyle,
  ChipTheme,
  Filter,
  Layout,
  Overrides,
  PaneView,
  Settings,
  Toggle,
} from '../types'
import { chipId, inPane, paneGroups, sampleActivations, startedAgo } from './model'
import { OFF_TRACK, switchSvg, SWITCH_SIZE } from './icons'
import {
  agoLabel,
  Badge,
  badgeOf,
  ago,
  ChipRow,
  clip,
  DetailCard,
  inkOf,
  isRich,
  kindIcon,
  lookOf,
  type Ui,
} from './render'
import { isUrgent, KIND_ORDER, TOGGLE_ORDER, TOGGLES, TOKENS, type Tone } from './theme'

const GAP = 3

const UNTINTED_ON = '#2F6FED'

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

type Segment = {
  key: string
  boxKey: string
  label: string
  isOn: boolean
  hotkey?: string
  onPress: () => void
}

/** Choices side by side: bold and dim in the terminal, a filled track with a raised pick on rich surfaces. */
const Segmented = ({
  ui,
  tone,
  segments,
}: {
  ui: Ui
  tone: Tone | undefined
  segments: Segment[]
}) => {
  const { Box, Button, Text } = ui
  const segmented = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      columnGap={segmented ? 0 : GAP}
      {...(segmented && { backgroundColor: t!.fill })}
    >
      {segments.map(({ key, boxKey, label, isOn, hotkey, onPress }) => {
        const bg = segmented ? (isOn ? t!.surface : t!.fill) : undefined
        return (
          <Box key={boxKey} paddingX={segmented ? 1 : 0} {...withTint(bg)}>
            <Button key={key} plain {...(hotkey !== undefined && { hotkey })} onPress={onPress}>
              <Text
                bold={isOn}
                {...(segmented ? inkOf(ui, tone, isOn ? 'ink' : 'text2', bg) : { dimColor: !isOn })}
              >
                {label}
              </Text>
            </Button>
          </Box>
        )
      })}
    </Box>
  )
}

const Filters = ({ ui, tone, activations, settings, filter, on }: PaneArgs) => {
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
  const segments = choices.map(([id, hotkey, title, n]) => ({
    key: `filter-${id}`,
    boxKey: `filterbox-${id}`,
    label: `${title} ${n}`,
    isOn: filter === id,
    hotkey,
    onPress: () => on.filter(id),
  }))
  return <Segmented ui={ui} tone={tone} segments={segments} />
}

/** The row's type mark: a rounded tile holding the icon on rich surfaces, a tinted glyph in the terminal. */
const RowIcon = ({ args, a, muted }: { args: PaneArgs; a: Activation; muted: boolean }) => {
  const { ui, tone } = args
  const { Box, Text } = ui
  const look = lookOf(a.kind, tone)
  if (isRich(ui)) {
    return (
      <Box
        paddingX={1}
        {...withTint(look.tint)}
        {...(tone !== undefined && { borderStyle: 'round', borderColor: look.border })}
      >
        {kindIcon(ui, a.kind, look)}
      </Box>
    )
  }
  return (
    <Text color={look.color} dimColor={look.dim || muted} {...withTint(look.tint)}>
      {` ${TOGGLES[a.kind].glyph} `}
    </Text>
  )
}

const MutedBadge = ({ ui, tone }: { ui: Ui; tone: Tone | undefined }) => {
  const { Text } = ui
  if (tone === undefined) {
    return (
      <Text bold inverse dimColor>
        {' Muted '}
      </Text>
    )
  }
  const { text2, lineSoft } = TOKENS[tone]
  return (
    <Text color={text2} backgroundColor={lineSoft}>
      {' Muted '}
    </Text>
  )
}

const Row = ({ args, a }: { args: PaneArgs; a: Activation }) => {
  const { ui, columns, now, tone, muted, selected, on } = args
  const { Box, Button, Text } = ui
  const id = chipId(a)
  const isSelected = selected === id
  const isMuted = muted.includes(id)
  const look = lookOf(a.kind, tone)
  const badgeText = badgeOf(a.status, tone, isRich(ui))
  const urgent = isUrgent(a.status)
  return (
    <Box
      key={`rowbox-${id}`}
      flexDirection="column"
      {...(isRich(ui) && look.hover !== undefined && { hover: { backgroundColor: look.hover } })}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" columnGap={1}>
          <RowIcon args={args} a={a} muted={isMuted} />
          <Button key={`row-${a.kind}-${a.key}`} plain onPress={() => on.select(id)}>
            <Text>{isSelected ? '▸' : ' '}</Text>
            <Text bold dimColor={isMuted}>{` ${clip(a.label, 28)}`}</Text>
            {a.meta !== undefined && (
              <Text {...inkOf(ui, tone, 'muted')}>
                {` ${clip(a.meta, Math.max(8, columns - 52))}`}
              </Text>
            )}
            {badgeText !== '' && <Badge ui={ui} text={badgeText} tone={tone} status={a.status} />}
            {isMuted && <MutedBadge ui={ui} tone={tone} />}
          </Button>
        </Box>
        <Box flexDirection="row" columnGap={2}>
          <Text {...inkOf(ui, tone, 'text2')}>{`×${a.count} · ${ago(now - a.lastAt)}`}</Text>
          {!urgent && (
            <Button
              key={`mute-${a.kind}-${a.key}`}
              plain
              {...(isSelected && { hotkey: 'm' })}
              label={isMuted ? 'Unmute' : 'Mute'}
              onPress={() => on.mute(id)}
            />
          )}
        </Box>
      </Box>
      <Box flexDirection="column" paddingLeft={6}>
        <Text
          wrap={isSelected ? 'wrap' : 'truncate-end'}
          {...inkOf(ui, tone, isSelected ? 'ink2' : 'text2')}
        >
          {a.detail}
        </Text>
        {urgent && (
          <Text {...inkOf(ui, tone, 'muted')}>Stopped and errored chips always show.</Text>
        )}
        {isSelected && (
          <Box flexDirection="column">
            {a.plugin !== undefined && (
              <Text {...inkOf(ui, tone, 'muted')}>{`from plugin ${a.plugin}`}</Text>
            )}
            {a.source !== undefined && (
              <>
                <Text wrap="truncate-middle" {...inkOf(ui, tone, 'muted')}>
                  {a.source}
                </Text>
                <Button
                  key="copy"
                  plain
                  hotkey="c"
                  label="c: Copy path"
                  onPress={() => on.copy(a.source!)}
                />
              </>
            )}
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
  const link = isRich(ui) && tone !== undefined
  return (
    <Box flexDirection="column">
      <Text bold>Session activity</Text>
      <Box flexDirection="row" columnGap={1}>
        <Text {...inkOf(ui, tone, 'muted')}>
          {`${listed.length} items · ${total} activations · started ${started < 60_000 ? 'just now' : agoLabel(started)}`}
        </Text>
        <Text {...inkOf(ui, tone, 'muted')}>·</Text>
        <Box key="customize-link">
          <Button
            key="customize"
            plain
            {...(link && { hover: { color: TOKENS[tone].linkHover } })}
            onPress={() => on.view('settings')}
          >
            <Text {...(link ? { color: TOGGLES.skill.palette[tone].fg } : { dimColor: true })}>
              Customize
            </Text>
          </Button>
        </Box>
      </Box>
      <Filters {...args} />
      {groups.length === 0 && (
        <Text {...inkOf(ui, tone, 'muted')}>Nothing has activated yet in this session.</Text>
      )}
      {groups.map(group => {
        const { color, dim } = lookOf(group.kind, tone)
        return (
          <Box key={`group-${group.kind}`} flexDirection="column" marginTop={1}>
            <Box flexDirection="row" columnGap={1}>
              <Text color={color} dimColor={dim}>
                {TOGGLES[group.kind].plural.toUpperCase()}
              </Text>
              <Text {...inkOf(ui, tone, 'muted')}>{String(group.rows.length)}</Text>
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

/** The mark beside a setting: a rounded tile holding the icon on rich surfaces, a tinted glyph in the terminal. */
const ToggleMark = ({ ui, tone, toggle }: { ui: Ui; tone: Tone | undefined; toggle: Toggle }) => {
  const { Box, Text } = ui
  const look = lookOf(toggle, tone)
  if (isRich(ui)) {
    return (
      <Box
        paddingX={1}
        {...withTint(look.tint)}
        {...(tone !== undefined && { borderStyle: 'round', borderColor: look.border })}
      >
        {kindIcon(ui, toggle, look)}
      </Box>
    )
  }
  return (
    <Text color={look.color} dimColor={look.dim} {...withTint(look.tint)}>
      {` ${TOGGLES[toggle].glyph} `}
    </Text>
  )
}

const Switch = ({
  ui,
  tone,
  id,
  isOn,
  title,
  description,
  toggle,
  onPress,
}: {
  ui: Ui
  tone: Tone | undefined
  id: string
  isOn: boolean
  title: string
  description: string
  toggle?: Toggle
  onPress: () => void
}) => {
  const { Box, Button, Text } = ui
  const { Svg } = ui
  const [on, off] =
    tone === undefined ? [UNTINTED_ON, OFF_TRACK] : [TOKENS[tone].switchOn, TOKENS[tone].switchOff]
  return (
    <Box key={`row-${id}`} flexDirection="row" justifyContent="space-between" columnGap={2}>
      <Box flexDirection="row" columnGap={1} flexShrink={1}>
        {toggle !== undefined && <ToggleMark ui={ui} tone={tone} toggle={toggle} />}
        <Box flexDirection="column" flexShrink={1}>
          <Text bold dimColor={!isOn && toggle !== undefined}>
            {title}
          </Text>
          <Text wrap="wrap" {...inkOf(ui, tone, 'text2')}>
            {description}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="row" columnGap={1}>
        {Svg && (
          <Svg
            source={switchSvg(isOn, on, off)}
            alt={isOn ? 'On' : 'Off'}
            width={SWITCH_SIZE.width}
            height={SWITCH_SIZE.height}
          />
        )}
        <Button key={id} plain onPress={onPress}>
          <Text {...(Svg ? inkOf(ui, tone, 'muted') : { dimColor: !isOn })}>
            {Svg ? (isOn ? 'On' : 'Off') : isOn ? '●' : '○'}
          </Text>
        </Button>
      </Box>
    </Box>
  )
}

const Segments = <T extends string>({
  ui,
  tone,
  title,
  note,
  current,
  choices,
  onPick,
}: {
  ui: Ui
  tone: Tone | undefined
  title: string
  note?: string
  current: T
  choices: [T, string, string][]
  onPick: (value: T) => void
}) => {
  const { Box, Text } = ui
  const segments = choices.map(([value, key, label]) => ({
    key,
    boxKey: `${key}-box`,
    label,
    isOn: current === value,
    onPress: () => onPick(value),
  }))
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={GAP}>
        <Text bold>{title}</Text>
        <Segmented ui={ui} tone={tone} segments={segments} />
      </Box>
      {note !== undefined && (
        <Text wrap="wrap" {...inkOf(ui, tone, 'text2')}>
          {note}
        </Text>
      )}
    </Box>
  )
}

const INTRO =
  'Choose what shows above the prompt bar when it activates during a session. Optional types stay off until you turn them on.'

const SettingsTab = (args: PaneArgs) => {
  const { ui, surface, columns, now, tone, settings, on } = args
  const { Box, Button, Text } = ui
  const optional = TOGGLE_ORDER.filter(t => TOGGLES[t].optional)
  const optionalOn = optional.filter(t => settings.shown[t]).length
  const toggleRow = (toggle: Toggle) => (
    <Switch
      ui={ui}
      tone={tone}
      id={`toggle-${toggle}`}
      isOn={settings.shown[toggle]}
      title={TOGGLES[toggle].title}
      description={TOGGLES[toggle].description}
      toggle={toggle}
      onPress={() => on.toggleShown(toggle)}
    />
  )
  const samples = sampleActivations(settings, now)
  const layouts: [Layout, string, string][] = [
    ['row', 'layout-row', 'Chip row'],
    ['summary', 'layout-summary', 'Collapsed summary'],
  ]
  const themes: [ChipTheme, string, string][] = [
    ['auto', 'theme-auto', 'Auto'],
    ['light', 'theme-light', 'Light'],
    ['dark', 'theme-dark', 'Dark'],
  ]
  const styles: [ChipStyle, string, string][] = [
    ['tinted', 'style-tinted', 'Tinted'],
    ['text', 'style-text', 'Text'],
  ]
  return (
    <Box flexDirection="column" rowGap={1}>
      <Box flexDirection="column">
        <Text bold>Session activity chips</Text>
        <Text wrap="wrap" {...inkOf(ui, tone, 'text2')}>
          {INTRO}
        </Text>
      </Box>
      <Switch
        ui={ui}
        tone={tone}
        id="toggle-enabled"
        isOn={settings.enabled}
        title="Show chips above the prompt bar"
        description="Blocked and denied actions are always shown while this is on."
        onPress={() => on.toggle('enabled')}
      />
      <Box flexDirection="column">
        <Segments
          ui={ui}
          tone={tone}
          title="Preview"
          current={settings.layout}
          choices={layouts}
          onPick={layout => on.set({ layout })}
        />
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
          <Text {...inkOf(ui, tone, 'muted')}>
            Chips are hidden. Activity is still listed in the session tray.
          </Text>
        )}
      </Box>
      <Box flexDirection="column" rowGap={1}>
        <Text bold>Shown by default</Text>
        {TOGGLE_ORDER.filter(t => !TOGGLES[t].optional).map(toggleRow)}
      </Box>
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" columnGap={GAP}>
          <Text bold>Optional</Text>
          <Text {...inkOf(ui, tone, 'muted')}>
            {`Off by default · ${optionalOn} of ${optional.length} on`}
          </Text>
        </Box>
        {optional.map(toggleRow)}
      </Box>
      <Segments
        ui={ui}
        tone={tone}
        title="Chip theme"
        note="Auto follows the Claude Code theme, then the terminal, then the system."
        current={settings.chipTheme}
        choices={themes}
        onPick={chipTheme => on.set({ chipTheme })}
      />
      <Segments
        ui={ui}
        tone={tone}
        title="Chip style"
        current={settings.chipStyle}
        choices={styles}
        onPick={chipStyle => on.set({ chipStyle })}
      />
      <Switch
        ui={ui}
        tone={tone}
        id="toggle-hotkeys"
        isOn={settings.hotkeys}
        title="Digit hotkeys on chips"
        description="Type 1-9 alone in an empty prompt to open a chip."
        onPress={() => on.toggle('hotkeys')}
      />
      <Switch
        ui={ui}
        tone={tone}
        id="toggle-toast"
        isOn={settings.toastOnBlock}
        title="Toast when blocked or denied"
        description="Show a short notice when an action is blocked or denied."
        onPress={() => on.toggle('toastOnBlock')}
      />
      <Switch
        ui={ui}
        tone={tone}
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
