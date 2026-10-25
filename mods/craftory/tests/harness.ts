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
  /** Repo files by relative path; `fs.write` adds to it. */
  files?: Record<string, string>
  /** Commands `$.command.list()` reports. */
  commands?: CommandInfo[]
  /** The stdout of `git remote get-url origin`; absent means no remote. */
  remote?: string
  /** `claude plugin list --json` rows. */
  plugins?: unknown[]
  /** The exit code and stderr of `claude plugin install`. */
  install?: { exitCode: number; stderr: string }
  theme?: string
  surfaces?: readonly RenderSurface[]
  version?: string
  store?: Record<string, unknown>
  /** What `gh` prints, by argv; absent means `gh` is not installed. */
  gh?: (argv: readonly string[]) => { exitCode: number; stdout: string } | undefined
  /** The mock clock's start, in milliseconds. */
  now?: number
  /** What git, cp and the setup command answer, by argv and cwd; absent means "not found". */
  shell?: (
    argv: readonly string[],
    cwd: string | undefined,
  ) => { exitCode: number; stdout?: string; stderr?: string } | undefined
  /** The label `$.ui.ask` resolves to for a question; absent or undefined rejects, as in `-p`. */
  ask?: (question: string) => string | undefined
  /** What the engine answers an `agent.spawn` that reaches it. */
  spawn?: (e: { tool_use_id: string; cwd?: string }) => { agentId: string } | { deny: string }
  /** The usage a subagent's `turn.step` reports when it reaches the engine. */
  usage?: (e: { agentId?: string; index: number }) => {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
  /** The visible text of a subagent's step; absent means none. */
  answer?: (e: { agentId?: string; index: number }) => string
  /** From its `onRead`th read on, `path` reads as `text`: someone else edited it meanwhile. */
  racy?: { path: string; onRead: number; text: string }
}

/** The world beneath Craftory: a repo in memory, the commands it ran, and what it drew. */
export const world = (on: On, options: WorldOptions = {}) => {
  const files = new Map(Object.entries(options.files ?? {}))
  /** A relative path reaches the hooks resolved against the session's folder, which is the plugin's here. */
  const rel = (path: string) => path.replace(/^\/.*?\/craftory\//, '')
  const dirs = (path: string) => rel(path).replace(/\/$/, '')
  const clock = mock.clock(on, { now: options.now ?? 1_000_000 })
  const store = new Map(Object.entries(options.store ?? {}))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => (store.set(e.key, e.value), { value: undefined }))
  const ran: string[][] = []
  const writes: { path: string; text: string }[] = []
  const opens: { id: string; title?: string }[] = []
  const toasts: string[] = []
  const toastTimeouts: (number | undefined)[] = []
  const statuses: (string | undefined)[] = []
  const commandsRun: { command: string; args: string }[] = []
  const ranIn: { argv: string[]; cwd: string | undefined }[] = []
  const calls: Record<string, unknown>[] = []
  const spawns: Record<string, unknown>[] = []
  const steps: { agentId?: string; index: number }[] = []
  const sent: { to: unknown; text: string }[] = []
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
  on('ui.open', (_$, e) => (opens.push(e), { value: { isPlaced: true } }))
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
  on('prompt.submit', (_$, e) => ({ text: e.text }))
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
            mtimeMs: 1,
            isLink: false,
          })),
        }
  })
  on('fs.write', (_$, e) => {
    writes.push({ path: rel(e.path), text: e.text })
    files.set(rel(e.path), e.text)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    ranIn.push({ argv: [...e.argv], cwd: e.init?.cwd })
    const done = (exitCode: number, stdout = '', stderr = '') => ({
      value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
    })
    const [a, b, c] = e.argv
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
    ran,
    writes,
    opens,
    toasts,
    toastTimeouts,
    statuses,
    commandsRun,
    ranIn,
    calls,
    spawns,
    steps,
    sent,
    copied,
    registered,
    store,
    setCommands: (next: CommandInfo[]) => {
      commands = next
    },
    /** Argv of the commands that changed the machine rather than read it. */
    installs: () => ran.filter(argv => argv[1] === 'plugin' && argv[2] !== 'list'),
  }
}

export type World = ReturnType<typeof world>

export const startSession = ($: Engine, surface: RenderSurface = 'terminal') =>
  $.session.start({ cwd: '/repo', surface } as never)

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

/** All the text a drawing shows, joined, for "does it say this" checks. */
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
    spec: '#42',
    title: 'Export invoices as CSV',
    entry: 'align',
    integrationBranch: 'feat/csv',
    marks: { align: { ranAt: AT }, spec: { ranAt: AT } },
    agents: {},
    ...over,
  })

export const specFile = '---\ntype: spec\nstatus: ready-for-agent\n---\n# Export invoices as CSV\n'

export const ticketFile = (title: string, blockedBy: number[] = []) =>
  `---\ntype: ticket\nstatus: ready-for-agent\nparent: 42\n${
    blockedBy.length > 0 ? `blocked-by: [${blockedBy.join(', ')}]\n` : ''
  }---\n# ${title}\n`

/** A repo with Craftory set up and one feature with its spec; `tickets` adds three more. */
export const featureRepo = (tickets = true, feature = featureJson()): Record<string, string> => ({
  ...SETUP_FILES,
  '.craftory/features/42.json': feature,
  'docs/issues/42-export-invoices.md': specFile,
  ...(tickets && {
    'docs/issues/43-button.md': ticketFile('Export button'),
    'docs/issues/44-ledger.md': ticketFile('Ledger tax', [43]),
    'docs/issues/45-filter.md': ticketFile('Date filter', [43]),
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

export const turnComplete = ($: Engine, extra: Record<string, unknown> = {}) =>
  $.turn.complete({
    answer: 'ok',
    durationMs: 1,
    isAborted: false,
    turnId: 't',
    reason: 'answer',
    ...extra,
  } as never)

export const submit = ($: Engine, text: string) => $.prompt.submit({ text } as never)

export const mountReply = <S extends RenderSurface>($: Engine, surface: S, text: string) =>
  $.ui.mount({
    plugin: 'craftory',
    surface,
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
  })
