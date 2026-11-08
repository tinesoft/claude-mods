import type { Color, ElementTable, RenderElement } from 'claude-code'
import type { Tone } from '../types'
import { HOVER_MIX, mix, paint, type Role, SPACE, TOKENS } from './theme'

/** `Svg` exists on every surface that draws rich (remote) elements, never on the terminal. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button' | 'Link'> & {
  Svg?: ElementTable<'desktop'>['Svg']
  /** Every surface but mobile has a text field. */
  Input?: ElementTable<'desktop'>['Input']
}

export const isRich = (ui: Ui) => ui.Svg !== undefined

export const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`
const ICON_PX = 14

export const roleInk = (role: Role, tone: Tone | undefined) => {
  if (tone === undefined) {
    if (role === 'muted') return { dimColor: true }
    return role === 'neutral' ? {} : { color: paint(role, tone).fg }
  }
  return { color: paint(role, tone).fg }
}

export const inkOf = (tone: Tone | undefined, key: 'ink' | 'ink2' | 'text2' | 'muted') =>
  tone === undefined
    ? key === 'ink' || key === 'ink2'
      ? {}
      : { dimColor: true }
    : { color: TOKENS[tone][key] }

export const withTint = (tint: Color | undefined) =>
  tint === undefined ? {} : { backgroundColor: tint }

export const Icon = ({
  ui,
  svg,
  alt,
  px = ICON_PX,
}: {
  ui: Ui
  svg: string
  alt: string
  px?: number
}) => {
  const { Svg } = ui
  return Svg && <Svg source={svg} alt={alt} width={px} height={px} />
}

/**
 * The chip pattern (analysis decision 1): one way to draw a tinted, pressable chip.
 *
 * Desktop drops every colour inside a Button, so on a rich surface a keyed Box `box-${id}` carries
 * the look: the role's border (its fg when `pressed`) and fill, a hover tint, the `icon` Svg and the
 * caller's coloured `children`; a plain Button `id` inside carries only the press and an uncoloured
 * `label`. On the terminal the same Box is borderless: the `glyph` in the role's colour, the Button
 * label (underlined when `pressed`), then `children`. Children are siblings after the Button on both
 * surfaces, so the caller paints and spaces them (a leading space on the terminal).
 */
export const Chip = ({
  ui,
  tone,
  id,
  role,
  icon,
  glyph,
  label,
  bold = false,
  pressed,
  onPress,
  children,
}: {
  ui: Ui
  tone: Tone | undefined
  id: string
  role: Role
  /** Svg source, drawn on rich surfaces in place of `glyph`. */
  icon?: string
  /** One-cell mark drawn on the terminal before the label. */
  glyph?: string
  label: string
  bold?: boolean
  pressed: boolean
  onPress: () => void
  children?: RenderElement
}) => {
  const { Box, Button, Text } = ui
  const colours = paint(role, tone)
  const rich = isRich(ui) && tone !== undefined
  const button = (
    <Button key={id} plain onPress={onPress}>
      <Text bold={bold} {...(!rich && { underline: pressed })}>
        {label}
      </Text>
    </Button>
  )
  if (!rich) {
    return (
      <Box key={`box-${id}`} flexDirection="row" alignItems="center">
        {glyph !== undefined && <Text color={colours.fg}>{`${glyph} `}</Text>}
        {button}
        {children}
      </Box>
    )
  }
  const rest = colours.bg ?? TOKENS[tone].surface
  return (
    <Box
      key={`box-${id}`}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.phaseGap}
      paddingX={SPACE.phasePadX}
      borderStyle="round"
      borderColor={pressed ? colours.fg : (colours.bd ?? rest)}
      backgroundColor={rest}
      hover={{ backgroundColor: mix(rest, colours.fg, HOVER_MIX) }}
    >
      {icon !== undefined && <Icon ui={ui} svg={icon} alt="" />}
      {button}
      {children}
    </Box>
  )
}
