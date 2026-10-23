import type { Color, RenderSurface, Space } from 'claude-code'

import type { ChipStyle, ChipTheme, Kind, Status, Toggle, Tone } from '../types'

export type { Tone }

export type KindPaint = { fg: string; bg: string; bd: string }

export type TogglePalette = Record<Tone, KindPaint> & { key: Color }

/** The design's neutral tokens, one set per tone. `countBg` is a translucent wash over the chip. */
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

type Neutral = Exclude<keyof Tokens, 'countBg'>

const neutral = (bg: Neutral, bd: Neutral, key: Color): TogglePalette => {
  const paint = (tone: Tone): KindPaint => {
    const t = TOKENS[tone]
    return { fg: t.ink2, bg: t[bg], bd: t[bd] }
  }
  return { light: paint('light'), dark: paint('dark'), key }
}

const RULE = neutral('surface', 'lineStrong', 'text')

const OPTIONAL = neutral('fill', 'line', 'subtle')

export type ToggleTheme = {
  option: string
  title: string
  noun: string
  plural: string
  description: string
  example: string
  glyph: string
  hotkey: string
  optional: boolean
  showsTally: boolean
  dim: boolean
  palette: TogglePalette
}

export const TOGGLES: Record<Toggle, ToggleTheme> = {
  skill: {
    option: 'show_skills',
    title: 'Skills',
    noun: 'Skill',
    plural: 'Skills',
    description: 'SKILL.md files Claude loaded because your request matched them.',
    example: 'docx',
    glyph: '▤',
    hotkey: 's',
    optional: false,
    showsTally: true,
    dim: false,
    palette: {
      light: { fg: '#1F4FC1', bg: '#EDF2FD', bd: '#C9D7F7' },
      dark: { fg: '#8FB0FF', bg: '#1B2A4A', bd: '#2D4373' },
      key: 'suggestion',
    },
  },
  agent: {
    option: 'show_agents',
    title: 'Agents',
    noun: 'Agent',
    plural: 'Agents',
    description: 'Subagents Claude handed work to, built-in or from .claude/agents.',
    example: 'code-reviewer',
    glyph: '◉',
    hotkey: 'g',
    optional: false,
    showsTally: true,
    dim: false,
    palette: {
      light: { fg: '#5B3A99', bg: '#F3EEFB', bd: '#D9CCF0' },
      dark: { fg: '#C3A8F5', bg: '#2C2147', bd: '#463470' },
      key: 'merged',
    },
  },
  mcp: {
    option: 'show_mcp',
    title: 'MCP servers',
    noun: 'MCP',
    plural: 'MCP',
    description: 'Servers whose tools were called, with a count and any auth failures.',
    example: 'github',
    glyph: '⇌',
    hotkey: 'p',
    optional: false,
    showsTally: true,
    dim: true,
    palette: {
      light: { fg: '#9C1F62', bg: '#FCEEF5', bd: '#F0C8DC' },
      dark: { fg: '#F29BC8', bg: '#3D1A2D', bd: '#63304A' },
      key: 'merged',
    },
  },
  perm: {
    option: 'show_permissions',
    title: 'Permissions',
    noun: 'Permission',
    plural: 'Permissions',
    description: 'Actions you approved, auto-allowed by a rule, or denied.',
    example: 'git push',
    glyph: '⚷',
    hotkey: 'k',
    optional: true,
    showsTally: true,
    dim: false,
    palette: {
      light: { fg: '#0E6159', bg: '#E8F5F2', bd: '#BCE0D8' },
      dark: { fg: '#7FD6C8', bg: '#123A35', bd: '#22594F' },
      // Every Claude Code theme gives `permission` the same blue as `suggestion` (Skill); `planMode` is its teal.
      key: 'planMode',
    },
  },
  hook: {
    option: 'show_hooks',
    title: 'Hooks',
    noun: 'Hook',
    plural: 'Hooks',
    description: 'Commands from settings that ran on events like PreToolUse or Stop.',
    example: 'lint-staged',
    glyph: '↯',
    hotkey: 'h',
    optional: false,
    showsTally: true,
    dim: false,
    palette: {
      light: { fg: '#9A4A0B', bg: '#FDF1E6', bd: '#F0CFAE' },
      dark: { fg: '#F5B47A', bg: '#3D2614', bd: '#643F20' },
      key: 'warning',
    },
  },
  rule: {
    option: 'show_rules',
    title: 'Rules',
    noun: 'Rule',
    plural: 'Rules',
    description: 'CLAUDE.md and .claude/rules files Claude loaded.',
    example: 'CLAUDE.md',
    glyph: '▣',
    hotkey: 'r',
    optional: false,
    showsTally: true,
    dim: false,
    palette: RULE,
  },
  command: {
    option: 'show_commands',
    title: 'Slash commands',
    noun: 'Slash command',
    plural: 'Commands',
    description: 'Custom commands from .claude/commands that ran.',
    example: 'release-notes',
    glyph: '/',
    hotkey: 'o',
    optional: true,
    showsTally: true,
    dim: true,
    palette: OPTIONAL,
  },
  memory: {
    option: 'show_memory',
    title: 'Memory',
    noun: 'Memory',
    plural: 'Memory',
    description: 'When Claude writes a memory file, so you can see what it learned.',
    example: 'Remembered: CLAUDE.md',
    glyph: '✎',
    hotkey: 'e',
    optional: true,
    showsTally: true,
    dim: true,
    palette: OPTIONAL,
  },
  plugin: {
    option: 'show_plugins',
    title: 'Plugins',
    noun: 'Plugin',
    plural: 'Plugins',
    description: 'Tags each chip with the plugin that supplied it.',
    example: 'via acme-devtools',
    glyph: '⬡',
    hotkey: 'u',
    optional: true,
    showsTally: false,
    dim: true,
    palette: OPTIONAL,
  },
  context: {
    option: 'show_context',
    title: 'Context',
    noun: 'Context',
    plural: 'Context',
    description: 'Compaction events and a context-usage gauge.',
    example: 'Compacted',
    glyph: '◔',
    hotkey: 'x',
    optional: true,
    showsTally: false,
    dim: true,
    palette: OPTIONAL,
  },
  checkpoint: {
    option: 'show_checkpoints',
    title: 'Checkpoints',
    noun: 'Checkpoint',
    plural: 'Checkpoints',
    description: 'Restore points made before edits. Not supported yet: Claude Code sends no event.',
    example: 'Checkpoint 3',
    glyph: '⚑',
    hotkey: 'f',
    optional: true,
    showsTally: true,
    dim: true,
    palette: OPTIONAL,
  },
  model: {
    option: 'show_model',
    title: 'Model switches',
    noun: 'Model',
    plural: 'Model',
    description: 'A quiet chip when the model changes mid-session.',
    example: 'Model: opus',
    glyph: '≡',
    hotkey: 'l',
    optional: true,
    showsTally: false,
    dim: true,
    palette: OPTIONAL,
  },
  background: {
    option: 'show_background',
    title: 'Background tasks',
    noun: 'Background task',
    plural: 'Background',
    description: 'Long-running shells or dev servers still alive.',
    example: 'pnpm dev',
    glyph: '▶',
    hotkey: 'b',
    optional: true,
    showsTally: true,
    dim: true,
    palette: OPTIONAL,
  },
}

export const TOGGLE_ORDER = Object.keys(TOGGLES) as Toggle[]

export const isKind = (toggle: Toggle): toggle is Kind => toggle !== 'plugin'

export const KIND_ORDER = TOGGLE_ORDER.filter(isKind)

const channels = (hex: string) =>
  [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

/** Blends `#RRGGBB` a toward b by t (0 is a, 1 is b). */
export const mix = (a: string, b: string, t: number) => {
  const [from, to] = [channels(a), channels(b)]
  const hex = from.map((c, i) => {
    const value = Math.round(c + (to[i]! - c) * t)
    return value.toString(16).padStart(2, '0')
  })
  return `#${hex.join('').toUpperCase()}`
}

export const HOVER_MIX = 0.1

/** The Blocked and Denied badge: white on red in both tones. */
export const STOPPED = { fg: '#FFFFFF', bg: '#B42318' } as const

export const SPINNER = ['◐', '◓', '◑', '◒'] as const

export const SPIN_MS = 150

export const FRESH_MS = 4000

export const FADE_SLACK_MS = 1000

const CLAUDE_THEME = /^(light|dark)(-daltonized|-ansi)?$/

export type ToneInput = {
  chipStyle: ChipStyle
  chipTheme: ChipTheme
  /** The Claude Code `theme` setting. */
  claudeTheme: unknown
  surface: RenderSurface
  /** The tone `COLORFGBG` names, when the terminal sets it. */
  colorFgBg: Tone | undefined
  /** The tone the operating system appearance names. */
  system: Tone | undefined
}

/**
 * The tone chips are drawn in, or undefined for the untinted look. Claude Code's own
 * `auto` theme answers an OSC 11 query mods cannot see, so the terminal falls back to
 * `COLORFGBG`, then the OS appearance. Other surfaces follow the OS or app first.
 */
export const resolveTone = (input: ToneInput): Tone | undefined => {
  const { chipStyle, chipTheme, claudeTheme, surface, colorFgBg, system } = input
  if (chipStyle === 'text') return undefined
  if (chipTheme !== 'auto') return chipTheme
  const match = typeof claudeTheme === 'string' ? CLAUDE_THEME.exec(claudeTheme) : null
  const isAnsi = match?.[2] === '-ansi'
  const claude = match && !isAnsi ? (match[1] as Tone) : undefined
  if (surface !== 'terminal') return system ?? claude ?? 'light'
  return isAnsi ? undefined : (claude ?? colorFgBg ?? system ?? 'dark')
}

export type StatusTheme = { label: string; badge?: string; glyph?: string }

export const STATUSES: Record<Status, StatusTheme> = {
  active: { label: 'Active' },
  ok: { label: 'OK' },
  running: { label: 'Running' },
  blocked: { label: 'Blocked', badge: 'BLOCKED' },
  denied: { label: 'Denied', badge: 'DENIED' },
  error: { label: 'Error', badge: 'ERROR', glyph: '▲' },
}

export const isStopped = (status: Status) => status === 'blocked' || status === 'denied'

export const isUrgent = (status: Status) => isStopped(status) || status === 'error'

/**
 * Layout spacing by design role, as the step each board pixel value rounds to
 * (6px xs, 8-10px sm, 12-14px md, 16-20px lg, 24px and up xl). Desktop and the
 * phones size a step in pixels; the terminal and VS Code turn it into cells with `across` and `down`.
 */
export const SPACE = {
  chipGap: 'xs',
  chipInner: 'xs',
  chipPadX: 'sm',
  morePadX: 'sm',
  summaryGap: 'sm',
  summaryPadX: 'md',
  cardAbove: 'sm',
  cardHeadGap: 'sm',
  cardLinesGap: 'xs',
  tilesGap: 'sm',
  tilePadX: 'sm',
  tilePadY: 'sm',
  tileGap: 'xs',
  actionsGap: 'sm',
  paneLeft: 'md',
  paneRight: 'sm',
  paneGap: 'md',
  paneTitleGap: 'xs',
  statsGap: 'xs',
  tabsBelow: 'md',
  tabGap: 'lg',
  groupGap: 'xs',
  listGap: 'lg',
  rowGrid: 'sm',
  rowTextGap: 'xs',
  rowSide: 'sm',
  settingsGap: 'xl',
  introGap: 'xs',
  sectionGap: 'sm',
  previewGap: 'sm',
  segmentsHeadGap: 'md',
  promptPadX: 'md',
  previewPad: 'lg',
  previewInnerGap: 'sm',
  switchCardPadLeft: 'lg',
  switchCardPadRight: 'sm',
  switchCardPadY: 'xs',
  optionalHeadGap: 'sm',
  switchGrid: 'md',
  switchSide: 'md',
  footerGap: 'sm',
} as const satisfies Record<string, Space>

/** How much air the detail card keeps: roomy where the band has the rows, compact where it is short. */
export type CardDensity = 'roomy' | 'compact'

export const CARD_DENSITIES = ['roomy', 'compact'] as const satisfies readonly CardDensity[]

export const CARD_SPACE = {
  roomy: { padX: 'lg', padY: 'lg', gap: 'md' },
  compact: { padX: 'lg', padY: 0, gap: 0 },
} as const satisfies Record<CardDensity, { padX: Space; padY: Space; gap: Space }>

const ACROSS = { xs: 1, sm: 1, md: 2, lg: 3, xl: 4 } as const
const DOWN = { xs: 0, sm: 0, md: 1, lg: 1, xl: 2 } as const

/** Cells a step takes along a row on the terminal and VS Code, and a plain number as itself. */
export const across = (space: Space) => (typeof space === 'number' ? space : ACROSS[space])

/** Cells a step takes down a column on the terminal and VS Code. */
export const down = (space: Space) => (typeof space === 'number' ? space : DOWN[space])
