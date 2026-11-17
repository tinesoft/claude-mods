import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import type { LocalSpend, SpendRow } from '../types'
import {
  IN_RANGE,
  MATT_SKILLS,
  mattCommands,
  SETUP_FILES,
  skillPrompt,
  startSession,
  turnComplete,
  world,
  type WorldOptions,
} from './harness'

const TOKENS = {
  input_tokens: 100,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1_000,
}

const SPEC =
  '# Export invoices as CSV\n\nStatus: ready-for-agent\n\n## Problem Statement\n\nx\n\n## User Stories\n\n1. As an accountant, I want a CSV, so that I can import it\n'

const FILE = '.craftory/spend/export/s1.json'

/** A set-up repo with no Feature in flight, so the first phase command starts a draft. */
const bare = (on: Parameters<typeof world>[0], options: WorldOptions = {}) =>
  world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    usage: () => TOKENS,
    ...options,
    files: { ...SETUP_FILES, ...options.files },
  })

const mainStep = async ($: Engine, index: number) => {
  const stream = $.turn.step({ turnId: 'm', index, model: 'opus', messageCount: 1 } as never)
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await iterator.next()).done) {
    // drained: the step's result is what counts
  }
}

const row = (usd: number, over: Partial<SpendRow> = {}): SpendRow => ({
  feature: 'draft:d1' as SpendRow['feature'],
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

const local = (sessions: Record<string, { lastAt: string; rows: SpendRow[] }>): LocalSpend => ({
  version: 1,
  sessions,
})

const draftIdOf = (w: { store: Map<string, unknown> }) =>
  Object.keys(w.store.get('drafts') as Record<string, unknown>)[0]!

const spendWrites = (w: { writes: { path: string; text: string }[] }) =>
  w.writes.filter(x => x.path.startsWith('.craftory/spend/'))

/** The spec `/to-spec` writes, made after the draft's Spec ran, so the draft binds to it. */
const publishSpec = (w: { files: Map<string, string>; mtimes: Map<string, number> }) => {
  w.files.set('.scratch/export/spec.md', SPEC)
  w.mtimes.set('.scratch/export/spec.md', 4_000_000)
}

test('a grill’s spend is kept on this machine, never in the repo, while it is a draft', async ($, on) => {
  let usd = 0
  const w = bare(on, { cost: () => usd })
  await startSession($)
  await skillPrompt($, 'grill-with-docs')
  usd = 0.4
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toMatch(/ · \$0\.40 · \/craftory$/)
  await turnComplete($)
  expect(spendWrites(w)).toEqual([])
  const stored = w.store.get(`spend:draft:${draftIdOf(w)}`) as LocalSpend
  expect(Object.keys(stored.sessions)).toEqual(['s1'])
  expect(stored.sessions.s1!.rows[0]).toMatchObject({ phase: 'align', usd: 0.4 })
})

test('once the spec binds, the grill counts towards the Feature and is committed with it', async ($, on) => {
  let usd = 0
  const w = bare(on, { cost: () => usd })
  await startSession($)
  await skillPrompt($, 'grill-with-docs')
  usd = 0.4
  await mainStep($, 0)
  await turnComplete($)
  const id = draftIdOf(w)
  await skillPrompt($, 'to-spec')
  usd = 0.5
  await mainStep($, 1)
  publishSpec(w)
  await turnComplete($)
  expect(w.store.get('drafts')).toEqual({})
  expect(w.statuses.at(-1)).toMatch(/ · \$0\.50 · \/craftory$/)
  expect(w.store.has(`spend:draft:${id}`)).toBe(false)
  const file = JSON.parse(spendWrites(w).at(-1)!.text) as { rows: SpendRow[] }
  expect(spendWrites(w).at(-1)!.path).toBe(FILE)
  expect(file.rows.map(r => [r.feature, r.phase, Math.round(r.usd! * 100) / 100])).toEqual([
    ['spec:export', 'align', 0.4],
    ['spec:export', 'spec', 0.1],
  ])
})

test('a draft’s spend from an earlier session counts, and moves with it once, on bind', async ($, on) => {
  let usd = 0
  const w = bare(on, {
    cost: () => usd,
    store: {
      drafts: {
        d1: {
          draftId: 'd1',
          title: 'Export invoices as CSV',
          entry: 'align',
          enteredFrom: null,
          marks: { align: { ranAt: '1970-01-01T00:16:00.000Z' } },
          startedAt: '1970-01-01T00:15:00.000Z',
        },
      },
      lastActive: 'draft:d1',
      'spend:draft:d1': local({ s0: { lastAt: '2026-11-16T10:00:00.000Z', rows: [row(1)] } }),
    },
  })
  await startSession($)
  expect(w.statuses.at(-1)).toMatch(/ · \$1\.00 · \/craftory$/)
  await skillPrompt($, 'to-spec')
  usd = 0.25
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toMatch(/ · \$1\.25 · \/craftory$/)
  publishSpec(w)
  await turnComplete($)
  expect(w.store.has('spend:draft:d1')).toBe(false)
  expect(w.statuses.at(-1)).toMatch(/ · \$1\.25 · \/craftory$/)
  const file = JSON.parse(w.files.get(FILE)!) as { rows: SpendRow[] }
  expect(file.rows.map(r => [r.phase, r.usd])).toEqual([
    ['align', 1],
    ['spec', 0.25],
  ])
  await turnComplete($)
  expect(w.statuses.at(-1)).toMatch(/ · \$1\.25 · \/craftory$/)
})

test('a resumed session takes back its own draft spend from the store, counting it once', async ($, on) => {
  let usd = 3
  const w = bare(on, {
    cost: () => usd,
    store: {
      drafts: {
        d1: {
          draftId: 'd1',
          title: 'Export invoices as CSV',
          entry: 'align',
          enteredFrom: null,
          marks: {},
          startedAt: '1970-01-01T00:15:00.000Z',
        },
      },
      lastActive: 'draft:d1',
      'spend:draft:d1': local({
        s1: { lastAt: '2026-11-16T10:00:00.000Z', rows: [row(1, { model: 'sonnet' })] },
      }),
    },
  })
  await startSession($)
  await skillPrompt($, 'grill-with-docs')
  usd = 3.5
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toMatch(/ · \$1\.50 · \/craftory$/)
  await turnComplete($)
  const stored = w.store.get('spend:draft:d1') as LocalSpend
  expect(Object.keys(stored.sessions)).toEqual(['s1'])
  expect(stored.sessions.s1!.rows.map(r => [r.phase, r.usd, r.steps])).toEqual([['align', 1.5, 2]])
})

test('Outside features is kept on this machine for 30 days and never committed', async ($, on) => {
  const now = Date.parse('2026-11-17T12:00:00.000Z')
  let usd = 0
  const w = bare(on, {
    now,
    cost: () => usd,
    store: {
      'spend:outside': local({
        stale: {
          lastAt: '2026-10-01T10:00:00.000Z',
          rows: [row(5, { feature: null, phase: null })],
        },
        recent: {
          lastAt: '2026-11-10T10:00:00.000Z',
          rows: [row(2, { feature: null, phase: null })],
        },
      }),
    },
  })
  await startSession($)
  usd = 0.3
  await mainStep($, 0)
  await turnComplete($)
  expect(spendWrites(w)).toEqual([])
  const stored = w.store.get('spend:outside') as LocalSpend
  expect(Object.keys(stored.sessions).sort()).toEqual(['recent', 's1'])
  expect(stored.sessions.s1!.rows[0]).toMatchObject({ feature: null, usd: 0.3 })
  expect(w.statuses.at(-1)).toBeUndefined()
})

test('a committed Feature’s spend never goes to the store', async ($, on) => {
  let usd = 0
  const w = bare(on, {
    cost: () => usd,
    files: {
      '.scratch/export/spec.md': SPEC,
      '.craftory/features/export.json': JSON.stringify({
        version: 1,
        spec: 'export',
        title: 'Export invoices as CSV',
        entry: 'align',
        integrationBranch: 'feat/export',
        marks: {},
        agents: {},
      }),
      '.craftory/spend/export/s0.json': serialiseSpendFile({
        version: 1,
        session: 's0',
        startedAt: '2026-11-16T10:00:00.000Z',
        rows: [row(1, { feature: 'spec:export' as SpendRow['feature'] })],
      }),
    },
  })
  await startSession($)
  usd = 0.2
  await mainStep($, 0)
  await turnComplete($)
  expect([...w.store.keys()].filter(k => k.startsWith('spend:'))).toEqual([])
  expect(spendWrites(w).map(x => x.path)).toEqual([FILE])
})
