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
  /** A command Craftory runs re-enters its own `prompt.submit`, as `$.command.run` does on 2.1.302. */
  reenter?: boolean
  /** From its `onRead`th read on, `path` reads as `text`: someone else edited it meanwhile. */
  racy?: { path: string; onRead: number; text: string }
}

/** The world beneath Craftory: a repo in memory, the commands it ran, and what it drew. */
export const world = (on: On, options: WorldOptions = {}) => {
  const files = new Map(Object.entries(options.files ?? {}))
  /** A relative path reaches the hooks resolved against the session's folder, which is the plugin's here. */
  const rel = (path: string) => path.replace(/^\/.*?\/craftory\//, '')
  const dirs = (path: string) => rel(path).replace(/\/$/, '')
  const clock = mock.clock(on, { now: 1_000_000 })
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
  const reentered: unknown[] = []
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
  on('tool.call', () => ({ result: 'ran' }))
  on('skill.prompt', (_$, e) => ({ text: `body of ${e.skill}` }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('command.run', async ($, e) => {
    commandsRun.push({ command: e.command, args: e.args })
    if (options.reenter) {
      reentered.push(await $.prompt.submit({ text: `/${e.command} ${e.args}`.trim() }))
    }
    return { text: 'ran' }
  })
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
    const names = [...files.keys()]
      .filter(f => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes('/'))
      .map(f => f.slice(dir.length + 1))
    return names.length === 0
      ? { deny: `${e.path}: no such directory` }
      : {
          value: names.map(name => ({
            name,
            kind: 'file' as const,
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
    reentered,
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
) => {
  if (!(BAND_SURFACES as readonly string[]).includes(surface))
    throw new Error(`the engine never raises AbovePrompt on ${surface}`)
  return $.ui.mount({
    plugin: 'craftory',
    surface,
    component: 'AbovePrompt',
    props: bandProps(columns),
  })
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

export type Finder = { findAll: (q: ElementQuery) => Promise<FoundElement[]> }

export const texts = async (drawing: Finder) =>
  (await drawing.findAll({ type: 'Text' })).map(t => t.text)

/** All the text a drawing shows, joined, for "does it say this" checks. */
export const allText = async (drawing: Finder) => (await texts(drawing)).join(' ')
