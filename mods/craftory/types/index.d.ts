export type PaneTab = 'flow' | 'tickets' | 'worktrees' | 'glossary' | 'settings'

declare module 'claude-code' {
  interface PluginState {
    craftory: {
      paneTab: PaneTab
    }
  }
}
