import type { On, RenderSurface } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'

export const CWD = '/repo'

const FILES: Record<string, string> = { '/repo/CLAUDE.md': 'a\nb\nc' }

export const SURFACES = ['terminal', 'desktop'] as const

export const session = (
  on: On,
  settings: Record<string, unknown> = {},
  store = new Map<string, unknown>(),
) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => (store.set(e.key, e.value), { value: undefined }))
  on('session.cwd', () => ({ value: CWD }))
  on('settings.read', () => ({ value: settings }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  on('fs.read', ($, e) => (e.path in FILES ? { value: FILES[e.path]! } : { deny: 'no such file' }))
  return clock
}

export const bandProps = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
})

export const mountBand = <S extends RenderSurface = 'terminal'>(
  $: Engine,
  surface: S = 'terminal' as S,
  columns = 100,
) =>
  $.ui.mount({
    plugin: 'session-activity',
    surface,
    component: 'AbovePrompt',
    props: bandProps(columns),
  })

export const mountPane = <S extends RenderSurface = 'terminal'>(
  $: Engine,
  surface: S = 'terminal' as S,
  columns = 100,
) =>
  $.ui.mount({
    plugin: 'session-activity',
    surface,
    component: 'Pane',
    requestId: 'session-activity',
    props: {
      title: 'Session activity',
      isFocused: true,
      bodyColumns: columns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })

export const chipTexts = async (band: { findAll: (q: ElementQuery) => Promise<FoundElement[]> }) =>
  (await band.findAll({ type: 'Button' })).map(b => `${b.key}|${b.text}`)

export const stubEngine = (
  on: On,
  answers: {
    verdict?: { decision: 'allow' | 'ask' | 'deny'; rule?: string; reason?: string }
    stop?: { block?: string }
    call?: { deny: string }
  } = {},
) => {
  const opened: string[] = []
  const copied: string[] = []
  on('tool.call', () => answers.call ?? { result: 'ran' })
  on('tool.check', () => answers.verdict ?? { decision: 'allow' })
  on('skill.prompt', ($, e) => ({ text: `body of ${e.skill}` }))
  on('agent.spawn', ($, e) => ({ model: 'haiku', agentId: `agent-${e.description}` }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('classic.InstructionsLoaded', () => ({}))
  on('classic.Stop', () => answers.stop ?? {})
  on('classic.PostToolUse', () => ({}))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('command.run', () => ({ text: 'ran' }))
  on('ui.open', ($, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.copy', ($, e) => (copied.push(e.text), { value: { isCopied: true } }))
  return { opened, copied }
}
