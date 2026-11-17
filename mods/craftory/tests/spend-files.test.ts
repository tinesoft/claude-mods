import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import type { SpendRow } from '../types'
import { building, fakeGit, start, step } from './build-harness'
import { featureWorld, startSession, turnComplete } from './harness'

const TOKENS = {
  input_tokens: 100,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1_000,
}

const OWN = '.craftory/spend/csv/s1.json'

const mainStep = async ($: Engine, index: number) => {
  const stream = $.turn.step({ turnId: 'm', index, model: 'opus', messageCount: 1 } as never)
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await iterator.next()).done) {
    // drained: the step's result is what counts
  }
}

/** A git that knows who the developer is, for the `user` field. */
const withEmail = (email: string) => {
  const git = fakeGit()
  return {
    shell: (argv: readonly string[], cwd: string | undefined) =>
      argv[0] === 'git' && argv[1] === 'config' && argv[2] === 'user.email'
        ? { exitCode: 0, stdout: `${email}\n` }
        : git.shell(argv, cwd),
  }
}

const row = (usd: number | null, over: Partial<SpendRow> = {}): SpendRow => ({
  feature: 'spec:csv' as SpendRow['feature'],
  phase: 'align',
  ticket: null,
  agentId: null,
  model: 'claude-opus-5-5',
  tokens: { input: 1_000, output: 0, cacheRead: 0, cacheWrite: 0 },
  usd,
  isEstimated: false,
  steps: 1,
  ...over,
})

const fileOf = (session: string, rows: SpendRow[], user?: string) =>
  serialiseSpendFile({
    version: 1,
    session,
    ...(user !== undefined && { user }),
    startedAt: '2026-11-16T09:00:00.000Z',
    rows,
  })

const writesTo = (w: { writes: { path: string; text: string }[] }, path: string) =>
  w.writes.filter(x => x.path === path)

test('a main turn ending writes this session’s spend to its own file, with who ran it', async ($, on) => {
  let usd = 0
  const w = featureWorld(on, {
    cost: () => usd,
    usage: () => TOKENS,
    ...withEmail('dev@example.com'),
  })
  await startSession($)
  usd = 0.42
  await mainStep($, 0)
  await turnComplete($)
  const [written] = writesTo(w, OWN)
  const file = JSON.parse(written!.text)
  expect(file).toMatchObject({ version: 1, session: 's1', user: 'dev@example.com' })
  expect(file.rows).toHaveLength(1)
  expect(file.rows[0]).toMatchObject({ phase: 'between', usd: 0.42, steps: 1 })
  expect(w.writes.filter(x => x.path.startsWith('.craftory/spend/'))).toHaveLength(1)
})

test('with no git email the file leaves user out', async ($, on) => {
  let usd = 0
  const w = featureWorld(on, { cost: () => usd, usage: () => TOKENS })
  await startSession($)
  usd = 0.1
  await mainStep($, 0)
  await turnComplete($)
  expect(JSON.parse(writesTo(w, OWN)[0]!.text).user).toBeUndefined()
})

test('a turn with nothing new does not write the file again', async ($, on) => {
  let usd = 0
  const w = featureWorld(on, { cost: () => usd, usage: () => TOKENS })
  await startSession($)
  usd = 0.1
  await mainStep($, 0)
  await turnComplete($)
  await turnComplete($)
  expect(writesTo(w, OWN)).toHaveLength(1)
})

test('other sessions’ files are summed into the total and never written', async ($, on) => {
  let usd = 0
  const theirs = fileOf('s0', [row(3), row(0.5, { phase: 'spec' })], 'mate@example.com')
  const w = featureWorld(on, {
    cost: () => usd,
    usage: () => TOKENS,
    files: { '.craftory/spend/csv/s0.json': theirs },
  })
  await startSession($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $3.50 · /craftory')
  usd = 1
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $4.50 · /craftory')
  await turnComplete($)
  expect(writesTo(w, '.craftory/spend/csv/s0.json')).toEqual([])
  expect(w.files.get('.craftory/spend/csv/s0.json')).toBe(theirs)
  expect(writesTo(w, OWN)).toHaveLength(1)
})

test('another Feature’s files do not count towards this one', async ($, on) => {
  const w = featureWorld(on, {
    cost: () => 0,
    files: { '.craftory/spend/other/s0.json': fileOf('s0', [row(9)]) },
  })
  await startSession($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · /craftory')
})

test('a file that cannot be read is skipped; the rest still count', async ($, on) => {
  const w = featureWorld(on, {
    cost: () => 0,
    files: {
      '.craftory/spend/csv/s0.json': fileOf('s0', [row(2)]),
      '.craftory/spend/csv/bad.json': '{ not json',
    },
  })
  await startSession($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $2.00 · /craftory')
})

test('a file a teammate pushed mid-session counts after the next tracker refresh', async ($, on) => {
  const w = featureWorld(on, { cost: () => 0 })
  await startSession($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · /craftory')
  w.files.set('.craftory/spend/csv/s9.json', fileOf('s9', [row(1.25)]))
  await turnComplete($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $1.25 · /craftory')
})

test('a resumed session takes back its own file and adds to it, charging nothing twice', async ($, on) => {
  let usd = 2
  const w = featureWorld(on, {
    cost: () => usd,
    usage: () => TOKENS,
    files: { [OWN]: fileOf('s1', [row(2, { phase: 'between', model: 'sonnet' })]) },
  })
  await startSession($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $2.00 · /craftory')
  usd = 2.5
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $2.50 · /craftory')
  await turnComplete($)
  const rows = JSON.parse(writesTo(w, OWN).at(-1)!.text).rows
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ usd: 2.5, steps: 2 })
})

test('a write that fails is made again at the next flush', async ($, on) => {
  let usd = 0
  let isReadOnly = true
  const w = featureWorld(on, {
    cost: () => usd,
    usage: () => TOKENS,
    failWrite: path => isReadOnly && path.startsWith('.craftory/spend/'),
  })
  await startSession($)
  usd = 0.2
  await mainStep($, 0)
  await turnComplete($)
  expect(writesTo(w, OWN)).toEqual([])
  isReadOnly = false
  await turnComplete($)
  expect(JSON.parse(writesTo(w, OWN)[0]!.text).rows[0].usd).toBe(0.2)
})

test('while agents step, their spend is written within 30 seconds, once', async ($, on) => {
  let usd = 0
  const { w } = await building(on, $, { cost: () => usd, usage: () => TOKENS })
  await start($, 43, 'Export button')
  usd = 0.3
  await step($, 'agent-tu43', 0)
  usd = 0.6
  await step($, 'agent-tu43', 1)
  await w.clock.advance(29_000)
  expect(writesTo(w, OWN)).toEqual([])
  await w.clock.advance(1_500)
  const rows = JSON.parse(writesTo(w, OWN)[0]!.text).rows
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ phase: 'build', ticket: 'csv/01', steps: 2 })
  expect(writesTo(w, OWN)).toHaveLength(1)
})

test('the session ending writes its spend one last time', async ($, on) => {
  let usd = 0
  const w = featureWorld(on, { cost: () => usd, usage: () => TOKENS })
  await startSession($)
  usd = 0.7
  await mainStep($, 0)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1' } as never)
  expect(JSON.parse(writesTo(w, OWN)[0]!.text).rows[0].usd).toBe(0.7)
})

test('after a /clear, spend goes to a new file under the new session id', async ($, on) => {
  let usd = 0
  let session = 's1'
  const w = featureWorld(on, { cost: () => usd, usage: () => TOKENS, session: () => session })
  await startSession($)
  usd = 0.7
  await mainStep($, 0)
  session = 's2'
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  usd = 0
  await mainStep($, 0)
  usd = 0.2
  await mainStep($, 1)
  await turnComplete($)
  expect(JSON.parse(writesTo(w, OWN)[0]!.text).rows[0].usd).toBe(0.7)
  const fresh = JSON.parse(writesTo(w, '.craftory/spend/csv/s2.json')[0]!.text)
  expect(fresh.session).toBe('s2')
  expect(fresh.rows[0]).toMatchObject({ usd: 0.2, steps: 2 })
})
