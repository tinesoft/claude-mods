import type { Engine } from 'claude-code/testing'
import { featureWorld, skillPrompt, startSession, ticketFile, type WorldOptions } from './harness'

type Shell = NonNullable<WorldOptions['shell']>

export const fakeGit = (
  over: {
    behind?: (branch: string) => number
    status?: (path: string) => string
    extra?: { path: string; branch: string }[]
    committed?: Record<string, number>
    stat?: string
    missing?: string[]
  } = {},
) => {
  const exists = new Set(
    ['main', 'feat/csv', 'feat/other', ...(over.extra ?? []).map(e => e.branch)].filter(
      b => !over.missing?.includes(b),
    ),
  )
  const created: string[][] = []
  const worktrees = ['/repo', ...(over.extra ?? []).map(e => e.path)]
  const branches: Record<string, string> = {
    '/repo': 'main',
    ...Object.fromEntries((over.extra ?? []).map(e => [e.path, e.branch])),
  }
  const shell: Shell = argv => {
    const [a, b, c] = argv
    if (['defaults', 'gsettings', 'reg'].includes(a!)) return undefined
    if (argv[0] !== 'git') return { exitCode: 0 }
    if (b === 'worktree' && c === 'list')
      return {
        exitCode: 0,
        stdout: worktrees
          .map(p => `worktree ${p}\nHEAD abc\nbranch refs/heads/${branches[p]}\n`)
          .join('\n'),
      }
    if (b === 'rev-parse')
      return exists.has(argv.at(-1)!) ? { exitCode: 0, stdout: 'tip1\n' } : { exitCode: 1 }
    if (b === 'branch' && argv[2] === '--') {
      created.push([...argv])
      if (argv[4] !== 'HEAD' && !exists.has(argv[4]!))
        return { exitCode: 128, stderr: 'fatal: not a valid object name' }
      exists.add(argv[3]!)
      return { exitCode: 0 }
    }
    if (b === 'worktree' && c === 'add' && argv[3] === '-b') {
      if (!exists.has(argv[7]!))
        return { exitCode: 128, stderr: `fatal: invalid reference: ${argv[7]}` }
      exists.add(argv[4]!)
      worktrees.push(`/repo/${argv[6]}`)
      branches[`/repo/${argv[6]}`] = argv[4]!
      return { exitCode: 0 }
    }
    if (b === 'worktree' && c === 'remove') {
      const at = worktrees.findIndex(p => p.endsWith(argv.at(-1)!))
      if (at > 0) worktrees.splice(at, 1)
      return { exitCode: 0 }
    }
    if (b === 'rev-list')
      return { exitCode: 0, stdout: `${over.behind?.(argv[4]!.split('...')[1]!) ?? 0}\t1\n` }
    if (b === 'log') return { exitCode: 0, stdout: `${over.committed?.[argv.at(-1)!] ?? 0}\n` }
    if (b === 'diff') return { exitCode: 0, stdout: over.stat ?? '' }
    if (b === '-C') return { exitCode: 0, stdout: over.status?.(argv[2]!) ?? '' }
    if (a === 'git' && b === 'branch') return { exitCode: 0, stdout: 'main\n' }
    return { exitCode: 0, stdout: '' }
  }
  return { shell, worktrees, exists, created }
}

export const READY = {
  '.scratch/csv/issues/02-ledger.md': ticketFile(2, 'Ledger tax'),
  '.scratch/csv/issues/03-filter.md': ticketFile(3, 'Date filter'),
  '.scratch/csv/issues/04-email.md': ticketFile(4, 'Email the CSV'),
}

export const building = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  options: WorldOptions = {},
) => {
  const git = fakeGit()
  const w = featureWorld(on, {
    shell: git.shell,
    ...options,
    files: { ...READY, ...options.files },
  })
  await startSession($)
  await skillPrompt($, 'implement-spec')
  return { w, git }
}

/** An Agent call for ticket `n` of the old numbering (43 is `csv/01`, 44 is `csv/02`). */
export const agentCall = (n: number, title: string, extra: Record<string, unknown> = {}) => {
  const ref = `csv/${String(n - 42).padStart(2, '0')}`
  return {
    tool: 'Agent',
    tool_use_id: `tu${n}`,
    description: `Implement ${ref} ${title}`,
    prompt: `Build ticket ${ref} with tdd.`,
    isolation: 'worktree',
    ...extra,
  }
}

export const call = ($: Engine, input: Record<string, unknown>) => $.tool.call(input as never)

export const start = async ($: Engine, n: number, title: string) => {
  const called = await call($, agentCall(n, title))
  return called.deny === undefined ? spawn($, n) : called
}

export const spawn = ($: Engine, n: number) =>
  $.agent.spawn({
    tool_use_id: `tu${n}`,
    prompt: 'p',
    description: `Implement #${n}`,
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: true,
    fork: false,
  } as never)

export const step = async ($: Engine, agentId: string, index: number) => {
  const stream = $.turn.step({
    turnId: 't',
    index,
    model: 'sonnet',
    messageCount: 1,
    agentId,
  } as never)
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const chunks: unknown[] = []
  for (;;) {
    const next = await (iterator as AsyncIterator<unknown, unknown>).next()
    if (next.done) return { chunks, result: next.value as { answer: string; usage: unknown } }
    chunks.push(next.value)
  }
}

export const TICKETS = [
  [43, 'Export button'],
  [44, 'Ledger tax'],
  [45, 'Date filter'],
  [46, 'Email the CSV'],
] as const

export const OVER = {
  input_tokens: 1_000,
  output_tokens: 79_000,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 500_000,
}
export const SMALL = {
  input_tokens: 100,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 900_000,
}
