import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import type { PhaseId, SpendRow } from '../types'
import { allText, featureWorld, mountBand, startSession, type WorldOptions } from './harness'

const TOKENS = {
  input_tokens: 100,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1_000,
}

/** What another session committed for the csv Feature: `usd` spent on `phase`. */
const spentFile = (phase: PhaseId, usd: number) =>
  serialiseSpendFile({
    version: 1,
    session: 's0',
    startedAt: '2026-11-16T10:00:00.000Z',
    rows: [
      {
        feature: 'spec:csv' as SpendRow['feature'],
        phase,
        ticket: null,
        agentId: null,
        model: 'claude-opus-5-5',
        tokens: { input: 2_000, output: 1_000, cacheRead: 7_000, cacheWrite: 0 },
        usd,
        isEstimated: false,
        steps: 4,
      },
    ],
  })

const config = (budgets: Record<string, unknown>) =>
  `${JSON.stringify({ version: 1, budgets }, null, 2)}\n`

/** A main-session step, answered by the world's `turn.step`. */
const mainStep = async ($: Engine, index: number) => {
  const stream = $.turn.step({ turnId: 'm', index, model: 'opus', messageCount: 1 } as never)
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await iterator.next()).done) {
    // drained: the step's result is what counts
  }
}

/**
 * The csv Feature with `usd` already spent on `phase` and these budgets, on a host whose cost
 * ledger reads what `cost.usd` holds (none when `withCost` is false).
 */
const overWorld = (
  on: Parameters<typeof featureWorld>[0],
  args: {
    phase?: PhaseId
    usd: number
    budgets?: Record<string, unknown>
    withCost?: boolean
    options?: WorldOptions
  },
) => {
  const cost = { usd: 0 }
  const w = featureWorld(on, {
    usage: () => TOKENS,
    ...(args.withCost !== false && { cost: () => cost.usd }),
    ...args.options,
    files: {
      [`.craftory/spend/csv/s0.json`]: spentFile(args.phase ?? 'build', args.usd),
      ...(args.budgets && { '.craftory/config.json': config(args.budgets) }),
    },
  })
  return { w, cost }
}

const band = ($: Engine) => mountBand($, 'terminal', 200)

const BUILD_OVER = 'Build is at $12.40 of $12'

test('a phase up next and over its budget shows Over budget on the rail, with its spend of it', async ($, on) => {
  overWorld(on, { usd: 12.4, budgets: { phaseUsd: { build: 12 } } })
  await startSession($)
  expect((await (await band($)).find({ key: 'phase-build' }))!.text).toBe('▲ Build $12.4 / $12')
})

test('its card reads Over budget, and keeps its command to run', async ($, on) => {
  overWorld(on, { usd: 12.4, budgets: { phaseUsd: { build: 12 } } })
  await startSession($)
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  const card = await allText(await mountBand($, 'terminal', 200, 60))
  expect(card).toContain('Over budget')
  expect(card).toContain('/implement-spec')
  expect(card).not.toContain('Diagnose')
})

test('a phase that reaches its budget raises one band notice, with its three actions', async ($, on) => {
  const { cost } = overWorld(on, { usd: 12.4, budgets: { phaseUsd: { build: 12 } } })
  await startSession($)
  expect(await allText(await band($))).not.toContain('is at $')
  cost.usd = 0.1
  await mainStep($, 0)
  const text = await allText(await band($))
  expect(text).toContain(BUILD_OVER)
  for (const label of ['Raise budget', 'Continue', 'Diagnose']) expect(text).toContain(label)
  cost.usd = 0.2
  await mainStep($, 1)
  expect((await allText(await band($))).split(' is at $').length).toBe(2)
})

test('Raise budget sets the Feature’s own budget to half again, and drops the notice', async ($, on) => {
  const { w, cost } = overWorld(on, { usd: 12.4, budgets: { phaseUsd: { build: 12 } } })
  await startSession($)
  cost.usd = 0.1
  await mainStep($, 0)
  await (await band($)).press({ key: 'notice-raise-spend-budget-build' })
  const record = JSON.parse(w.files.get('.craftory/features/csv.json')!)
  expect(record.budgets).toEqual({ phases: { build: 18 } })
  expect(await allText(await band($))).not.toContain('is at $')
})

test('the Feature reaching its budget names it; reaching the raised budget raises it again', async ($, on) => {
  const { w, cost } = overWorld(on, { phase: 'align', usd: 20, budgets: { featureUsd: 20 } })
  await startSession($)
  cost.usd = 0.1
  await mainStep($, 0)
  expect(await allText(await band($))).toContain('Export invoices as CSV is at $20.10 of $20')
  await (await band($)).press({ key: 'notice-raise-spend-budget-feature' })
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).budgets).toEqual({ usd: 30 })
  cost.usd = 5
  await mainStep($, 1)
  expect(await allText(await band($))).not.toContain('is at $')
  cost.usd = 10
  await mainStep($, 2)
  expect(await allText(await band($))).toContain('Export invoices as CSV is at $30.00 of $30')
})

test('Continue records the budget it was pressed at, and that budget never raises it again', async ($, on) => {
  const { w, cost } = overWorld(on, { usd: 12.4, budgets: { phaseUsd: { build: 12 } } })
  await startSession($)
  cost.usd = 0.1
  await mainStep($, 0)
  await (await band($)).press({ key: 'notice-continue-budget-build' })
  expect(await allText(await band($))).not.toContain('is at $')
  expect(w.store.get('budgetsContinued')).toEqual({ 'spec:csv': { build: 12 } })
  cost.usd = 0.5
  await mainStep($, 1)
  expect(await allText(await band($))).not.toContain('is at $')
})

test('a Continue kept from another session silences that budget, but not a changed one', async ($, on) => {
  const kept = { budgetsContinued: { 'spec:csv': { build: 12, feature: 5 } } }
  const { cost } = overWorld(on, {
    usd: 12.4,
    budgets: { phaseUsd: { build: 12 }, featureUsd: 10 },
    options: { store: kept },
  })
  await startSession($)
  cost.usd = 0.1
  await mainStep($, 0)
  const text = await allText(await band($))
  expect(text).not.toContain(BUILD_OVER)
  expect(text).toContain('Export invoices as CSV is at $12.50 of $10')
})

test('Diagnose submits /diagnosing-bugs about the overrun, drops the notice, and it stays down', async ($, on) => {
  const { w, cost } = overWorld(on, { usd: 12.4, budgets: { phaseUsd: { build: 12 } } })
  await startSession($)
  cost.usd = 0.1
  await mainStep($, 0)
  await (await band($)).press({ key: 'notice-diagnose-budget-build' })
  expect(w.commandsRun.at(-1)).toEqual({
    command: 'mattpocock-skills:diagnosing-bugs',
    args: `${BUILD_OVER}: find out why it cost so much`,
  })
  cost.usd = 0.2
  await mainStep($, 1)
  expect(await allText(await band($))).not.toContain('is at $')
})

test('where the host keeps no cost ledger there is no notice and no Over budget', async ($, on) => {
  overWorld(on, { usd: 12.4, budgets: { phaseUsd: { build: 12 } }, withCost: false })
  await startSession($)
  await mainStep($, 0)
  await mainStep($, 1)
  const drawn = await band($)
  expect(await allText(drawn)).not.toContain('is at $')
  expect((await drawn.find({ key: 'phase-build' }))!.text).not.toContain('▲')
})

test('a budget crossed by a step that leaves the status line unchanged still raises the notice', async ($, on) => {
  const { cost } = overWorld(on, { phase: 'align', usd: 11.98, budgets: { featureUsd: 12 } })
  await startSession($)
  cost.usd = 0.04
  await mainStep($, 0)
  expect(await allText(await band($))).toContain('Export invoices as CSV is at $12.02 of $12')
})

test('the notice raised in one session is not raised again in the next, at the same budget', async ($, on) => {
  const { w, cost } = overWorld(on, { usd: 12.4, budgets: { phaseUsd: { build: 12 } } })
  await startSession($)
  cost.usd = 0.1
  await mainStep($, 0)
  expect(await allText(await band($))).toContain(BUILD_OVER)
  expect(w.store.get('budgetsRaised')).toEqual({ 'spec:csv': { build: 12 } })
})

test('a notice kept as raised by another session stays down, but a changed budget raises it', async ($, on) => {
  const kept = { budgetsRaised: { 'spec:csv': { build: 12, feature: 5 } } }
  const { cost } = overWorld(on, {
    usd: 12.4,
    budgets: { phaseUsd: { build: 12 }, featureUsd: 10 },
    options: { store: kept },
  })
  await startSession($)
  cost.usd = 0.1
  await mainStep($, 0)
  const text = await allText(await band($))
  expect(text).not.toContain(BUILD_OVER)
  expect(text).toContain('Export invoices as CSV is at $12.50 of $10')
})

test('Raise budget’s toast names the scope as the notice does', async ($, on) => {
  const { w, cost } = overWorld(on, { phase: 'align', usd: 20, budgets: { featureUsd: 20 } })
  await startSession($)
  cost.usd = 0.1
  await mainStep($, 0)
  await (await band($)).press({ key: 'notice-raise-spend-budget-feature' })
  expect(w.toasts.at(-1)).toBe('Export invoices as CSV budget raised to $30')
})
