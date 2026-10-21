import type { Color, RenderSurface, Space } from 'claude-code'

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
import {
  across,
  HOVER_MIX,
  isUrgent,
  KIND_ORDER,
  mix,
  SPACE,
  TOGGLE_ORDER,
  TOGGLES,
  TOKENS,
  type Tone,
} from './theme'

/** Cells, not a step: the why line lines up under the row's name, past the icon and the cursor. */
const WHY_INDENT = 6

/** The row's type mark: the terminal's ` ◉ ` is three cells. */
const ICON_CELLS = 3

const MIN_META = 5

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
    <Box flexDirection="row" columnGap={SPACE.tabGap}>
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
  count?: number
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
      columnGap={segmented ? 0 : SPACE.tabGap}
      {...(segmented && { backgroundColor: t!.fill })}
    >
      {segments.map(({ key, boxKey, label, count, isOn, hotkey, onPress }) => {
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
              {count !== undefined && (
                <Text mono size="caption" {...inkOf(ui, tone, 'muted', bg)}>
                  {` ${count}`}
                </Text>
              )}
            </Button>
          </Box>
        )
      })}
    </Box>
  )
}

/** The types shown by default always have a filter, as the board draws them; optional ones once they have items. */
const filterKinds = (listed: readonly Activation[], settings: Settings) =>
  KIND_ORDER.filter(
    kind => (!TOGGLES[kind].optional && settings.shown[kind]) || listed.some(a => a.kind === kind),
  )

const Filters = ({ ui, tone, activations, settings, filter, on }: PaneArgs) => {
  const listed = activations.filter(a => inPane(a, settings))
  const kinds = filterKinds(listed, settings)
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
    label: title,
    count: n,
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
        paddingX={SPACE.tilePadX}
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
  const badgeText = badgeOf(a.status, tone, isRich(ui))
  const urgent = isUrgent(a.status)
  const tally = `×${a.count} · ${ago(now - a.lastAt)}`
  const right =
    tally.length + (urgent ? 0 : across(SPACE.rowSide) + (isMuted ? 'Unmute' : 'Mute').length)
  const left =
    ICON_CELLS +
    across(SPACE.rowGrid) +
    2 +
    Math.min(a.label.length, 28) +
    1 +
    (badgeText === '' ? 0 : badgeText.length + 2) +
    (isMuted ? ' Muted '.length : 0)
  const metaRoom = columns - right - across(SPACE.rowSide) - left
  return (
    <Box
      key={`rowbox-${id}`}
      flexDirection="column"
      rowGap={SPACE.rowTextGap}
      {...(isRich(ui) &&
        tone !== undefined && {
          hover: { backgroundColor: mix(TOKENS[tone].surface, TOKENS[tone].ink, HOVER_MIX) },
        })}
    >
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.rowSide}>
        <Box
          flexDirection="row"
          columnGap={SPACE.rowGrid}
          flexShrink={1}
          minWidth={0}
          overflow="hidden"
        >
          <RowIcon args={args} a={a} muted={isMuted} />
          <Button key={`row-${a.kind}-${a.key}`} plain onPress={() => on.select(id)}>
            <Text>{isSelected ? '▸' : ' '}</Text>
            <Text bold dimColor={isMuted}>{` ${clip(a.label, 28)}`}</Text>
            {a.meta !== undefined && metaRoom >= MIN_META && (
              <Text mono size="footnote" {...inkOf(ui, tone, 'muted')}>
                {` ${clip(a.meta, metaRoom)}`}
              </Text>
            )}
            {badgeText !== '' && <Badge ui={ui} text={badgeText} tone={tone} status={a.status} />}
            {isMuted && <MutedBadge ui={ui} tone={tone} />}
          </Button>
        </Box>
        <Box flexDirection="row" columnGap={SPACE.rowSide} flexShrink={0}>
          <Text mono size="footnote" {...inkOf(ui, tone, 'text2')}>
            {tally}
          </Text>
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
      <Box flexDirection="column" rowGap={SPACE.rowTextGap} paddingLeft={WHY_INDENT}>
        <Text
          size="footnote"
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
                  label="Copy path"
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

const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

const Activity = (args: PaneArgs) => {
  const { ui, now, tone, activations, settings, on } = args
  const { Box, Button, Text } = ui
  const listed = activations.filter(a => inPane(a, settings))
  const filter =
    args.filter !== 'all' && filterKinds(listed, settings).includes(args.filter)
      ? args.filter
      : 'all'
  const groups = paneGroups(activations, settings, filter)
  const total = listed.reduce((sum, a) => sum + a.count, 0)
  const started = startedAgo(listed, now)
  const link = isRich(ui) && tone !== undefined
  return (
    <Box flexDirection="column" rowGap={SPACE.paneGap}>
      <Box flexDirection="column" rowGap={SPACE.paneTitleGap}>
        <Text bold>Session activity</Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={SPACE.statsGap}>
          <Text key="stats" {...inkOf(ui, tone, 'muted')}>
            {`${counted(listed.length, 'item')} · ${counted(total, 'activation')} · started ${started < 60_000 ? 'just now' : agoLabel(started)}`}
          </Text>
          <Box key="customize-link" flexDirection="row" columnGap={SPACE.statsGap} flexShrink={0}>
            <Text {...inkOf(ui, tone, 'muted')}>·</Text>
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
      </Box>
      <Filters {...args} filter={filter} />
      {listed.length === 0 && (
        <Text {...inkOf(ui, tone, 'muted')}>Nothing has activated yet in this session.</Text>
      )}
      {groups.map(group => {
        const { color, dim } = lookOf(group.kind, tone)
        return (
          <Box key={`group-${group.kind}`} flexDirection="column" rowGap={SPACE.groupGap}>
            <Box flexDirection="row" columnGap={SPACE.rowGrid}>
              <Text mono size="caption" color={color} dimColor={dim}>
                {TOGGLES[group.kind].title.toUpperCase()}
              </Text>
              <Text mono size="caption" {...inkOf(ui, tone, 'muted')}>
                {String(group.rows.length)}
              </Text>
            </Box>
            <Box flexDirection="column" rowGap={SPACE.listGap}>
              {group.rows.map(a => (
                <Row args={args} a={a} />
              ))}
            </Box>
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
          density="roomy"
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
        paddingX={SPACE.tilePadX}
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
    <Box
      key={`row-${id}`}
      flexDirection="row"
      justifyContent="space-between"
      columnGap={SPACE.switchSide}
    >
      <Box flexDirection="row" columnGap={SPACE.switchGrid} flexShrink={1}>
        {toggle !== undefined && <ToggleMark ui={ui} tone={tone} toggle={toggle} />}
        <Box flexDirection="column" rowGap={SPACE.rowTextGap} flexShrink={1}>
          <Text bold dimColor={!isOn && toggle !== undefined}>
            {title}
          </Text>
          <Text wrap="wrap" {...inkOf(ui, tone, 'text2')}>
            {description}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="row" columnGap={SPACE.chipInner}>
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

/** A settings section header: the board's quiet upper-case mono eyebrow. */
const Eyebrow = ({ ui, tone, text }: { ui: Ui; tone: Tone | undefined; text: string }) => (
  <ui.Text mono size="caption" {...inkOf(ui, tone, 'muted')}>
    {text.toUpperCase()}
  </ui.Text>
)

const Segments = <T extends string>({
  ui,
  tone,
  title,
  isSection = false,
  note,
  current,
  choices,
  onPick,
}: {
  ui: Ui
  tone: Tone | undefined
  title: string
  isSection?: boolean
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
    <Box flexDirection="column" rowGap={SPACE.rowTextGap}>
      <Box flexDirection="row" columnGap={SPACE.segmentsHeadGap}>
        {isSection ? <Eyebrow ui={ui} tone={tone} text={title} /> : <Text bold>{title}</Text>}
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

/** The board's bordered surface card on rich surfaces; the terminal keeps the bare layout. */
const card = (ui: Ui, tone: Tone | undefined, padding: Record<string, Space>) =>
  isRich(ui) && tone !== undefined
    ? {
        borderStyle: 'round',
        borderColor: TOKENS[tone].line,
        backgroundColor: TOKENS[tone].surface,
        ...padding,
      }
    : {}

const SWITCH_CARD = {
  paddingLeft: SPACE.switchCardPadLeft,
  paddingRight: SPACE.switchCardPadRight,
  paddingY: SPACE.switchCardPadY,
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
    <Box flexDirection="column" rowGap={SPACE.settingsGap}>
      <Box flexDirection="column" rowGap={SPACE.introGap}>
        <Text bold>Session activity chips</Text>
        <Text wrap="wrap" {...inkOf(ui, tone, 'text2')}>
          {INTRO}
        </Text>
      </Box>
      <Box key="card-master" flexDirection="column" {...card(ui, tone, SWITCH_CARD)}>
        <Switch
          ui={ui}
          tone={tone}
          id="toggle-enabled"
          isOn={settings.enabled}
          title="Show chips above the prompt bar"
          description="Blocked and denied actions are always shown while this is on."
          onPress={() => on.toggle('enabled')}
        />
      </Box>
      <Box flexDirection="column" rowGap={SPACE.previewGap}>
        <Segments
          ui={ui}
          tone={tone}
          title="Preview"
          isSection
          current={settings.layout}
          choices={layouts}
          onPick={layout => on.set({ layout })}
        />
        <Box
          key="card-preview"
          flexDirection="column"
          rowGap={SPACE.previewInnerGap}
          {...card(ui, tone, { padding: SPACE.previewPad })}
        >
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
          <Box
            key="prompt-standin"
            {...(isRich(ui) &&
              tone !== undefined && {
                borderStyle: 'round',
                borderColor: TOKENS[tone].line,
                paddingX: SPACE.promptPadX,
              })}
          >
            <Text {...inkOf(ui, tone, 'muted')}>Reply to Claude…</Text>
          </Box>
        </Box>
      </Box>
      <Box flexDirection="column" rowGap={SPACE.sectionGap}>
        <Eyebrow ui={ui} tone={tone} text="Shown by default" />
        <Box
          key="card-shown"
          flexDirection="column"
          rowGap={SPACE.listGap}
          {...card(ui, tone, SWITCH_CARD)}
        >
          {TOGGLE_ORDER.filter(t => !TOGGLES[t].optional).map(toggleRow)}
        </Box>
      </Box>
      <Box flexDirection="column" rowGap={SPACE.sectionGap}>
        <Box flexDirection="row" columnGap={SPACE.optionalHeadGap}>
          <Eyebrow ui={ui} tone={tone} text="Optional" />
          <Text {...inkOf(ui, tone, 'text2')}>
            {`Off by default · ${optionalOn} of ${optional.length} on`}
          </Text>
        </Box>
        <Box
          key="card-optional"
          flexDirection="column"
          rowGap={SPACE.listGap}
          {...card(ui, tone, SWITCH_CARD)}
        >
          {optional.map(toggleRow)}
        </Box>
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
      <Box flexDirection="column" rowGap={SPACE.listGap}>
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
      </Box>
      <Box flexDirection="row" columnGap={SPACE.footerGap}>
        <Button key="reset" label="Reset to defaults" onPress={() => on.reset()} />
        <Button key="all-on" label="Turn everything on" onPress={() => on.allOn()} />
      </Box>
    </Box>
  )
}

export const renderPane = (args: PaneArgs) => {
  const { Box } = args.ui
  const inner = args.columns - across(SPACE.paneLeft) - across(SPACE.paneRight)
  return (
    <Box
      flexDirection="column"
      paddingLeft={SPACE.paneLeft}
      paddingRight={SPACE.paneRight}
      rowGap={SPACE.tabsBelow}
    >
      <Tabs ui={args.ui} view={args.view} on={args.on} />
      {args.view === 'settings' ? (
        <SettingsTab {...args} columns={inner} />
      ) : args.view === 'detail' ? (
        <Detail {...args} columns={inner} />
      ) : (
        <Activity {...args} columns={inner} />
      )}
    </Box>
  )
}
