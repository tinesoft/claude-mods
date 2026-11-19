import type { SessionRateLimit } from 'claude-code'
import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import type { SpendRow } from '../types'
import { fakeGit } from './build-harness'
import {
  featureJson,
  featureWorld,
  mountBand,
  mountPane,
  startSession,
  submit,
  ticketFile,
  type WorldOptions,
} from './harness'

const NOW = Date.parse('2026-11-18T12:00:00Z')
const IN_AN_HOUR = '2026-11-18T13:00:00Z'
const AT = '2026-09-01T10:00:00.000Z'

/** A local 24-hour time: the zone is the test machine's. */
const TIME = String.raw`\d\d:\d\d`

const ticketRow = (spec: string, ticket: string, usd: number): SpendRow => ({
  feature: `spec:${spec}` as SpendRow['feature'],
  phase: 'build',
  ticket: ticket as SpendRow['ticket'],
  agentId: null,
  model: 'claude-sonnet-5-5',
  tokens: { input: 100_000, output: 0, cacheRead: 0, cacheWrite: 0 },
  usd,
  isEstimated: false,
  steps: 3,
})

const spendFile = (session: string, rows: SpendRow[]) =>
  serialiseSpendFile({ version: 1, session, startedAt: AT, rows })

const shipped = (spec: string) =>
  featureJson({
    spec,
    title: spec,
    integrationBranch: `feat/${spec}`,
    marks: { align: { ranAt: AT }, ship: { markedDoneAt: AT } },
  })

/**
 * Two finished Features with tickets of $1, $3 and $2, and csv's 4 tickets meant for an agent:
 * Build ≈ $8.00 (p90 $11.20).
 */
const HISTORY: Record<string, string> = {
  '.craftory/features/old-one.json': shipped('old-one'),
  '.craftory/features/old-two.json': shipped('old-two'),
  '.craftory/spend/old-one/s0.json': spendFile('s0', [
    ticketRow('old-one', 'old-one/01', 1),
    ticketRow('old-one', 'old-one/02', 3),
  ]),
  '.craftory/spend/old-two/s0.json': spendFile('s0', [ticketRow('old-two', 'old-two/01', 2)]),
  '.scratch/csv/issues/04-email.md': ticketFile(4, 'Email the CSV'),
}

const five = (percentUsed: number): SessionRateLimit[] => [
  { kind: 'five_hour', percentUsed, resetsAt: IN_AN_HOUR },
]

/** The session starts at $0 with the 5-hour window at `from`%. */
const world = (
  on: Parameters<typeof featureWorld>[0],
  from: number,
  options: WorldOptions = {},
) => {
  const now = { usd: 0, limits: five(from) }
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    now: NOW,
    cost: () => now.usd,
    rateLimits: () => now.limits,
    ...options,
    files: { ...HISTORY, ...options.files },
  })
  return { w, now }
}

/** A `session.measure` reading the cost and the 5-hour window. */
const measure = ($: Engine, usd: number, percentUsed: number) =>
  $.session.measure({
    context: { window: 200_000 },
    rateLimits: five(percentUsed),
    cost: { usd },
    changed: ['cost', 'rateLimits'],
  } as never)

// From 60% to 64% over $1: 4 points per dollar, so $11.20 is about 45 points, with 36 left.
const WARNING = new RegExp(
  `^Build is forecast at up to \\$11, about 45% of the 5-hour window · 36% is left, resets ${TIME}$`,
)

const bandLines = async ($: Engine) =>
  (await (await mountBand($, 'terminal', 200)).findAll({ type: 'Text' })).map(t => t.text)

const warned = async ($: Engine) => (await bandLines($)).some(l => WARNING.test(l))

test('a typed /implement-spec whose forecast would use up the window warns in the band and still runs', async ($, on) => {
  world(on, 60)
  await startSession($)
  await measure($, 1, 64)
  const result = await submit($, '/mattpocock-skills:implement-spec csv')
  expect(result.drop).toBeUndefined()
  expect(result.text).toBe('/mattpocock-skills:implement-spec csv')
  expect(await warned($)).toBe(true)
})

test('a rail press on Build warns and still runs the command', async ($, on) => {
  const { w } = world(on, 60)
  await startSession($)
  await measure($, 1, 64)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-build' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'primary' })
  expect(w.commandsRun).toEqual([
    { command: 'mattpocock-skills:implement-spec', args: '.scratch/csv/spec.md' },
  ])
  expect(await warned($)).toBe(true)
})

test('where no band is drawn the pane shows the warning', async ($, on) => {
  world(on, 60, { surfaces: ['mobile'] })
  await startSession($, 'mobile')
  await measure($, 1, 64)
  expect((await submit($, '/mattpocock-skills:implement-spec csv')).drop).toBeUndefined()
  const pane = await mountPane($, 'mobile')
  expect((await pane.findAll({ type: 'Text' })).some(t => WARNING.test(t.text))).toBe(true)
})

test('Dismiss closes the warning', async ($, on) => {
  world(on, 60)
  await startSession($)
  await measure($, 1, 64)
  await submit($, '/mattpocock-skills:implement-spec csv')
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-dismiss-forecast-window' })
  expect(await warned($)).toBe(false)
})

test('with too little moved for an estimate there is no warning', async ($, on) => {
  world(on, 60)
  await startSession($)
  await measure($, 0.4, 64)
  await submit($, '/mattpocock-skills:implement-spec csv')
  expect((await bandLines($)).join('\n')).not.toContain('Build is forecast')
})

test('with enough room in the window there is no warning', async ($, on) => {
  world(on, 10)
  await startSession($)
  await measure($, 1, 14)
  await submit($, '/mattpocock-skills:implement-spec csv')
  expect((await bandLines($)).join('\n')).not.toContain('Build is forecast')
})

test('the throttle warning shows as before beside it', async ($, on) => {
  world(on, 80)
  await startSession($)
  await measure($, 1, 84)
  await submit($, '/mattpocock-skills:implement-spec csv')
  const lines = (await bandLines($)).join('\n')
  expect(lines).toContain('5-hour window at 84% · Build runs 1 implementer at a time')
  expect(lines).toContain('Build is forecast at up to $11, about 45% of the 5-hour window')
})
