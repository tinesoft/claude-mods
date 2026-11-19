import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import type { SpendRow } from '../types'
import { fakeGit, start } from './build-harness'
import {
  allText,
  featureJson,
  featureWorld,
  mountBand,
  mountPane,
  skillPrompt,
  startSession,
  texts,
  ticketFile,
  type WorldOptions,
} from './harness'

/** Older than the csv Feature's own marks, so csv stays the active Feature. */
const AT = '2026-09-01T10:00:00.000Z'

/** A Build ticket's row of an older Feature, priced or (with `usd` null) in tokens only. */
const ticketRow = (
  spec: string,
  ticket: string,
  usd: number | null,
  fresh = 100_000,
): SpendRow => ({
  feature: `spec:${spec}` as SpendRow['feature'],
  phase: 'build',
  ticket: ticket as SpendRow['ticket'],
  agentId: null,
  model: 'claude-sonnet-5-5',
  tokens: { input: fresh, output: 0, cacheRead: 0, cacheWrite: 0 },
  usd,
  isEstimated: false,
  steps: 3,
})

const spendFile = (session: string, rows: SpendRow[]) =>
  serialiseSpendFile({ version: 1, session, startedAt: AT, rows })

/**
 * An older Feature's record: shipped (Ship marked done), shipped by a merged PR (seen while it was
 * active), archived, or still in flight.
 */
const oldFeature = (spec: string, state: 'shipped' | 'pr-merged' | 'archived' | 'in-flight') =>
  featureJson({
    spec,
    title: spec,
    integrationBranch: `feat/${spec}`,
    ...(state === 'archived' && { archivedAt: AT }),
    ...(state === 'pr-merged' && { shippedAt: AT }),
    marks: {
      align: { ranAt: AT },
      ...(state === 'shipped' && { ship: { markedDoneAt: AT } }),
    },
  })

/** Two finished Features: tickets of $1 and $3 (two sessions' rows for one), and one of $2. */
const HISTORY: Record<string, string> = {
  '.craftory/features/old-one.json': oldFeature('old-one', 'shipped'),
  '.craftory/features/old-two.json': oldFeature('old-two', 'archived'),
  '.craftory/spend/old-one/s0.json': spendFile('s0', [
    ticketRow('old-one', 'old-one/01', 0.5, 300_000),
    ticketRow('old-one', 'old-one/02', 3, 500_000),
  ]),
  '.craftory/spend/old-one/s9.json': spendFile('s9', [
    ticketRow('old-one', 'old-one/01', 0.5, 100_000),
  ]),
  '.craftory/spend/old-two/s0.json': spendFile('s0', [
    ticketRow('old-two', 'old-two/01', 2, 400_000),
  ]),
}

const TICKETS = {
  '.scratch/csv/issues/04-email.md': ticketFile(4, 'Email the CSV'),
  '.scratch/csv/issues/05-docs.md': ticketFile(5, 'Docs').replace(
    'ready-for-agent',
    'ready-for-human',
  ),
}

const ticketsCard = async ($: Engine) => {
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-tickets' })
  return allText(await mountBand($, 'terminal', 200, 60))
}

const open = async (on: Parameters<typeof featureWorld>[0], $: Engine, o: WorldOptions = {}) => {
  featureWorld(on, { ...o, files: { ...TICKETS, ...o.files } })
  await startSession($)
  return ticketsCard($)
}

test('the Tickets card forecasts Build from finished Features: median and p90 per ticket, times the tickets meant for an agent', async ($, on) => {
  // Samples $1, $3, $2: median $2 and p90 $2.80 per ticket, for 4 tickets (05 is for a human).
  const text = await open(on, $, { cost: () => 0, files: HISTORY })
  expect(text).toContain('Forecast')
  expect(text).toContain('Build ≈ $8.00 (p90 $11) for 4 tickets')
})

test('without a cost ledger the forecast is in fresh tokens', async ($, on) => {
  // Samples 400k, 500k, 400k: median 400k and p90 480k per ticket.
  const text = await open(on, $, { files: HISTORY })
  expect(text).toContain('Build ≈ 1.6M fresh (p90 1.9M) for 4 tickets')
  expect(text).not.toMatch(/Build ≈ \$/)
})

test('with fewer than 2 finished Features the card says no forecast yet; work in flight is not counted', async ($, on) => {
  const text = await open(on, $, {
    cost: () => 0,
    files: { ...HISTORY, '.craftory/features/old-two.json': oldFeature('old-two', 'in-flight') },
  })
  expect(text).toContain('No forecast yet: it needs 2 finished features')
  expect(text).not.toContain('Build ≈')
})

test('a Feature shipped by a merged PR, with Retro off and not archived, is counted', async ($, on) => {
  const text = await open(on, $, {
    cost: () => 0,
    files: { ...HISTORY, '.craftory/features/old-two.json': oldFeature('old-two', 'pr-merged') },
  })
  expect(text).toContain('Build ≈ $8.00 (p90 $11) for 4 tickets')
})

test('the Spend tab shows each phase’s forecast beside its spend', async ($, on) => {
  // Build cost $4 on old-one and $2 on old-two: median $3, p90 $3.80.
  featureWorld(on, {
    cost: () => 0,
    files: {
      ...HISTORY,
      '.craftory/spend/csv/s0.json': spendFile('s0', [ticketRow('csv', 'csv/01', 1.5)]),
    },
  })
  await startSession($)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'tab-spend' })
  await pane.redraw()
  const words = await texts(pane)
  expect(words).toContain('Build')
  expect(words).toContain('forecast ≈ $3.00 (p90 $3.80)')
})

const savedForecast = (w: { files: Map<string, string> }) =>
  (JSON.parse(w.files.get('.craftory/features/csv.json')!) as { forecast?: unknown }).forecast

const BUILD = { median: 8, p90: 11.2, tickets: 4, unit: 'usd' }

test('when Build starts the forecast is saved on the Feature record', async ($, on) => {
  const w = featureWorld(on, { cost: () => 0, files: { ...TICKETS, ...HISTORY } })
  await startSession($)
  await skillPrompt($, 'implement-spec')
  expect(savedForecast(w)).toEqual({ build: BUILD, at: expect.any(String) })
})

test('a Build started by a rail press saves the forecast on the Feature record', async ($, on) => {
  const w = featureWorld(on, { cost: () => 0, files: { ...TICKETS, ...HISTORY } })
  await startSession($)
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'primary' })
  expect(w.commandsRun.at(-1)?.command).toBe('mattpocock-skills:implement-spec')
  expect(savedForecast(w)).toEqual({ build: BUILD, at: expect.any(String) })
})

test('Build’s first implementer spawn saves the forecast when Build started without one', async ($, on) => {
  // Build starts with one finished Feature; a pull then brings the second one's archive.
  const inFlight = {
    ...HISTORY,
    '.craftory/features/old-two.json': oldFeature('old-two', 'in-flight'),
  }
  const w = featureWorld(on, {
    cost: () => 0,
    shell: fakeGit().shell,
    files: { ...TICKETS, ...inFlight },
  })
  await startSession($)
  await skillPrompt($, 'implement-spec')
  expect(savedForecast(w)).toBeUndefined()
  w.files.set('.craftory/features/old-two.json', oldFeature('old-two', 'archived'))
  await $.tool.call({
    tool: 'Write',
    tool_use_id: 'tw',
    file_path: '.scratch/csv/spec.md',
  } as never)
  await w.clock.advance(2_000)
  await start($, 43, 'Export button')
  expect(savedForecast(w)).toEqual({ build: BUILD, at: expect.any(String) })
})

test('a saved forecast is never overwritten', async ($, on) => {
  const kept = { build: { median: 1, p90: 2, tickets: 1, unit: 'usd' }, at: AT }
  const w = featureWorld(on, {
    cost: () => 0,
    files: {
      ...TICKETS,
      ...HISTORY,
      '.craftory/features/csv.json': featureJson({ forecast: kept }),
    },
  })
  await startSession($)
  await skillPrompt($, 'implement-spec')
  expect(savedForecast(w)).toEqual(kept)
})

test('with no forecast yet, starting Build saves none', async ($, on) => {
  const w = featureWorld(on, { cost: () => 0, files: TICKETS })
  await startSession($)
  await skillPrompt($, 'implement-spec')
  expect(savedForecast(w)).toBeUndefined()
})
