import type { Color } from 'claude-code'

import type { Kind, Status, Toggle } from '../types'

export type Palette = 'light' | 'dark' | undefined

type Tone = { fg: string; tint: string }

export type TogglePalette = { light: Tone; dark: Tone; key: Color }

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

const NEUTRAL: TogglePalette = {
  light: { fg: '#2A2D35', tint: '#F0F1F4' },
  dark: { fg: '#C9CCD3', tint: '#2A2C31' },
  key: 'subtle',
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
      light: { fg: '#1F4FC1', tint: '#EDF2FD' },
      dark: { fg: '#8FB0FF', tint: '#1B2A4A' },
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
      light: { fg: '#5B3A99', tint: '#F3EEFB' },
      dark: { fg: '#C3A8F5', tint: '#2C2147' },
      key: 'merged',
    },
  },
  mcp: {
    option: 'show_mcp',
    title: 'MCP servers',
    noun: 'MCP server',
    plural: 'MCP',
    description: 'Servers whose tools were called, with a count and any auth failures.',
    example: 'github',
    glyph: '⇌',
    hotkey: 'p',
    optional: false,
    showsTally: true,
    dim: true,
    palette: {
      light: { fg: '#9C1F62', tint: '#FCEEF5' },
      dark: { fg: '#F29BC8', tint: '#3D1A2D' },
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
    optional: false,
    showsTally: true,
    dim: false,
    palette: {
      light: { fg: '#0E6159', tint: '#E8F5F2' },
      dark: { fg: '#7FD6C8', tint: '#123A35' },
      key: 'permission',
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
      light: { fg: '#9A4A0B', tint: '#FDF1E6' },
      dark: { fg: '#F5B47A', tint: '#3D2614' },
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
    palette: {
      light: { fg: '#2A2D35', tint: '#FFFFFF' },
      dark: { fg: '#D5D8DE', tint: '#24262C' },
      key: 'text',
    },
  },
  command: {
    option: 'show_commands',
    title: 'Slash commands',
    noun: 'Slash command',
    plural: 'Commands',
    description: 'Custom commands from .claude/commands that ran.',
    example: '/release-notes',
    glyph: '/',
    hotkey: 'o',
    optional: true,
    showsTally: true,
    dim: true,
    palette: NEUTRAL,
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
    palette: NEUTRAL,
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
    palette: NEUTRAL,
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
    palette: NEUTRAL,
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
    palette: NEUTRAL,
  },
  model: {
    option: 'show_model',
    title: 'Output style and model',
    noun: 'Model',
    plural: 'Model',
    description: 'A quiet chip when the style or model changes mid-session.',
    example: 'Style: Explanatory',
    glyph: '≡',
    hotkey: 'l',
    optional: true,
    showsTally: true,
    dim: true,
    palette: NEUTRAL,
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
    palette: NEUTRAL,
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

export const BORDER_MIX = 0.2

export const HOVER_MIX = 0.1

export const STAT_TILE = { light: '#F5F6F8', dark: '#2A2C31' } as const

export const STOPPED = { fg: '#FFFFFF', bg: '#B42318' } as const

export const STOPPED_BORDER = { light: '#E8A39C', dark: '#B5544A' } as const

export const ERROR_FG = { light: '#B42318', dark: '#FF8A80' } as const

export const ERROR_TINT = { light: '#FFFFFF', dark: '#2A1A1A' } as const

export const CARD_BORDER = { light: '#DADCE1', dark: '#3A3D44' } as const

export const SPINNER = ['◐', '◓', '◑', '◒'] as const

export const SPIN_MS = 150

export const FRESH_MS = 4000

export const paletteFor = (theme: unknown): Palette => {
  const match = typeof theme === 'string' ? /^(light|dark)(-daltonized)?$/.exec(theme) : null
  return match ? (match[1] === 'light' ? 'light' : 'dark') : undefined
}

export type StatusTheme = { label: string; badge?: string; glyph?: string; color?: Color }

export const STATUSES: Record<Status, StatusTheme> = {
  active: { label: 'Active' },
  ok: { label: 'OK' },
  running: { label: 'Running' },
  blocked: { label: 'Blocked', badge: 'BLOCKED', color: 'error' },
  denied: { label: 'Denied', badge: 'DENIED', color: 'error' },
  error: { label: 'Error', badge: 'ERROR', glyph: '▲', color: 'error' },
}

export const isStopped = (status: Status) => status === 'blocked' || status === 'denied'

export const isUrgent = (status: Status) => isStopped(status) || status === 'error'
