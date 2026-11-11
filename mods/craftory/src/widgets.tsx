import type { RenderSurface } from 'claude-code'
import type { Tone } from '../types'
import { hexOr, lockSvg, switchSvg, SWITCH_SIZE } from './icons'
import { paint, type Role, SPACE, SWITCH_MARK, TOKENS, TRIPLES } from './theme'
import { Icon, inkOf, isRich, roleInk, withTint, type Ui } from './ui'

export const Eyebrow = ({ ui, tone, text }: { ui: Ui; tone: Tone | undefined; text: string }) => (
  <ui.Text
    mono={isRich(ui)}
    {...(isRich(ui) && { size: 'caption' as const })}
    {...inkOf(tone, 'muted')}
  >
    {isRich(ui) ? text.toUpperCase() : text}
  </ui.Text>
)

type Common = { ui: Ui; tone: Tone | undefined; id: string }

export const SwitchRow = ({
  ui,
  tone,
  id,
  ascii = false,
  title,
  description,
  isOn,
  onChange,
}: Common & {
  ascii?: boolean
  title: string
  description?: string | undefined
  isOn: boolean
  onChange: ((on: boolean) => void) | undefined
}) => {
  const { Box, Button, Text, Svg } = ui
  const t = tone === undefined ? undefined : TOKENS[tone]
  const word = isOn ? 'On' : 'Off'
  const mark = SWITCH_MARK[isOn ? 'on' : 'off']
  const shown = Svg ? word : ascii ? mark.ascii : mark.glyph
  return (
    <Box
      key={`row-${id}`}
      flexDirection="row"
      justifyContent="space-between"
      columnGap={SPACE.switchSide}
    >
      <Box flexDirection="column" rowGap={SPACE.rowTextGap} flexShrink={1} minWidth={0}>
        <Text bold {...inkOf(tone, 'ink')}>
          {title}
        </Text>
        {description !== undefined && (
          <Text wrap="wrap" {...inkOf(tone, 'text2')}>
            {description}
          </Text>
        )}
      </Box>
      <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexShrink={0} alignItems="center">
        {Svg && t && (
          <Svg
            source={switchSvg(isOn, t.switchOn, t.switchOff)}
            alt={word}
            width={SWITCH_SIZE.width}
            height={SWITCH_SIZE.height}
          />
        )}
        {onChange === undefined ? (
          <Text {...inkOf(tone, 'muted')}>{shown}</Text>
        ) : (
          // Desktop drops colour inside a Button, so only the terminal's mark is tinted
          <Button key={`set-${id}`} plain onPress={() => onChange(!isOn)}>
            <Text {...(!Svg && inkOf(tone, 'muted'))}>{shown}</Text>
          </Button>
        )}
      </Box>
    </Box>
  )
}

export type Choice = readonly [value: string, label: string]

export const Segments = ({
  ui,
  tone,
  id,
  prefix = 'set',
  choices,
  current,
  onPick,
}: Common & {
  prefix?: string
  choices: readonly Choice[]
  current: string
  onPick: ((value: string) => void) | undefined
}) => {
  const { Box, Button, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  if (onPick === undefined) {
    return (
      <Text {...inkOf(tone, 'ink2')}>{choices.find(([v]) => v === current)?.[1] ?? current}</Text>
    )
  }
  return (
    <Box
      key={`segments-${id}`}
      flexDirection="row"
      flexWrap="wrap"
      columnGap={rich ? 0 : SPACE.tabGap}
      {...(rich && t && { backgroundColor: t.fill2 })}
    >
      {choices.map(([value, label]) => {
        const isOn = value === current
        return (
          <Box
            key={`${prefix}-${id}-${value}-box`}
            paddingX={SPACE.tabPad}
            paddingY={0}
            marginY={0}
            {...(rich &&
              t &&
              isOn && {
                backgroundColor: t.surface,
                borderStyle: 'round' as const,
                borderColor: t.line,
              })}
          >
            <Button key={`${prefix}-${id}-${value}`} plain onPress={() => onPick(value)}>
              <Text
                bold={isOn}
                underline={isOn && !rich}
                {...(!rich && (isOn ? inkOf(tone, 'ink') : inkOf(tone, 'text2')))}
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

export const Field = ({
  ui,
  tone,
  id,
  label,
  hint,
  value,
  placeholder,
  rows,
  onInput,
  onSubmit,
}: Common & {
  label: string
  hint?: string | undefined
  value: string
  placeholder?: string
  rows?: number
  onInput?: (text: string) => void
  onSubmit: ((text: string) => void) | undefined
}) => {
  const { Box, Text, Input } = ui
  return (
    <Box key={`field-${id}`} flexDirection="column" rowGap={SPACE.rowTextGap}>
      <Text bold {...inkOf(tone, 'ink')}>
        {label}
      </Text>
      {Input !== undefined && onSubmit !== undefined ? (
        <Input
          key={`set-${id}`}
          value={value}
          {...(placeholder !== undefined && { placeholder })}
          {...(rows !== undefined && { rows })}
          {...(onInput !== undefined && { onInput: (text: string) => onInput(text) })}
          submitLabel="save"
          onSubmit={text => onSubmit(text)}
        />
      ) : (
        <Text wrap="wrap" mono={isRich(ui)} {...inkOf(tone, 'ink2')}>
          {value === '' ? '—' : value}
        </Text>
      )}
      {hint !== undefined && (
        <Text wrap="wrap" {...inkOf(tone, 'muted')}>
          {hint}
        </Text>
      )}
    </Box>
  )
}

/**
 * A status word: bordered and tinted where the surface is rich, `[word]` where it is not. With
 * `outline` it is a caption word in the role's colour, ringed in it, with no fill (a ticket's type).
 */
export const Badge = ({
  ui,
  tone,
  role,
  text,
  id,
  boxKey = `badge-${id}`,
  outline = false,
}: Common & {
  role: Role
  text: string
  boxKey?: string
  outline?: boolean
}) => {
  const { Box, Text } = ui
  const colours = paint(role, tone)
  if (!isRich(ui) || tone === undefined) {
    return (
      <Text bold {...roleInk(role, tone)}>
        {`[${text}]`}
      </Text>
    )
  }
  const border = outline ? colours.fg : colours.bd
  return (
    <Box
      key={boxKey}
      paddingX={SPACE.chipPadX}
      borderStyle="round"
      {...(border !== undefined && { borderColor: border })}
      {...(!outline && { backgroundColor: colours.bg ?? TOKENS[tone].fill })}
    >
      <Text bold {...(outline && { size: 'caption' as const })} color={colours.fg}>
        {text}
      </Text>
    </Box>
  )
}

/** The frame a card button draws on rich surfaces: the inverse ink when `primary`, else outlined. */
export const buttonFrame = (tone: Tone, primary = false) => {
  const t = TOKENS[tone]
  return {
    paddingX: SPACE.buttonPadX,
    borderStyle: 'round' as const,
    borderColor: primary ? t.inverseBg : t.line,
    backgroundColor: primary ? t.inverseBg : t.surface,
  }
}

/**
 * Desktop's own button on rich surfaces, `[ label ]` elsewhere; `primary` is the surface's primary
 * button. Desktop draws its own colours for both themes and drops any colour set inside a Button,
 * so a fill of ours would sit under Desktop's light label in dark mode. `compact` sets the label at
 * the smallest type step, for a notice row.
 */
export const CardButton = ({
  ui,
  tone,
  id,
  label,
  primary = false,
  compact = false,
  onPress,
}: Common & {
  label: string
  primary?: boolean
  compact?: boolean
  onPress: (surface: RenderSurface) => void
}) => {
  const { Button, Text } = ui
  if (!isRich(ui) || tone === undefined) {
    return (
      <Button key={id} plain onPress={press => onPress(press.surface)}>
        <Text bold={primary} {...inkOf(tone, 'ink')}>{`[ ${label} ]`}</Text>
      </Button>
    )
  }
  return (
    <Button
      key={id}
      label={label}
      variant={primary ? 'primary' : 'secondary'}
      onPress={press => onPress(press.surface)}
    >
      {compact ? <Text size="caption">{label}</Text> : label}
    </Button>
  )
}

/** An amber note: a lock on rich surfaces when `lock` is set, `!` elsewhere. */
export const HookNote = ({
  ui,
  tone,
  id,
  text,
  lock = false,
}: Common & {
  text: string
  lock?: boolean
}) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  return (
    <Box
      key={id}
      flexDirection="row"
      columnGap={SPACE.gateGap}
      paddingX={SPACE.gatePadX}
      {...(tone !== undefined && {
        borderStyle: 'round' as const,
        borderColor: TRIPLES.hook[tone].bd,
        backgroundColor: TRIPLES.hook[tone].bg,
      })}
    >
      {rich && lock ? (
        <Icon ui={ui} svg={lockSvg(hexOr(TRIPLES.hook[tone].fg))} alt="Gate" />
      ) : (
        <Text {...roleInk('hook', tone)}>{'!'}</Text>
      )}
      <Text
        wrap="wrap"
        {...roleInk('hook', tone)}
        {...withTint(rich ? TRIPLES.hook[tone].bg : undefined)}
      >
        {text}
      </Text>
    </Box>
  )
}
