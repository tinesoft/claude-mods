import { type Engine, expect, test } from 'claude-code/testing'
import { building, OVER, start, step } from './build-harness'
import { featureWorld, startSession } from './harness'

const TOKENS = {
  input_tokens: 100,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1_000,
}

/** A main-session step, answered by the world's `turn.step`. */
const mainStep = async ($: Engine, index: number) => {
  const stream = $.turn.step({ turnId: 'm', index, model: 'opus', messageCount: 1 } as never)
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await iterator.next()).done) {
    // drained: the step's result is what counts
  }
}

const measure = ($: Engine, usd: number) =>
  $.session.measure({
    context: { window: 200_000 },
    rateLimits: [],
    cost: { usd },
    changed: ['cost'],
  } as never)

test('a main step between phases puts what it cost on the status line', async ($, on) => {
  let usd = 0
  const w = featureWorld(on, { cost: () => usd, usage: () => TOKENS })
  await startSession($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · /craftory')
  usd = 0.42
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $0.42 · /craftory')
  usd = 1.5
  await mainStep($, 1)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $1.50 · /craftory')
})

test('a resumed session starts from its cost so far, and charges only what comes after', async ($, on) => {
  let usd = 10
  const w = featureWorld(on, { cost: () => usd, usage: () => TOKENS })
  await startSession($)
  usd = 10.25
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $0.25 · /craftory')
})

test('where the host keeps no cost ledger the status line shows fresh tokens, never $0', async ($, on) => {
  const w = featureWorld(on, { usage: () => TOKENS })
  await startSession($)
  await mainStep($, 0)
  await mainStep($, 1)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · 600 · /craftory')
})

test('a cost that grows only after the step, at session.measure, still prices it', async ($, on) => {
  const usd = 0
  const w = featureWorld(on, { cost: () => usd, usage: () => TOKENS })
  await startSession($)
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · 300 · /craftory')
  await measure($, 0.3)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $0.30 · /craftory')
})

test('three agents sharing one cost reading add up to exactly that reading', async ($, on) => {
  let usd = 0
  const { w } = await building(on, $, { cost: () => usd, usage: () => TOKENS })
  await start($, 43, 'Export button')
  await start($, 44, 'Ledger tax')
  await start($, 45, 'Date filter')
  await step($, 'agent-tu43', 0)
  await step($, 'agent-tu44', 0)
  usd = 0.9
  await step($, 'agent-tu45', 0)
  expect(w.statuses.at(-1)).toMatch(/ · \$0\.90 · \/craftory$/)
})

test('the step an agent is stopped on sends no request and is not charged', async ($, on) => {
  let usd = 0
  let usage = OVER
  const { w } = await building(on, $, { cost: () => usd, usage: () => usage })
  await start($, 43, 'Export button')
  usd = 2
  await step($, 'agent-tu43', 0)
  expect(w.statuses.at(-1)).toMatch(/ · \$2\.00 · \/craftory$/)
  usage = TOKENS
  const before = w.steps.length
  const stopped = await step($, 'agent-tu43', 1)
  expect(stopped.result.usage).toBeNull()
  expect(w.steps).toHaveLength(before)
  expect(w.statuses.at(-1)).toMatch(/ · \$2\.00 · \/craftory$/)
})

test('with no feature in flight a step leaves the status line empty', async ($, on) => {
  let usd = 0
  const w = featureWorld(on, {
    cost: () => usd,
    usage: () => TOKENS,
    files: { '.craftory/features/csv.json': '' },
  })
  await startSession($)
  usd = 1
  await mainStep($, 0)
  expect(w.statuses.at(-1)).toBeUndefined()
})
