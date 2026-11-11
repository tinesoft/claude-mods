import type { CommandInfo, On, RenderSurface } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'

export const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

/** The engine raises `AbovePrompt` on these surfaces only. */
export const BAND_SURFACES = ['terminal', 'desktop'] as const
export type BandSurface = (typeof BAND_SURFACES)[number]

export const MATT = 'mattpocock-skills'

export const mattCommands = (...skills: string[]): CommandInfo[] =>
  skills.map(skill => ({
    name: `${MATT}:${skill}`,
    description: skill,
    source: 'plugin',
    plugin: MATT,
  }))

export type WorldOptions = {
  files?: Record<string, string>
  commands?: CommandInfo[]
  remote?: string
  plugins?: unknown[]
  install?: { exitCode: number; stderr: string }
  theme?: string
  surfaces?: readonly RenderSurface[]
  version?: string
  store?: Record<string, unknown>
  gh?: (argv: readonly string[]) => { exitCode: number; stdout: string } | undefined
  now?: number
  shell?: (
    argv: readonly string[],
    cwd: string | undefined,
  ) => { exitCode: number; stdout?: string; stderr?: string } | { deny: string } | undefined
  ask?: (question: string) => string | undefined
  spawn?: (e: { tool_use_id: string; cwd?: string }) => { agentId: string } | { deny: string }
  usage?: (e: { agentId?: string; index: number }) => {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
  answer?: (e: { agentId?: string; index: number }) => string
  /** The main session's context window, as `$.session.usage()` reports it. */
  window?: number
  racy?: { path: string; onRead: number; text: string }
  /** Commands that answer only after this many milliseconds on the mock clock. */
  stall?: { when: (argv: readonly string[]) => boolean; ms: number | (() => number) }
}

let clockInUse: ReturnType<typeof mock.clock> | undefined

/** The hooks start tracker and git reads on a timer, so a test lets them run before it looks. */
const LET_REFRESH_RUN_MS = 1_500

export const world = (on: On, options: WorldOptions = {}) => {
  const files = new Map(Object.entries(options.files ?? {}))
  /** When a file last changed, by path; 1 for any file not listed. */
  const mtimes = new Map<string, number>()
  /** A relative path reaches the hooks resolved against the session's folder, which is the plugin's here. */
  const rel = (path: string) => path.replace(/^\/repo\//, '').replace(/^\/.*?\/craftory\//, '')
  const dirs = (path: string) => rel(path).replace(/\/$/, '')
  const clock = mock.clock(on, { now: options.now ?? 1_000_000 })
  clockInUse = clock
  const store = new Map(Object.entries(options.store ?? {}))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => (store.set(e.key, e.value), { value: undefined }))
  const ran: string[][] = []
  const writes: { path: string; text: string }[] = []
  const opens: { id: string; title?: string }[] = []
  const closes: { id: string }[] = []
  const toasts: string[] = []
  const toastTimeouts: (number | undefined)[] = []
  const statuses: (string | undefined)[] = []
  const commandsRun: { command: string; args: string }[] = []
  const ranIn: { argv: string[]; cwd: string | undefined }[] = []
  const calls: Record<string, unknown>[] = []
  const spawns: Record<string, unknown>[] = []
  const steps: { agentId?: string; index: number }[] = []
  const sent: { to: unknown; text: string }[] = []
  const submitted: { text: string; context?: readonly string[] }[] = []
  const copied: { text: string; surface?: string }[] = []
  const registered: { name: string; immediate?: boolean }[] = []
  let commands = options.commands ?? []

  on('session.surfaces', () => ({ value: options.surfaces ?? ['terminal'] }))
  on('session.version', () => {
    const version = options.version ?? '2.1.302'
    return { value: { version, base: version, builtAt: '2026-10-01T00:00:00.000Z' } }
  })
  on('config.list', () => ({
    value: [
      {
        key: 'theme',
        label: 'Theme',
        kind: 'choice',
        value: options.theme ?? 'dark',
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  }))
  on('env.get', () => ({ value: undefined }))
  on('command.register', (_$, e) => (registered.push(e), { value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.list', () => ({ value: commands }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  const panes = new Set<string>()
  on('ui.open', (_$, e) => (opens.push(e), panes.add(e.id), { value: { isPlaced: true } }))
  on('ui.close', (_$, e) => (closes.push(e), panes.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...panes].map(id => ({
      id,
      title: id,
      isShown: true,
      isFocused: true,
      isPlaced: true,
      plugin: 'craftory',
      element: 'Pane',
    })),
  }))
  on('ui.invalidate', () => ({ value: undefined }))
  on(
    'ui.toast',
    (_$, e) => (toasts.push(e.text), toastTimeouts.push(e.timeoutMs), { value: undefined }),
  )
  on('ui.status', (_$, e) => (statuses.push(e.text), { value: undefined }))
  on('tool.call', (_$, e) => {
    calls.push({ ...e })
    if (e.tool === 'AskUserQuestion') {
      const question = (e as unknown as { questions: { question: string }[] }).questions[0]!
        .question
      const label = options.ask?.(question)
      return label === undefined
        ? { deny: 'no one to ask' }
        : { result: { questions: [], answers: { [question]: label } } as never }
    }
    return { result: 'ran' }
  })
  on(
    'ui.copy',
    (_$, e) => (
      copied.push({ text: e.text, ...(e.surface && { surface: e.surface }) }),
      { value: { isCopied: true as const } }
    ),
  )
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: options.window ?? 200_000 }, rateLimits: [] },
  }))
  on(
    'session.send',
    (_$, e) => (sent.push({ to: e.to, text: e.text }), { isDelivered: true as const }),
  )
  on('agent.spawn', (_$, e) => {
    spawns.push({ ...e })
    const answer = options.spawn?.(e) ?? { agentId: `agent-${e.tool_use_id}` }
    return 'deny' in answer ? answer : { model: 'sonnet', agentId: answer.agentId }
  })
  on('turn.step', async function* (_$, e) {
    yield* []
    steps.push({ ...(e.agentId && { agentId: e.agentId }), index: e.index })
    const usage = options.usage?.(e) ?? null
    return {
      turnId: e.turnId,
      index: e.index,
      answer: options.answer?.(e) ?? '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: usage && { ...usage, model: 'sonnet' },
    } as never
  })
  on('skill.prompt', (_$, e) => ({ text: `body of ${e.skill}` }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => {
    submitted.push({ text: e.text, ...(e.context && { context: e.context }) })
    return { text: e.text, ...(e.context && { context: e.context }) }
  })
  on(
    'command.run',
    (_$, e) => (commandsRun.push({ command: e.command, args: e.args }), { text: 'ran' }),
  )
  let reads = 0
  on('fs.read', (_$, e) => {
    const path = rel(e.path)
    if (path === options.racy?.path && ++reads >= options.racy.onRead) {
      return { value: options.racy.text }
    }
    return files.has(path) ? { value: files.get(path)! } : { deny: `${path}: no such file` }
  })
  on('fs.exists', (_$, e) => ({
    value: files.has(rel(e.path)) || [...files.keys()].some(f => f.startsWith(`${dirs(e.path)}/`)),
  }))
  on('fs.list', (_$, e) => {
    const dir = dirs(e.path)
    const below = [...files.keys()]
      .filter(f => f.startsWith(`${dir}/`))
      .map(f => f.slice(dir.length + 1))
    const names = [...new Set(below.map(f => f.split('/')[0]!))]
    return names.length === 0
      ? { deny: `${e.path}: no such directory` }
      : {
          value: names.map(name => ({
            name,
            kind: below.some(f => f.startsWith(`${name}/`)) ? ('dir' as const) : ('file' as const),
            size: 0,
            mtimeMs: mtimes.get(`${dir}/${name}`) ?? 1,
            isLink: false,
          })),
        }
  })
  on('fs.write', (_$, e) => {
    writes.push({ path: rel(e.path), text: e.text })
    files.set(rel(e.path), e.text)
    return { value: undefined }
  })
  on('process.run', async (_$, e) => {
    ran.push([...e.argv])
    ranIn.push({ argv: [...e.argv], cwd: e.init?.cwd })
    if (options.stall?.when(e.argv)) {
      // As the engine does: a child still running at its timeout is killed and the call rejects,
      // saying so (`<plugin>: $.process.run(<argv0>) aborted: still running after <ms>ms`)
      const limit = e.init?.timeoutMs ?? 30_000
      const ms = typeof options.stall.ms === 'number' ? options.stall.ms : options.stall.ms()
      if (ms > limit) {
        await clock.sleep(limit)
        return {
          deny: `craftory: $.process.run(${e.argv[0]}) aborted: still running after ${limit}ms`,
        }
      }
      await clock.sleep(ms)
    }
    const done = (exitCode: number, stdout = '', stderr = '') => ({
      value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
    })
    const [a, b, c] = e.argv
    if (a === 'git' && b === 'rev-parse' && c === '--show-toplevel') return done(0, '/repo\n')
    if (a === 'git' && b === 'remote') {
      return options.remote === undefined
        ? done(2, '', 'no remote')
        : done(0, `${options.remote}\n`)
    }
    if (a === 'claude' && b === 'plugin' && c === 'list')
      return done(0, JSON.stringify(options.plugins ?? []))
    if (a === 'claude' && b === 'plugin' && c === 'install') {
      const outcome = options.install ?? { exitCode: 0, stderr: '' }
      return done(outcome.exitCode, '', outcome.stderr)
    }
    const shelled = a === 'claude' || a === 'gh' ? undefined : options.shell?.(e.argv, e.init?.cwd)
    if (shelled && 'deny' in shelled) return shelled
    if (shelled) return done(shelled.exitCode, shelled.stdout ?? '', shelled.stderr ?? '')
    if (a === 'gh') {
      const answer = options.gh?.(e.argv)
      if (answer) return done(answer.exitCode, answer.stdout)
    }
    return { deny: `${a}: not found` }
  })

  return {
    clock,
    files,
    mtimes,
    ran,
    writes,
    opens,
    closes,
    panes,
    toasts,
    toastTimeouts,
    statuses,
    commandsRun,
    ranIn,
    calls,
    spawns,
    steps,
    sent,
    submitted,
    copied,
    registered,
    store,
    setCommands: (next: CommandInfo[]) => {
      commands = next
    },
    installs: () => ran.filter(argv => argv[1] === 'plugin' && argv[2] !== 'list'),
  }
}

export type World = ReturnType<typeof world>

export const startSession = async ($: Engine, surface: RenderSurface = 'terminal') => {
  const started = await $.session.start({ cwd: '/repo', surface } as never)
  await clockInUse?.settle()
  return started
}

export const bandProps = (bodyColumns: number, maxRows = 24) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
})

export const mountBand = async <S extends BandSurface = 'terminal'>(
  $: Engine,
  surface: S = 'terminal' as S,
  columns = 100,
  maxRows = 24,
) => {
  if (!(BAND_SURFACES as readonly string[]).includes(surface))
    throw new Error(`the engine never raises AbovePrompt on ${surface}`)
  return $.ui.mount({
    plugin: 'craftory',
    surface,
    component: 'AbovePrompt',
    props: bandProps(columns, maxRows),
  })
}

export const mountPane = <S extends RenderSurface = 'terminal'>(
  $: Engine,
  surface: S = 'terminal' as S,
) =>
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

export type Finder = { findAll: (q: ElementQuery) => Promise<FoundElement[]> }

export const texts = async (drawing: Finder) =>
  (await drawing.findAll({ type: 'Text' })).map(t => t.text)

export const allText = async (drawing: Finder) => (await texts(drawing)).join(' ')

export const IN_RANGE = [
  { id: 'mattpocock-skills@claude-plugins-official', version: '1.3.1', enabled: true },
]

export const SETUP_FILES = {
  'docs/agents/issue-tracker.md': '# Issue tracker: Local Markdown\n',
  'docs/agents/domain.md': '# Domain Docs\n',
  'CLAUDE.md': '# Rules\n',
}

export const MATT_SKILLS = [
  'grill-with-docs',
  'to-spec',
  'to-tickets',
  'implement-spec',
  'code-review',
  'triage',
  'diagnosing-bugs',
]

const AT = '2026-10-24T10:00:00Z'

export const featureJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    spec: 'csv',
    title: 'Export invoices as CSV',
    entry: 'align',
    integrationBranch: 'feat/csv',
    marks: { align: { ranAt: AT }, spec: { ranAt: AT } },
    agents: {},
    ...over,
  })

export const specFile =
  '# Export invoices as CSV\n\nStatus: ready-for-agent\n\n## Problem Statement\nx\n\n## User Stories\n1. As an accountant, I want a CSV\n'

/** A ticket of the `csv` feature, `Blocked by` naming tickets of the same feature by number. */
export const ticketFile = (n: number, title: string, blockedBy: number[] = []) =>
  `# ${String(n).padStart(2, '0')}: ${title}\n\nStatus: ready-for-agent\n${
    blockedBy.length > 0
      ? `Blocked by: ${blockedBy.map(b => String(b).padStart(2, '0')).join(', ')}\n`
      : ''
  }`

export const featureRepo = (tickets = true, feature = featureJson()): Record<string, string> => ({
  ...SETUP_FILES,
  '.craftory/features/csv.json': feature,
  '.scratch/csv/spec.md': specFile,
  ...(tickets && {
    '.scratch/csv/issues/01-button.md': ticketFile(1, 'Export button'),
    '.scratch/csv/issues/02-ledger.md': ticketFile(2, 'Ledger tax', [1]),
    '.scratch/csv/issues/03-filter.md': ticketFile(3, 'Date filter', [1]),
  }),
})

export const featureWorld = (on: On, options: WorldOptions = {}) =>
  world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    ...options,
    files: { ...featureRepo(), ...options.files },
  })

export const skillPrompt = ($: Engine, skill: string) =>
  $.skill.prompt({
    skill: `${MATT}:${skill}`,
    text: '',
    frontmatter: {},
    source: 'plugin',
  } as never)

export const turnComplete = async ($: Engine, extra: Record<string, unknown> = {}) => {
  const done = await $.turn.complete({
    answer: 'ok',
    durationMs: 1,
    isAborted: false,
    turnId: 't',
    reason: 'answer',
    ...extra,
  } as never)
  await clockInUse?.advance(LET_REFRESH_RUN_MS)
  return done
}

export const submit = ($: Engine, text: string) => $.prompt.submit({ text } as never)

export const mountReply = <S extends RenderSurface>($: Engine, surface: S, text: string) =>
  $.ui.mount({
    plugin: 'craftory',
    surface,
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
  })
