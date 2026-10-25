import type { Engine } from 'claude-code/testing'
import { featureWorld, skillPrompt, startSession, ticketFile, type WorldOptions } from './harness'

type Shell = NonNullable<WorldOptions['shell']>

/** A repo that answers git the way the seat needs: worktrees appear when `worktree add` runs. */
export const fakeGit = (
  over: { behind?: (branch: string) => number; status?: (path: string) => string } = {},
) => {
  const worktrees = ['/repo']
  const branches: Record<string, string> = { '/repo': 'main' }
  const shell: Shell = argv => {
    const [a, b, c] = argv
    if (argv[0] !== 'git') return { exitCode: 0 }
    if (b === 'worktree' && c === 'list')
      return {
        exitCode: 0,
        stdout: worktrees
          .map(p => `worktree ${p}\nHEAD abc\nbranch refs/heads/${branches[p]}\n`)
          .join('\n'),
      }
    if (b === 'rev-parse')
      return argv[4]?.startsWith('feat/') ? { exitCode: 0, stdout: 'tip1\n' } : { exitCode: 1 }
    if (b === 'worktree' && c === 'add' && argv[3] === '-b') {
      worktrees.push(`/repo/${argv[5]}`)
      branches[`/repo/${argv[5]}`] = argv[4]!
      return { exitCode: 0 }
    }
    if (b === 'worktree' && c === 'remove') {
      const at = worktrees.findIndex(p => p.endsWith(argv.at(-1)!))
      if (at > 0) worktrees.splice(at, 1)
      return { exitCode: 0 }
    }
    if (b === 'rev-list')
      return { exitCode: 0, stdout: `${over.behind?.(argv[4]!.split('...')[1]!) ?? 0}\t1\n` }
    if (b === '-C') return { exitCode: 0, stdout: over.status?.(argv[2]!) ?? '' }
    if (a === 'git' && b === 'branch') return { exitCode: 0, stdout: 'main\n' }
    return { exitCode: 0, stdout: '' }
  }
  return { shell, worktrees }
}

export const READY = {
  'docs/issues/44-ledger.md': ticketFile('Ledger tax'),
  'docs/issues/45-filter.md': ticketFile('Date filter'),
  'docs/issues/46-email.md': ticketFile('Email the CSV'),
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

export const agentCall = (n: number, title: string, extra: Record<string, unknown> = {}) => ({
  tool: 'Agent',
  tool_use_id: `tu${n}`,
  description: `Implement #${n} ${title}`,
  prompt: `Build ticket #${n} with tdd.`,
  isolation: 'worktree',
  ...extra,
})

export const call = ($: Engine, input: Record<string, unknown>) => $.tool.call(input as never)

/** An Agent call as the engine runs it: the tool.call first, then the spawn it made. */
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

/** Drives one subagent step through the plugin and returns what it answered and streamed. */
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
