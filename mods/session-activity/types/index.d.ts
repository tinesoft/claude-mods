export type Kind =
  | 'skill'
  | 'agent'
  | 'mcp'
  | 'perm'
  | 'hook'
  | 'rule'
  | 'command'
  | 'context'
  | 'model'
  | 'background'

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

export type Overrides = {
  enabled?: boolean
  layout?: Layout
  shown?: Partial<Record<Kind, boolean>>
}

export type Filter = Kind | 'all'

export type PaneTab = 'activity' | 'settings'

declare module 'claude-code' {
  interface PluginState {
    'session-activity': {
      activations: Activation[]
      muted: string[]
      selected: string | null
      paneTab: PaneTab
      filter: Filter
      overrides: Overrides | null
    }
  }
}
