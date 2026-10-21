export type Kind =
  | 'skill'
  | 'agent'
  | 'mcp'
  | 'perm'
  | 'hook'
  | 'rule'
  | 'command'
  | 'memory'
  | 'context'
  | 'checkpoint'
  | 'model'
  | 'background'

export type Toggle = Kind | 'plugin'

export type Status = 'active' | 'running' | 'ok' | 'blocked' | 'denied' | 'error'

export type Activation = {
  kind: Kind
  key: string
  label: string
  detail: string
  source?: string
  meta?: string
  plugin?: string
  status: Status
  count: number
  firstAt: number
  lastAt: number
  runningAgentIds?: string[]
  askedCallId?: string
  agentId?: string
}

export type Layout = 'row' | 'summary'

export type ChipStyle = 'tinted' | 'text'

export type ChipTheme = 'auto' | 'light' | 'dark'

export type Tone = 'light' | 'dark'

export type Settings = {
  enabled: boolean
  layout: Layout
  maxChips: number
  chipStyle: ChipStyle
  chipTheme: ChipTheme
  hotkeys: boolean
  toastOnBlock: boolean
  textSummary: boolean
  shown: Record<Toggle, boolean>
}

export type Overrides = Partial<Omit<Settings, 'maxChips' | 'shown'>> & {
  shown?: Partial<Settings['shown']>
}

export type Filter = Kind | 'all'

export type PaneView = 'detail' | 'activity' | 'settings'

declare module 'claude-code' {
  interface PluginState {
    'session-activity': {
      activations: Activation[]
      muted: string[]
      selected: string | null
      paneView: PaneView
      filter: Filter
      overrides: Overrides | null
      appearance: { system: Tone | null; colorFgBg: Tone | null }
      model: string | null
    }
  }
}
