import type { Color, ElementTable, RenderElement, Space } from 'claude-code'
import type { Tone } from '../types'
import { CLEAR, ELLIPSIS, SELECTED, HOVER_MIX, mix, paint, type Role, SPACE, TOKENS } from './theme'

/** `Svg` exists on every surface that draws rich (remote) elements, never on the terminal. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button' | 'Link'> & {
  Svg?: ElementTable<'desktop'>['Svg']
  /** Every surface but mobile has a text field. */
  Input?: ElementTable<'desktop'>['Input']
}

export const isRich = (ui: Ui) => ui.Svg !== undefined

/**
 * Rows of padding above and below a button or tab where the surface draws no tone of its own
 * (VS Code, in whole rows): its native buttons sit flush with the line, so a settings control
 * takes one row either side. Elsewhere none.
 */
export const padRowsOf = (ui: Ui, tone: Tone | undefined) =>
  isRich(ui) && tone === undefined ? 1 : 0

/**
 * VS Code draws a step as character cells, so a vertical `xs` or `sm` is no row at all, where
 * Desktop draws them as a few pixels. A structural gap (a row gap or a margin) of `sm` becomes one
 * row there, so rows of chips and sections no longer touch; `xs` keeps the zero that separates text
 * lines already and the padding is left alone.
 */
const VSCODE_GAPS = ['rowGap', 'marginTop', 'marginBottom'] as const

/**
 * Props of a Box with its vertical gaps sized for VS Code's cells; wrapped rows get a row gap.
 * VS Code wraps a row Box that names no `flexWrap`, where the terminal never does, so a squeezed
 * phase step put its chip on the line under its connector. A Box wraps there only when it asks to.
 */
export const vscodeSpaced = <P extends Record<string, unknown>>(props: P): P => {
  const out: Record<string, unknown> = { ...props }
  if (out.flexWrap === undefined) out.flexWrap = 'nowrap'
  for (const key of VSCODE_GAPS) if (out[key] === 'sm') out[key] = 1
  if (out.flexWrap === 'wrap' && out.flexDirection === 'row' && out.rowGap === undefined)
    out.rowGap = 1
  return out as P
}

/** A Box that applies `vscodeSpaced`; the other elements are VS Code's own. */
export const vscodeBox =
  (Box: Ui['Box']): Ui['Box'] =>
  props =>
    Box(vscodeSpaced(props))

/**
 * VS Code fills a Button with its theme's button colour, which no prop changes, and draws only
 * the plain text inside it. A dim Button is transparent, so an accent Button is a dim one in a
 * terracotta outline (Claude Code's own `claude` colour, as its checkboxes); a dim Button stays
 * plain. The outer Box takes any stretch from its row or column, so the outline hugs the button
 * at the top, where VS Code aligns a button of its own.
 */
export const vscodeButton =
  (Button: Ui['Button'], Box: Ui['Box']): Ui['Button'] =>
  props =>
    props.dimColor === true
      ? Button(props)
      : Box({
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'flex-start',
          flexShrink: 0,
          children: Box({
            flexDirection: 'row',
            flexWrap: 'nowrap',
            borderStyle: 'round',
            borderColor: 'claude',
            children: Button({ ...props, dimColor: true }),
          }),
        })

export const clip = (text: string, max: number, ascii = false) => {
  if (text.length <= max) return text
  const end = ascii ? ELLIPSIS.ascii : ELLIPSIS.glyph
  return `${text.slice(0, Math.max(1, max - end.length))}${end}`
}
const ICON_PX = 14

/** A text style without its `dimColor`, for text inside a Button that is dimmed as a whole. */
const withoutDim = <T extends object>(style: T) =>
  Object.fromEntries(Object.entries(style).filter(([key]) => key !== 'dimColor'))

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
  /** The right padding at rest, where it differs from `padX`; a pressed chip's border keeps `padX`. */
  padRight?: Space
  gap?: Space
}

/**
 * Desktop's native button already pads its label, so a rail chip adds only a sliver around it and
 * no gap of its own: the board's `padding: 0 8px; gap: 6px`. Every chip of the rail shares it.
 */
const TIGHT = { padX: 'xs', gap: 0 } as const satisfies Pick<ChipLook, 'padX' | 'gap'>

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
    ...TIGHT,
  }
}

/**
 * A phase step: no border at rest (Desktop paints a `transparent` border black, so a clear one draws
 * none), fill and a strong border when open, a hover toward `accent`.
 */
export const stepLook = (tone: Tone | undefined, accent: Color): ChipLook | undefined => {
  if (tone === undefined) return undefined
  const t = TOKENS[tone]
  return {
    border: CLEAR,
    pressedBorder: t.lineStrong,
    pressedFill: t.fill,
    hover: mix(t.fill, accent, HOVER_MIX),
    ...TIGHT,
    // The native button's own padding ends the step, so the space before a connector is no more
    // than the space after it.
    padRight: 0,
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
    ...TIGHT,
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
  iconAlt,
  glyph,
  glyphBold = false,
  label,
  size,
  bold = false,
  strike = false,
  pressed = false,
  pressedStyle = 'underline',
  inside = false,
  dim = false,
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
  layout?: { padX?: Space; gap?: Space; padY?: Space }
  /** The label's colour on the terminal, and on rich surfaces when the chip is not pressable. */
  ink?: { color?: Color; dimColor?: boolean }
  /** Svg source, drawn on rich surfaces in place of `glyph`. Desktop hides an Svg with an empty alt. */
  icon?: string
  iconPx?: number
  iconAlt?: string
  /** One-cell mark drawn on the terminal before the label. */
  glyph?: string
  glyphBold?: boolean
  label: string
  /** The label's text size on rich surfaces; the terminal has one size. */
  size?: 'caption' | 'footnote' | 'body'
  bold?: boolean
  strike?: boolean
  pressed?: boolean
  pressedStyle?: 'underline' | 'bold'
  inside?: boolean
  /** The Button's label dim at rest, full strength under the pointer: Desktop keeps it, unlike colour. */
  dim?: boolean
  hotkey?: string
  onPress?: () => void
  children?: ChipChild | ChipChild[]
}) => {
  const { Box, Button, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const marked = pressed && pressedStyle === 'bold'
  // With no tone on a rich surface (VS Code) the dim goes on the Button, so its glyph and label
  // fade together.
  const untinted = isRich(ui) && tone === undefined
  const dimmed = dim || (untinted && onPress !== undefined && ink?.dimColor === true)
  const inkWithoutDim = Object.fromEntries(
    Object.entries(ink ?? {}).filter(([k]) => k !== 'dimColor'),
  )
  const inkOn = untinted && onPress !== undefined ? inkWithoutDim : ink
  // A selected tab has no bold or underline to show on a native button, so it takes a marker.
  const shown = untinted && marked ? `${SELECTED.glyph} ${label}` : label
  const text = (
    <Text
      key={onPress === undefined ? id : undefined}
      bold={bold || marked}
      {...(rich && size !== undefined && { size })}
      {...(strike && { strikethrough: true })}
      {...((!rich || onPress === undefined) && inkOn)}
      {...(!rich && pressedStyle === 'underline' && { underline: pressed })}
    >
      {shown}
    </Text>
  )
  const press = (inner: RenderElement) =>
    onPress === undefined ? (
      inner
    ) : (
      <Button
        key={id}
        plain
        {...(hotkey !== undefined && { hotkey })}
        {...(dimmed && { dimColor: true })}
        onPress={onPress}
      >
        {inner}
      </Button>
    )
  if (!rich) {
    const mark = glyph !== undefined && (
      <Text
        {...(untinted && onPress !== undefined
          ? withoutDim(roleInk(role, tone))
          : roleInk(role, tone))}
        {...(glyphBold && { bold: true })}
      >{`${glyph} `}</Text>
    )
    const padX = layout?.padX ?? (isRich(ui) ? 'xs' : undefined)
    const gap = layout?.gap ?? (isRich(ui) ? 'xs' : undefined)
    const frame = {
      key: boxKey,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      // An untinted rich surface (VS Code) draws a native button with next to no padding of its
      // own, so a chip there keeps a cell either side and between its parts.
      ...(padX !== undefined && { paddingX: padX }),
      ...(layout?.padY !== undefined && { paddingY: layout.padY }),
      ...(gap !== undefined && { columnGap: gap }),
    }
    if (inside && onPress !== undefined)
      return (
        <Box {...frame}>
          <Button
            key={id}
            plain
            {...(hotkey !== undefined && { hotkey })}
            {...(dimmed && { dimColor: true })}
            onPress={onPress}
          >
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
      {...(drawn.padRight !== undefined && !pressed && { paddingRight: drawn.padRight })}
      {...(borderColor !== undefined &&
        borderColor !== CLEAR && {
          borderStyle: drawn.dashed ? ('dashed' as const) : ('round' as const),
          borderColor,
        })}
      {...withTint(fill)}
      {...(onPress !== undefined &&
        drawn.hover !== undefined && { hover: { backgroundColor: drawn.hover } })}
    >
      {icon !== undefined && (
        <Icon
          ui={ui}
          svg={icon}
          alt={iconAlt ?? label}
          {...(iconPx !== undefined && { px: iconPx })}
        />
      )}
      {press(text)}
      {children}
    </Box>
  )
}
