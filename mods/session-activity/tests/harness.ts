import type { On, RenderSurface } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement, TestRest } from 'claude-code/testing'
import { across } from '../src/theme'

export const CWD = '/repo'

const FILES: Record<string, string> = { '/repo/CLAUDE.md': 'a\nb\nc' }

export const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

/** The engine raises `AbovePrompt` on these surfaces only (index.d.ts:10673). */
export const BAND_SURFACES = ['terminal', 'desktop'] as const

export type BandSurface = (typeof BAND_SURFACES)[number]

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

/** The kit has no `test.skip`: declares nothing, but keeps the body type-checked. */
export const skip: (name: string, ...rest: TestRest) => void = () => {}

export const bandProps = (bodyColumns: number, maxRows = 24) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
})

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

const LEAF_TEXT = ['label', 'text', 'source', 'value'] as const

const shown = (node: unknown, prefixed: boolean): string => {
  if (typeof node === 'string') return node
  const { type, props = {}, children = [] } = node as Node
  const own = children.length
    ? children.map(c => shown(c, prefixed)).join('')
    : String(LEAF_TEXT.map(k => props[k]).find(v => typeof v === 'string') ?? '')
  return prefixed && type === 'Button' && props.plain && typeof props.hotkey === 'string'
    ? `${props.hotkey}: ${own}`
    : own
}

const matches = (text: string, q: string | RegExp | undefined) =>
  q === undefined || (typeof q === 'string' ? text.includes(q) : q.test(text))

/**
 * The kit reports a Button's label as drawn on no surface in particular. The terminal draws a
 * `plain` one with a hotkey as `hotkey: label`, so on the terminal every found text carries it.
 */
const asDrawn = <
  M extends Finder & { find: (q: ElementQuery) => Promise<FoundElement | undefined> },
>(
  mounted: M,
  surface: RenderSurface,
): M => {
  if (surface !== 'terminal') return mounted
  const findAll = async ({ text, ...q }: ElementQuery) => {
    const found = await mounted.findAll(q)
    return found
      .map(el => {
        if (shown(el, false) !== el.text)
          throw new Error(`harness drift: the kit shows ${JSON.stringify(el.text)}`)
        return { ...el, text: shown(el, true) }
      })
      .filter(el => matches(el.text, text))
  }
  const find = async (q: ElementQuery) => (await findAll(q))[0]
  return { ...mounted, find, findAll }
}

export const mountBand = async <S extends BandSurface = 'terminal'>(
  $: Engine,
  surface: S = 'terminal' as S,
  columns = 100,
  maxRows = 24,
) => {
  if (!(BAND_SURFACES as readonly string[]).includes(surface))
    throw new Error(`the engine never raises AbovePrompt on ${surface}`)
  return asDrawn(
    await $.ui.mount({
      plugin: 'session-activity',
      surface,
      component: 'AbovePrompt',
      props: bandProps(columns, maxRows),
    }),
    surface,
  )
}

export const mountPane = async <S extends RenderSurface = 'terminal'>(
  $: Engine,
  surface: S = 'terminal' as S,
  columns = 100,
) =>
  asDrawn(
    await $.ui.mount({
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
    }),
    surface,
  )

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
  const panes = new Map<string, string>()
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
  on('ui.open', ($, e) => {
    opened.push(e.id)
    opens.push(e)
    panes.set(e.id, e.title ?? e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => (panes.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...panes].map(([id, title]) => ({
      id,
      title,
      isShown: true,
      isFocused: true,
      isPlaced: true,
      plugin: 'session-activity',
      element: 'Pane',
    })),
  }))
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
    isOpen: (id: string) => panes.has(id),
    status: () => status.at(-1)?.text,
  }
}

/** Answers the appearance probes: `COLORFGBG`, and each system command by its executable. */
export const probes = (
  on: On,
  answers: {
    colorFgBg?: string
    system?: Record<string, { exitCode: number; stdout: string }>
  } = {},
) => {
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('env.get', (_$, e) => ({ value: e.name === 'COLORFGBG' ? answers.colorFgBg : undefined }))
  on('process.run', (_$, e) => {
    const answer = answers.system?.[e.argv[0]!]
    return answer === undefined
      ? { deny: `${e.argv[0]}: not found` }
      : { value: { ...answer, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return answers
}

type Space = Parameters<typeof across>[0]

/** Cells a drawn row takes on the terminal, as the engine lays it out. */
export const cellsAcross = (node: unknown): number => {
  if (typeof node === 'string') return node.length
  if (node === null || typeof node !== 'object') return 0
  const { type, props = {}, children = [] } = node as Node
  const parts = children.filter(c => c !== null && c !== false && c !== undefined && c !== '')
  const inner = parts.map(cellsAcross)
  if (type === 'Button') {
    const label = parts.length ? inner.reduce((a, b) => a + b, 0) : String(props.label ?? '').length
    return label + (props.plain && typeof props.hotkey === 'string' ? props.hotkey.length + 2 : 0)
  }
  if (type !== 'Box' || props.flexDirection === 'column') {
    return type === 'Box' ? Math.max(0, ...inner) : inner.reduce((a, b) => a + b, 0)
  }
  const gap = props.columnGap === undefined ? 0 : across(props.columnGap as Space)
  const pad = props.paddingX === undefined ? 0 : across(props.paddingX as Space)
  return (
    inner.reduce((a, b) => a + b, 0) +
    Math.max(0, parts.length - 1) * gap +
    2 * pad +
    (props.borderStyle === undefined ? 0 : 2)
  )
}
