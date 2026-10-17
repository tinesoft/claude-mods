import type { Color } from 'claude-code'

import type { Kind, Status } from '../types'

export type KindTheme = {
  glyph: string
  color: Color
  dim: boolean
  hex: string
  title: string
  plural: string
  hotkey: string
  isOptional: boolean
  showsTally: boolean
}

export const KINDS: Record<Kind, KindTheme> = {
  skill: {
    glyph: '▤',
    color: 'suggestion',
    dim: false,
    hex: '#1F4FC1',
    title: 'Skill',
    plural: 'Skills',
    hotkey: 's',
    isOptional: false,
    showsTally: true,
  },
  agent: {
    glyph: '◉',
    color: 'merged',
    dim: false,
    hex: '#5B3A99',
    title: 'Agent',
    plural: 'Agents',
    hotkey: 'g',
    isOptional: false,
    showsTally: true,
  },
  mcp: {
    glyph: '⇌',
    color: 'merged',
    dim: true,
    hex: '#9C1F62',
    title: 'MCP server',
    plural: 'MCP',
    hotkey: 'p',
    isOptional: false,
    showsTally: true,
  },
  perm: {
    glyph: '⚷',
    color: 'permission',
    dim: false,
    hex: '#0E6159',
    title: 'Permission',
    plural: 'Permissions',
    hotkey: 'k',
    isOptional: false,
    showsTally: true,
  },
  hook: {
    glyph: '↯',
    color: 'warning',
    dim: false,
    hex: '#9A4A0B',
    title: 'Hook',
    plural: 'Hooks',
    hotkey: 'h',
    isOptional: false,
    showsTally: true,
  },
  rule: {
    glyph: '▣',
    color: 'text',
    dim: false,
    hex: '#2A2D35',
    title: 'Rule',
    plural: 'Rules',
    hotkey: 'r',
    isOptional: false,
    showsTally: true,
  },
  command: {
    glyph: '/',
    color: 'subtle',
    dim: true,
    hex: '#2A2D35',
    title: 'Slash command',
    plural: 'Commands',
    hotkey: 'o',
    isOptional: true,
    showsTally: true,
  },
  context: {
    glyph: '◔',
    color: 'subtle',
    dim: true,
    hex: '#2A2D35',
    title: 'Context',
    plural: 'Context',
    hotkey: 'x',
    isOptional: true,
    showsTally: false,
  },
  model: {
    glyph: '≡',
    color: 'subtle',
    dim: true,
    hex: '#2A2D35',
    title: 'Model',
    plural: 'Model',
    hotkey: 'l',
    isOptional: true,
    showsTally: true,
  },
  background: {
    glyph: '▶',
    color: 'subtle',
    dim: true,
    hex: '#2A2D35',
    title: 'Background task',
    plural: 'Background',
    hotkey: 'b',
    isOptional: true,
    showsTally: true,
  },
}

export const KIND_ORDER = Object.keys(KINDS) as Kind[]

export type StatusTheme = { badge?: string; color?: Color; dim?: boolean }

export const STATUSES: Record<Status, StatusTheme> = {
  active: {},
  ok: {},
  running: { badge: 'RUNNING', dim: true },
  blocked: { badge: 'BLOCKED', color: 'error' },
  denied: { badge: 'DENIED', color: 'error' },
  error: { badge: 'ERROR', color: 'error' },
}

export const isStopped = (status: Status) => status === 'blocked' || status === 'denied'

export const isUrgent = (status: Status) => isStopped(status) || status === 'error'
