import type { Color, ElementTable, RenderElement, Space } from 'claude-code'
import type { Tone } from '../types'
import { CLEAR, ELLIPSIS, HOVER_MIX, mix, paint, type Role, SPACE, TOKENS } from './theme'

/** `Svg` exists on every surface that draws rich (remote) elements, never on the terminal. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button' | 'Link'> & {
  Svg?: ElementTable<'desktop'>['Svg']
  /** Every surface but mobile has a text field. */
  Input?: ElementTable<'desktop'>['Input']
}

export const isRich = (ui: Ui) => ui.Svg !== undefined

export const clip = (text: string, max: number, ascii = false) => {
  if (text.length <= max) return text
  const end = ascii ? ELLIPSIS.ascii : ELLIPSIS.glyph
  return `${text.slice(0, Math.max(1, max - end.length))}${end}`
}
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
 * How a chip draws on a rich surface: its border at rest (none when left out, `dashed` for the
 * Triage), an optional fill, what pressing changes, an optional hover tint, and its padding and gap
 * when they differ from a phase step's. Leave `fill` out for no fill at rest.
 */
export type ChipLook = {
  border?: Color
  fill?: Color
  dashed?: boolean
  pressedBorder?: Color
  pressedFill?: Color
  hover?: Color
  padX?: Space
  gap?: Space
}

/** A role-tinted chip, such as the map chip: the role's fill and border, `pressedBorder` when open. */
export const roleLook = (
  role: Role,
  tone: Tone | undefined,
  pressedBorder: (colours: { fg: Color }) => Color,
): ChipLook | undefined => {
  if (tone === undefined) return undefined
  const colours = paint(role, tone)
  const rest = colours.bg ?? TOKENS[tone].surface
  return {
    border: colours.bd ?? rest,
    fill: rest,
    pressedBorder: pressedBorder(colours),
    hover: mix(rest, colours.fg, HOVER_MIX),
  }
}

/** A phase step: clear at rest, fill and a strong border when open, a hover toward `accent`. */
export const stepLook = (tone: Tone | undefined, accent: Color): ChipLook | undefined => {
  if (tone === undefined) return undefined
  const t = TOKENS[tone]
  return {
    border: CLEAR,
    pressedBorder: t.lineStrong,
    pressedFill: t.fill,
    hover: mix(t.fill, accent, HOVER_MIX),
  }
}

/** The feature title: a fill-tinted pill, a strong border while its switcher is open. */
export const pillLook = (tone: Tone | undefined): ChipLook | undefined => {
  if (tone === undefined) return undefined
  const t = TOKENS[tone]
  return {
    border: t.fill,
    fill: t.fill,
    pressedBorder: t.lineStrong,
    hover: mix(t.fill, t.ink, HOVER_MIX),
  }
}

/** A bare one-glyph button, such as the gear: no border, a fill tint on hover. */
export const bareLook = (tone: Tone | undefined): ChipLook | undefined =>
  tone === undefined ? undefined : { border: CLEAR, hover: TOKENS[tone].fill }

type ChipChild = RenderElement | false | null | undefined

/**
 * The chip pattern: one way to draw a tinted chip, pressable or not.
 *
 * Desktop drops every colour inside a Button, so on a rich surface a keyed Box (`boxKey`, else
 * `box-${id}`) carries the `look`, the `icon` Svg and the caller's coloured `children`; a plain
 * Button `id` inside carries only the press and an uncoloured `label`. Without `onPress` the label
 * is a Text `id` in its `ink` instead. On the terminal the Box is borderless: the `glyph` in the
 * role's colour, the label in its `ink` (underlined, or bold with `pressedStyle: 'bold'`, when
 * `pressed`), then `children`. With `inside` the terminal draws glyph and children inside the Button
 * too, so the whole step is one press. Children are siblings after the label, so the caller paints
 * and spaces them (a leading space on the terminal).
 */
export const Chip = ({
  ui,
  tone,
  id,
  boxKey = `box-${id}`,
  role = 'neutral',
  look,
  layout,
  ink,
  icon,
  iconPx,
  iconAlt = '',
  glyph,
  glyphBold = false,
  label,
  bold = false,
  strike = false,
  pressed = false,
  pressedStyle = 'underline',
  inside = false,
  hotkey,
  onPress,
  children,
}: {
  ui: Ui
  tone: Tone | undefined
  id: string
  boxKey?: string
  /** Colours the terminal glyph. */
  role?: Role
  /** The rich look; undefined on a toneless terminal. */
  look: ChipLook | undefined
  /** The terminal Box's padding and gap; rich surfaces take them from `look`. */
  layout?: { padX?: Space; gap?: Space }
  /** The label's colour on the terminal, and on rich surfaces when the chip is not pressable. */
  ink?: { color?: Color; dimColor?: boolean }
  /** Svg source, drawn on rich surfaces in place of `glyph`. */
  icon?: string
  iconPx?: number
  iconAlt?: string
  /** One-cell mark drawn on the terminal before the label. */
  glyph?: string
  glyphBold?: boolean
  label: string
  bold?: boolean
  strike?: boolean
  pressed?: boolean
  pressedStyle?: 'underline' | 'bold'
  inside?: boolean
  hotkey?: string
  onPress?: () => void
  children?: ChipChild | ChipChild[]
}) => {
  const { Box, Button, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const marked = pressed && pressedStyle === 'bold'
  const text = (
    <Text
      key={onPress === undefined ? id : undefined}
      bold={bold || marked}
      {...(strike && { strikethrough: true })}
      {...((!rich || onPress === undefined) && ink)}
      {...(!rich && pressedStyle === 'underline' && { underline: pressed })}
    >
      {label}
    </Text>
  )
  const press = (inner: RenderElement) =>
    onPress === undefined ? (
      inner
    ) : (
      <Button key={id} plain {...(hotkey !== undefined && { hotkey })} onPress={onPress}>
        {inner}
      </Button>
    )
  if (!rich) {
    const mark = glyph !== undefined && (
      <Text {...roleInk(role, tone)} {...(glyphBold && { bold: true })}>{`${glyph} `}</Text>
    )
    const frame = {
      key: boxKey,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      ...(layout?.padX !== undefined && { paddingX: layout.padX }),
      ...(layout?.gap !== undefined && { columnGap: layout.gap }),
    }
    if (inside && onPress !== undefined)
      return (
        <Box {...frame}>
          <Button key={id} plain {...(hotkey !== undefined && { hotkey })} onPress={onPress}>
            {mark}
            {text}
            {children}
          </Button>
        </Box>
      )
    return (
      <Box {...frame}>
        {mark}
        {press(text)}
        {children}
      </Box>
    )
  }
  const drawn = look ?? {}
  const fill = pressed ? (drawn.pressedFill ?? drawn.fill) : drawn.fill
  const borderColor = pressed ? (drawn.pressedBorder ?? drawn.border) : drawn.border
  return (
    <Box
      key={boxKey}
      flexDirection="row"
      alignItems="center"
      columnGap={drawn.gap ?? SPACE.phaseGap}
      paddingX={drawn.padX ?? SPACE.phasePadX}
      {...(borderColor !== undefined && {
        borderStyle: drawn.dashed ? ('dashed' as const) : ('round' as const),
        borderColor,
      })}
      {...withTint(fill)}
      {...(onPress !== undefined &&
        drawn.hover !== undefined && { hover: { backgroundColor: drawn.hover } })}
    >
      {icon !== undefined && (
        <Icon ui={ui} svg={icon} alt={iconAlt} {...(iconPx !== undefined && { px: iconPx })} />
      )}
      {press(text)}
      {children}
    </Box>
  )
}
