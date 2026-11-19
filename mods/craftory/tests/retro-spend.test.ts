import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import type { SpendRow } from '../types'
import {
  allText,
  featureJson,
  featureWorld,
  MATT,
  mountBand,
  skillPrompt,
  startSession,
  submit,
  turnComplete,
  type World,
  type WorldOptions,
} from './harness'

const AT = '2026-10-24T10:00:00.000Z'
const SUMMARY = '.craftory/spend/csv/spend.md'

const row = (over: Partial<SpendRow> & { usd: number | null }): SpendRow => ({
  feature: 'spec:csv' as SpendRow['feature'],
  phase: 'build',
  ticket: null,
  agentId: null,
  model: 'claude-sonnet-5-5',
  tokens: { input: 100_000, output: 0, cacheRead: 300_000, cacheWrite: 0 },
  isEstimated: false,
  steps: 1,
  ...over,
})

/** Another session's spend on csv: Align on opus, three Build tickets and a review. */
const SPEND = serialiseSpendFile({
  version: 1,
  session: 's0',
  startedAt: AT,
  rows: [
    row({ phase: 'align', model: 'claude-opus-5-5', usd: 4 }),
    row({ ticket: 'csv/01' as SpendRow['ticket'], usd: 6 }),
    row({ ticket: 'csv/02' as SpendRow['ticket'], usd: 3 }),
    row({ ticket: 'csv/03' as SpendRow['ticket'], usd: 1 }),
    row({ phase: 'review', usd: 2 }),
  ],
})

const FORECAST = { build: { median: 8, p90: 12, tickets: 3, unit: 'usd' }, at: AT }

/** csv shipped (its Ship marked done), with Build's forecast saved and spend from another session. */
const shipped = (over: Record<string, unknown> = {}) =>
  featureJson({
    forecast: FORECAST,
    marks: { align: { ranAt: AT }, spec: { ranAt: AT }, ship: { markedDoneAt: AT } },
    ...over,
  })

const retroWorld = (on: Parameters<typeof featureWorld>[0], o: WorldOptions = {}) =>
  featureWorld(on, {
    cost: () => 0,
    ...o,
    files: {
      '.craftory/features/csv.json': shipped(),
      '.craftory/spend/csv/s0.json': SPEND,
      ...o.files,
    },
  })

const retroCard = async ($: Engine) => {
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-retro' })
  return allText(await mountBand($, 'terminal', 200, 60))
}

const CONTEXT_HEAD = 'Craftory: this Feature’s spend'

const summaryWrites = (w: World) => w.writes.filter(x => x.path === SUMMARY)

const finishRetro = async ($: Engine) => {
  await skillPrompt($, 'retro')
  await turnComplete($, { answer: 'Ranked:\n1. Route Build to sonnet\n2. Fewer review passes' })
}

test('the Retro card shows the spend summary as rows', async ($, on) => {
  retroWorld(on)
  await startSession($)
  const text = await retroCard($)
  for (const part of [
    'Total',
    '$16.0 · 500k fresh',
    '$10 against a forecast of $8.00 (p90 $12)',
    'Tickets',
    'csv/01 $6.00 · csv/02 $3.00 · csv/03 $1.00',
    'Phases',
    'Build $10.0 · Align $4.00 · Review $2.00',
    'Cache',
    '75%',
    'Models',
    'claude-sonnet-5-5 $12.0 · claude-opus-5-5 $4.00',
  ])
    expect(text).toContain(part)
})

test('without a cost ledger the Retro card’s summary is in fresh tokens, never $0', async ($, on) => {
  const unpriced = SPEND.replace(/"usd": \d+/g, '"usd": null')
  retroWorld(on, { cost: undefined, files: { '.craftory/spend/csv/s0.json': unpriced } })
  await startSession($)
  const text = await retroCard($)
  expect(text).toContain('500k fresh · $ unavailable on this surface')
  expect(text).toContain('csv/01 100k fresh')
  expect(text).toContain('300k fresh · the forecast of $8.00 (p90 $12) is in dollars')
  expect(text).not.toContain('$0')
})

test('a typed /retro is given the summary as Markdown context', async ($, on) => {
  retroWorld(on)
  await startSession($)
  const result = await submit($, `/${MATT}:retro`)
  expect(result.context).toHaveLength(1)
  const context = result.context![0]!
  expect(context.startsWith(CONTEXT_HEAD)).toBe(true)
  expect(context).toContain('# Spend: Export invoices as CSV')
  expect(context).toContain('- **Costliest tickets:** csv/01 $6.00 · csv/02 $3.00 · csv/03 $1.00')
  expect(context).toContain(
    '- **Build against its forecast:** $10 against a forecast of $8.00 (p90 $12)',
  )
})

test('a pressed /retro carries the summary as the engine submits it; the Retro automation runs the same command', async ($, on) => {
  const w = retroWorld(on)
  await startSession($)
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-retro' })
  const card = await mountBand($, 'terminal', 200, 60)
  await card.press({ key: 'primary' })
  const ran = w.commandsRun.at(-1)!
  expect(ran.command).toBe(`${MATT}:retro`)
  // A plugin's `$.command.run` reaches `prompt.submit` as the command it runs.
  const result = await $.prompt.submit({
    text: `/${ran.command}`,
    command: { name: ran.command, args: ran.args },
  } as never)
  expect(result.context?.[0]?.startsWith(CONTEXT_HEAD)).toBe(true)
})

test('other commands, and /retro with nothing spent, carry no summary', async ($, on) => {
  retroWorld(on, { files: { '.craftory/spend/csv/s0.json': '' } })
  await startSession($)
  expect((await submit($, `/${MATT}:retro`)).context).toBeUndefined()
  expect((await submit($, `/${MATT}:to-tickets csv`)).context).toBeUndefined()
})

test('once Retro is done the summary is written to spend.md, once', async ($, on) => {
  const w = retroWorld(on)
  await startSession($)
  expect(summaryWrites(w)).toEqual([])
  await finishRetro($)
  const writes = summaryWrites(w)
  expect(writes).toHaveLength(1)
  expect(writes[0]!.text.startsWith('# Spend: Export invoices as CSV\n')).toBe(true)
  expect(writes[0]!.text).toContain('- **Cache-hit %:** 75%')
  await startSession($)
  await finishRetro($)
  expect(summaryWrites(w)).toHaveLength(1)
})

test('a spend.md already there is never rewritten', async ($, on) => {
  const w = retroWorld(on, { files: { [SUMMARY]: '# Spend: edited by hand\n' } })
  await startSession($)
  await finishRetro($)
  expect(summaryWrites(w)).toEqual([])
})

test('with Retro on, Ship done alone writes nothing', async ($, on) => {
  const w = retroWorld(on)
  await startSession($)
  expect(summaryWrites(w)).toEqual([])
})

test('with Retro turned off, Ship done writes the summary', async ($, on) => {
  const w = retroWorld(on, {
    files: {
      '.craftory/config.json': JSON.stringify({
        version: 1,
        phases: { retro: { enabled: false } },
      }),
    },
  })
  await startSession($)
  expect(summaryWrites(w)).toHaveLength(1)
})

test('a plugin’s run of /retro carries the summary on command.run too, and prompt.submit does not add it again', async ($, on) => {
  retroWorld(on)
  await startSession($)
  const command = `${MATT}:retro`
  const ran = await $.command.run({
    command,
    args: '',
    origin: { kind: 'plugin', name: 'craftory' },
  } as never)
  expect(ran.context).toHaveLength(1)
  expect(ran.context![0]!.startsWith(CONTEXT_HEAD)).toBe(true)
  const result = await $.prompt.submit({
    text: `/${command}`,
    command: { name: command, args: '' },
  } as never)
  expect(result.context).toBeUndefined()
  // the next /retro, a turn later, is given it again
  await turnComplete($)
  expect((await submit($, `/${command}`)).context?.[0]?.startsWith(CONTEXT_HEAD)).toBe(true)
})
