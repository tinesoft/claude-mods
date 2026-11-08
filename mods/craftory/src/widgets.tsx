import type { RenderSurface } from 'claude-code'
import type { Tone } from '../types'
import { hexOr, lockSvg, switchSvg, SWITCH_SIZE } from './icons'
import { paint, type Role, SPACE, TOKENS, TRIPLES } from './theme'
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
  title,
  description,
  isOn,
  onChange,
}: Common & {
  title: string
  description?: string | undefined
  isOn: boolean
  onChange: ((on: boolean) => void) | undefined
}) => {
  const { Box, Button, Text, Svg } = ui
  const t = tone === undefined ? undefined : TOKENS[tone]
  const word = isOn ? 'On' : 'Off'
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
          <Text {...inkOf(tone, 'muted')}>{Svg ? word : isOn ? '●' : '○'}</Text>
        ) : (
          <Button key={`set-${id}`} plain onPress={() => onChange(!isOn)}>
            <Text {...inkOf(tone, 'muted')}>{Svg ? word : isOn ? '●' : '○'}</Text>
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
                {...(isOn ? inkOf(tone, 'ink') : inkOf(tone, 'text2'))}
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

/** A status word: bordered and tinted where the surface is rich, `[word]` where it is not. */
export const Badge = ({
  ui,
  tone,
  role,
  text,
  id,
}: Common & {
  role: Role
  text: string
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
  return (
    <Box
      key={`badge-${id}`}
      paddingX={SPACE.chipPadX}
      borderStyle="round"
      {...(colours.bd !== undefined && { borderColor: colours.bd })}
      backgroundColor={colours.bg ?? TOKENS[tone].fill}
    >
      <Text bold color={colours.fg}>
        {text}
      </Text>
    </Box>
  )
}

/**
 * A bordered button on rich surfaces, `[ label ]` elsewhere; `primary` fills it with the inverse ink.
 * On rich surfaces the look is the Box's: Desktop drops any colour inside a Button.
 */
export const CardButton = ({
  ui,
  tone,
  id,
  label,
  primary = false,
  onPress,
}: Common & {
  label: string
  primary?: boolean
  onPress: (surface: RenderSurface) => void
}) => {
  const { Box, Button, Text } = ui
  if (!isRich(ui) || tone === undefined) {
    return (
      <Button key={id} plain onPress={press => onPress(press.surface)}>
        <Text bold={primary} {...inkOf(tone, 'ink')}>{`[ ${label} ]`}</Text>
      </Button>
    )
  }
  const t = TOKENS[tone]
  return (
    <Box
      key={`${id}-box`}
      paddingX={SPACE.buttonPadX}
      borderStyle="round"
      borderColor={primary ? t.inverseBg : t.line}
      backgroundColor={primary ? t.inverseBg : t.surface}
    >
      <Button key={id} plain onPress={press => onPress(press.surface)}>
        {label}
      </Button>
    </Box>
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
        <Icon ui={ui} svg={lockSvg(hexOr(TRIPLES.hook[tone].fg))} alt="" />
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
