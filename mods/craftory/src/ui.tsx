import type { Color, ElementTable } from 'claude-code'
import type { Tone } from '../types'
import { paint, type Role, TOKENS } from './theme'

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
