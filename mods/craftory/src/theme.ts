/**
 * Tokens copied from session-activity's `TOKENS` (DESIGN "Palette"), so the two mods sit
 * together in one band. Craftory does not import across mods. Roles: skill (blue) is running
 * and up next, perm (teal) is done and merged, hook (amber) is needs you and gates, danger is
 * failed and over budget.
 */
import type { Color, RenderSurface, Space } from 'claude-code'
import type { ThemeChoice, Tone } from '../types'
import type { StepState } from './evidence'

export type { Tone }

/** The design's neutral tokens, one set per tone. */
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

/** The `skill`, `perm` and `hook` triples of session-activity's palette. */
export const TRIPLES: Record<'skill' | 'perm' | 'hook', Record<Tone, Triple>> = {
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
}

export type Role = 'skill' | 'perm' | 'hook' | 'danger' | 'neutral' | 'muted'

/** Theme keys a terminal without a known background falls back to, one per role. */
const TERMINAL_KEY: Record<Role, Color> = {
  skill: 'suggestion',
  perm: 'planMode',
  hook: 'warning',
  danger: 'error',
  neutral: 'text',
  muted: 'subtle',
}

export type Paint = { fg: Color; bg: Color | undefined; bd: Color | undefined }

/** A role's colours in a tone. An undefined tone is the terminal's own colours. */
export function paint(role: Role, tone: Tone | undefined): Paint {
  if (tone === undefined) return { fg: TERMINAL_KEY[role], bg: undefined, bd: undefined }
  const t = TOKENS[tone]
  switch (role) {
    case 'skill':
    case 'perm':
    case 'hook':
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

/** DESIGN "Phase step states": glyph, colour role and words per state. */
export const STEP_LOOKS: Record<StepState['kind'], StateLook> = {
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

export const SPINNER = ['◐', '◓', '◑', '◒'] as const
export const SPINNER_ASCII = ['|', '/', '-', '\\'] as const
export const SPIN_MS = 150

export const CONNECTOR = { glyph: '─', ascii: '-' } as const

/** Layout spacing by design role, as the step each board pixel value rounds to. */
export const SPACE = {
  noticeGap: 'sm',
  noticePadX: 'md',
  noticeAbove: 'xs',
  buttonPadX: 'sm',
  railGap: 'xs',
  railPadX: 'sm',
  stepGap: 'xs',
  stepPadX: 'sm',
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
  buttonsGap: 'sm',
  pickerGap: 'sm',
  paneLeft: 'md',
  paneRight: 'sm',
  paneGap: 'md',
} as const satisfies Record<string, Space>

const CLAUDE_THEME = /^(light|dark)(-daltonized|-ansi)?$/

export type ToneInput = {
  theme: ThemeChoice
  /** The Claude Code `theme` setting. */
  claudeTheme: unknown
  surface: RenderSurface
  /** The tone `COLORFGBG` names, when the terminal sets it. */
  colorFgBg: Tone | undefined
  /** The tone the operating system appearance names, probed off the render path. */
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

/** Cells a step takes along a row on the terminal, and a plain number as itself. */
export const across = (space: Space) => (typeof space === 'number' ? space : ACROSS[space])

/** Cells a step takes down a column on the terminal. */
export const down = (space: Space) => (typeof space === 'number' ? space : DOWN[space])

const channels = (hex: string) => [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16))

/** Blends `#RRGGBB` a toward b by t (0 is a, 1 is b). */
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
