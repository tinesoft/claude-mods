import type { On, RenderSurface } from 'claude-code'
import type { Engine } from 'claude-code/testing'

export const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

export const stubEngine = (on: On) => {
  const registered: { name: string; immediate?: boolean }[] = []
  const opens: { id: string; title?: string }[] = []
  on('command.register', ($, e) => (registered.push(e), { value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.open', ($, e) => (opens.push(e), { value: { isPlaced: true } }))
  return { registered, opens }
}

export const mountPane = ($: Engine, surface: RenderSurface = 'terminal') =>
  $.ui.mount({
    plugin: 'craftory',
    surface,
    component: 'Pane',
    requestId: 'craftory',
    props: {
      title: 'Craftory',
      isFocused: true,
      bodyColumns: 100,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })
