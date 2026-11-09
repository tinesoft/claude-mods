import type { Color, RenderSurface, Space } from 'claude-code'
import type { ThemeChoice, Tone } from '../types'
import type { RowStatus } from './build'
import type { PhaseState } from './evidence'

export type { Tone }

export type Tokens = {
  page: string
  surface: string
  surface2: string
  tile: string
  fill: string
  fill2: string
  line: string
  lineSoft: string
  lineStrong: string
  lineDashed: string
  ink: string
  ink2: string
  text2: string
  muted: string
  inverseBg: string
  onInk: string
  switchOn: string
  switchOff: string
  countBg: { base: string; alpha: number }
  linkHover: string
  danger: string
  dangerBd: string
}

export const TOKENS: Record<Tone, Tokens> = {
  light: {
    page: '#F5F6F8',
    surface: '#FFFFFF',
    surface2: '#F9FAFB',
    tile: '#F5F6F8',
    fill: '#F0F1F4',
    fill2: '#E8EAEE',
    line: '#DADCE1',
    lineSoft: '#ECEDF0',
    lineStrong: '#CFD2D8',
    lineDashed: '#B9BCC4',
    ink: '#17181C',
    ink2: '#2A2D35',
    text2: '#3B3F48',
    muted: '#5A5E68',
    inverseBg: '#17181C',
    onInk: '#FFFFFF',
    switchOn: '#17181C',
    switchOff: '#B9BCC4',
    countBg: { base: '#17181C', alpha: 0.07 },
    linkHover: '#163A8F',
    danger: '#B42318',
    dangerBd: '#E8A39C',
  },
  dark: {
    page: '#111214',
    surface: '#1B1D21',
    surface2: '#1F2125',
    tile: '#26282D',
    fill: '#2A2C31',
    fill2: '#2E3036',
    line: '#34373E',
    lineSoft: '#2A2C31',
    lineStrong: '#4A4E57',
    lineDashed: '#5A5F69',
    ink: '#ECEDEF',
    ink2: '#D5D8DE',
    text2: '#B4B8C1',
    muted: '#9499A3',
    inverseBg: '#ECEDEF',
    onInk: '#17181C',
    switchOn: '#5B7FE0',
    switchOff: '#4A4E57',
    countBg: { base: '#FFFFFF', alpha: 0.1 },
    linkHover: '#B7CBFF',
    danger: '#F97066',
    dangerBd: '#7A2E28',
  },
}

export type Triple = { fg: string; bg: string; bd: string }

/** `agent` is session-activity's agent palette (its terminal key `merged`), so both mods agree. */
export const TRIPLES: Record<'skill' | 'perm' | 'hook' | 'agent', Record<Tone, Triple>> = {
  skill: {
    light: { fg: '#1F4FC1', bg: '#EDF2FD', bd: '#C9D7F7' },
    dark: { fg: '#8FB0FF', bg: '#1B2A4A', bd: '#2D4373' },
  },
  perm: {
    light: { fg: '#0E6159', bg: '#E8F5F2', bd: '#BCE0D8' },
    dark: { fg: '#7FD6C8', bg: '#123A35', bd: '#22594F' },
  },
  hook: {
    light: { fg: '#9A4A0B', bg: '#FDF1E6', bd: '#F0CFAE' },
    dark: { fg: '#F5B47A', bg: '#3D2614', bd: '#643F20' },
  },
  agent: {
    light: { fg: '#5B3A99', bg: '#F3EEFB', bd: '#D9CCF0' },
    dark: { fg: '#C3A8F5', bg: '#2C2147', bd: '#463470' },
  },
}

export type Role = 'skill' | 'perm' | 'hook' | 'agent' | 'danger' | 'neutral' | 'muted'

const TERMINAL_KEY: Record<Role, Color> = {
  skill: 'suggestion',
  perm: 'planMode',
  hook: 'warning',
  agent: 'merged',
  danger: 'error',
  neutral: 'text',
  muted: 'subtle',
}

export type Paint = { fg: Color; bg: Color | undefined; bd: Color | undefined }

export function paint(role: Role, tone: Tone | undefined): Paint {
  if (tone === undefined) return { fg: TERMINAL_KEY[role], bg: undefined, bd: undefined }
  const t = TOKENS[tone]
  switch (role) {
    case 'skill':
    case 'perm':
    case 'hook':
    case 'agent':
      return { fg: TRIPLES[role][tone].fg, bg: TRIPLES[role][tone].bg, bd: TRIPLES[role][tone].bd }
    case 'danger':
      return { fg: t.danger, bg: t.surface, bd: t.dangerBd }
    case 'neutral':
      return { fg: t.text2, bg: undefined, bd: t.lineDashed }
    case 'muted':
      return { fg: t.muted, bg: undefined, bd: t.line }
    default: {
      const _exhaustive: never = role
      return _exhaustive
    }
  }
}

export type StateLook = {
  label: string
  glyph: string
  /** One cell wide in every terminal: `▸ ⊘ ▲ ◐ –` are ambiguous-width in some, so `ascii` backs them. */
  ascii: string
  role: Role
  bold: boolean
  strike?: true
}

export const PHASE_LOOKS: Record<PhaseState['kind'], StateLook> = {
  done: { label: 'Done', glyph: '✓', ascii: 'v', role: 'perm', bold: false },
  next: { label: 'Up next', glyph: '▸', ascii: '>', role: 'skill', bold: true },
  running: { label: 'Running', glyph: '◐', ascii: '|', role: 'skill', bold: true },
  'needs-you': { label: 'Needs you', glyph: '?', ascii: '?', role: 'hook', bold: false },
  gated: { label: 'Gated', glyph: '⊘', ascii: 'x', role: 'neutral', bold: false },
  failed: { label: 'Failed', glyph: '▲', ascii: '!', role: 'danger', bold: true },
  'over-budget': { label: 'Over budget', glyph: '▲', ascii: '!', role: 'danger', bold: true },
  skipped: { label: 'Skipped', glyph: '–', ascii: '-', role: 'muted', bold: false, strike: true },
  todo: { label: 'Not started', glyph: '·', ascii: '.', role: 'muted', bold: false },
}

export const ROW_ROLES: Record<RowStatus, Role> = {
  merged: 'perm',
  'awaiting-merge': 'skill',
  running: 'skill',
  queued: 'muted',
  'needs-you': 'hook',
  near: 'hook',
  over: 'danger',
  failed: 'danger',
  stopped: 'muted',
}

export const SPINNER = ['◐', '◓', '◑', '◒'] as const
export const SPINNER_ASCII = ['|', '/', '-', '\\'] as const
export const SPIN_MS = 150

export const CONNECTOR = { glyph: '─', ascii: '-' } as const

/**
 * The line joining a phase to the next, across the rail or down the Flow timeline: teal once the
 * earlier phase is Done, else the quiet line. `undefined` on a toneless terminal, which dims it.
 */
export const connectorColor = (isDone: boolean, tone: Tone | undefined): Color | undefined =>
  isDone
    ? tone === undefined
      ? TERMINAL_KEY.perm
      : TRIPLES.perm[tone].bd
    : tone === undefined
      ? undefined
      : TOKENS[tone].line

/** The board's close mark on cards and the pane: one glyph, so Desktop draws it bare, not as a grey pill. */
export const CLOSE = { glyph: '×', ascii: 'x' } as const

/** Joins one Flow-tab phase to the next on the terminal. */
export const FLOW_JOIN = { glyph: '│', ascii: '|' } as const

/** Between the map chip and the feature in the collapsed summary: Map › Feature. */
export const SUMMARY_SEP = { glyph: '›', ascii: '>' } as const

/** Splits the rail's Triage button, map chip and title on the terminal. */
export const RAIL_DIVIDER = { glyph: '│', ascii: '|' } as const

/** The Settings button, one cell. */
/** The Triage button's tray on the terminal, where Desktop draws the board's inbox icon. */
export const TRAY = { glyph: '⊟', ascii: '#' } as const

export const GEAR = { glyph: '\u2699', ascii: '=' } as const

/** After the title when it opens the feature switcher. */
export const CARET = { glyph: '▾', ascii: 'v' } as const

/** Before a count of deleted lines. */
export const MINUS = { glyph: '−', ascii: '-' } as const

/** A switch's state where no Svg draws it. */
export const SWITCH_MARK = {
  on: { glyph: '●', ascii: '*' },
  off: { glyph: '○', ascii: 'o' },
} as const

/** Ends clipped text; ASCII spends three cells on it. */
export const ELLIPSIS = { glyph: '…', ascii: '...' } as const

/** A border drawn but not seen, so a step at rest keeps its size and a hover can still restyle it. */
export const CLEAR = 'transparent'

export const SPACE = {
  noticeGap: 'sm',
  noticePadX: 'md',
  noticeAbove: 'xs',
  buttonPadX: 'sm',
  railGap: 'xs',
  /** Between the rail's head row and its phases row: no row on the terminal. */
  railRowGap: 'sm',
  railPadX: 'sm',
  phaseGap: 'xs',
  phasePadX: 'sm',
  summaryGap: 'sm',
  cardAbove: 'sm',
  cardPadX: 'lg',
  cardGap: 'xs',
  cardHeadGap: 'sm',
  lineGap: 'xs',
  rowLabelGap: 'sm',
  chipGap: 'xs',
  chipPadX: 'sm',
  gateGap: 'sm',
  gatePadX: 'sm',
  agentsGap: 'xs',
  agentsPadX: 'sm',
  agentsPadY: 'xs',
  agentLineGap: 'xs',
  buttonsGap: 'sm',
  pickerGap: 'sm',
  paneLeft: 'md',
  paneRight: 'sm',
  paneGap: 'md',
  tabGap: 'md',
  tabPad: 'sm',
  sectionGap: 'lg',
  fieldGap: 'sm',
  rowTextGap: 'xs',
  switchSide: 'md',
} as const satisfies Record<string, Space>

const CLAUDE_THEME = /^(light|dark)(-daltonized|-ansi)?$/

export type ToneInput = {
  theme: ThemeChoice
  claudeTheme: unknown
  surface: RenderSurface
  colorFgBg: Tone | undefined
  system: Tone | undefined
}

/**
 * The tone to draw in, or undefined for the terminal's own colours. Claude Code's `auto` theme
 * answers an OSC 11 query mods cannot see, so the terminal falls back to `COLORFGBG`. An ANSI
 * theme keeps the terminal's palette. Other surfaces follow the OS appearance, then the Claude Code theme.
 */
export function resolveTone({
  theme,
  claudeTheme,
  surface,
  colorFgBg,
  system,
}: ToneInput): Tone | undefined {
  if (theme !== 'auto') return theme
  const match = typeof claudeTheme === 'string' ? CLAUDE_THEME.exec(claudeTheme) : null
  const isAnsi = match?.[2] === '-ansi'
  const claude = match && !isAnsi ? (match[1] as Tone) : undefined
  if (surface !== 'terminal') return system ?? claude ?? 'light'
  return isAnsi ? undefined : (claude ?? colorFgBg ?? system ?? 'dark')
}

const ACROSS = { xs: 1, sm: 1, md: 2, lg: 3, xl: 4 } as const
const DOWN = { xs: 0, sm: 0, md: 1, lg: 1, xl: 2 } as const

export const across = (space: Space) => (typeof space === 'number' ? space : ACROSS[space])

export const down = (space: Space) => (typeof space === 'number' ? space : DOWN[space])

const channels = (hex: string) => [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16))

export const mix = (a: string, b: string, t: number) => {
  const [from, to] = [channels(a), channels(b)]
  const hex = from.map((c, i) =>
    Math.round(c + (to[i]! - c) * t)
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${hex.join('').toUpperCase()}`
}

export const HOVER_MIX = 0.1
