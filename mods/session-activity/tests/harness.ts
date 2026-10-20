import type { On, RenderSurface } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'

export const CWD = '/repo'

const FILES: Record<string, string> = { '/repo/CLAUDE.md': 'a\nb\nc' }

export const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

export const session = (
  on: On,
  settings: Record<string, unknown> = {},
  store = new Map<string, unknown>(),
  theme = 'dark',
  surfaces: readonly RenderSurface[] = ['terminal'],
) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => (store.set(e.key, e.value), { value: undefined }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.cwd', () => ({ value: CWD }))
  on('settings.read', () => ({ value: settings }))
  on('config.list', () => ({
    value: [
      {
        key: 'theme',
        label: 'Theme',
        kind: 'choice',
        value: theme,
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  on('fs.read', ($, e) => (e.path in FILES ? { value: FILES[e.path]! } : { deny: 'no such file' }))
  return clock
}

export const bandProps = (bodyColumns: number, maxRows = 24) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
})

export const mountBand = <S extends RenderSurface = 'terminal'>(
  $: Engine,
  surface: S = 'terminal' as S,
  columns = 100,
  maxRows = 24,
) =>
  $.ui.mount({
    plugin: 'session-activity',
    surface,
    component: 'AbovePrompt',
    props: bandProps(columns, maxRows),
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

export type Finder = { findAll: (q: ElementQuery) => Promise<FoundElement[]> }

export const chipTexts = async (band: Finder) =>
  (await band.findAll({ type: 'Box' }))
    .filter(b => b.key?.startsWith('box-'))
    .map(b => `${b.key!.slice(4)}|${b.text}`)

type Drawn = { props?: { key?: string }; hover?: unknown; children?: unknown[] }

/** `hover` rides beside `props` in the drawn tree, so `find` never returns it. */
export const hoversOf = async (mounted: { drawn: () => Promise<unknown> }, keyPrefix: string) => {
  const found: unknown[] = []
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return
    const { props, hover, children } = node as Drawn
    if (props?.key?.startsWith(keyPrefix)) found.push(hover)
    children?.forEach(walk)
  }
  walk(await mounted.drawn())
  return found
}

export const FRESH = 4001

export const stubEngine = (
  on: On,
  answers: {
    verdict?: { decision: 'allow' | 'ask' | 'deny'; rule?: string; reason?: string }
    stop?: { block?: string }
    call?: { deny: string }
  } = {},
) => {
  const opened: string[] = []
  const opens: { id: string; rows?: number }[] = []
  const copied: string[] = []
  const toasts: string[] = []
  let invalidations = 0
  const status: { text: string | undefined }[] = []
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
  on('ui.open', ($, e) => (opened.push(e.id), opens.push(e), { value: { isPlaced: true } }))
  on('ui.copy', ($, e) => (copied.push(e.text), { value: { isCopied: true } }))
  on('ui.invalidate', () => (invalidations++, { value: undefined }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  on('ui.status', ($, e) => (status.push({ text: e.text }), { value: undefined }))
  return {
    opened,
    copied,
    toasts,
    invalidations: () => invalidations,
    opens,
    status: () => status.at(-1)?.text,
  }
}
