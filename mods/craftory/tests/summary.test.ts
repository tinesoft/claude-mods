import { type Engine, expect, test } from 'claude-code/testing'
import { featureWorld, IN_RANGE, MATT_SKILLS, mattCommands, startSession, world } from './harness'

const run = async ($: Engine) =>
  (await $.command.run({ command: 'craftory', args: '' } as never)).text

test('where nothing draws, /craftory replies with the feature as a list, its next action last, and opens no pane', async ($, on) => {
  const w = featureWorld(on, { surfaces: [] })
  await startSession($)
  const text = await run($)
  expect(w.opens).toEqual([])
  expect(text).toBe(
    [
      '## Export invoices as CSV',
      '1. **Align** · Done',
      '2. **Spec** · Done · csv',
      '3. **Tickets** · Done · 3',
      '4. **Build** · Up next',
      '5. **Review** · Gated',
      '6. **Ship** · Gated',
      '7. **Retro** · Not started',
      '',
      'Next: **Build**, run `/implement-spec .scratch/csv/spec.md`.',
    ].join('\n'),
  )
})

test('with the plugin and no feature the reply says no feature is in flight and how to start one', async ($, on) => {
  world(on, { surfaces: [], commands: mattCommands(...MATT_SKILLS), plugins: IN_RANGE })
  await startSession($)
  expect(await run($)).toBe('No feature in flight. Start one with /grill-with-docs.')
})

test('without the plugin the reply names the plugin to install', async ($, on) => {
  world(on, { surfaces: [] })
  await startSession($)
  expect(await run($)).toBe('Craftory needs mattpocock-skills 1.3.x.')
})

test('on a Claude Code older than the floor the reply names the version to update to, even with a surface', async ($, on) => {
  const w = featureWorld(on, { version: '2.1.200' })
  await startSession($)
  expect(await run($)).toBe('Craftory needs Claude Code 2.1.299 or later. Run claude update.')
  expect(w.opens).toEqual([])
})

const TOKENS = {
  input_tokens: 100,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1_000,
}

const mainStep = async ($: Engine) => {
  const stream = $.turn.step({ turnId: 'm', index: 0, model: 'opus', messageCount: 1 } as never)
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await iterator.next()).done) {
    // drained: the step's result is what counts
  }
}

const otherSession = JSON.stringify({
  version: 1,
  session: 's0',
  user: 'Mate <mate@example.com>',
  startedAt: '2026-11-16T09:00:00.000Z',
  rows: [
    {
      feature: 'spec:csv',
      phase: 'spec',
      ticket: null,
      agentId: null,
      model: 'claude-opus-5-5',
      tokens: { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0 },
      usd: 2,
      isEstimated: false,
      steps: 1,
    },
  ],
})

test('where nothing draws, the reply adds the Feature’s spend across sessions before what is next', async ($, on) => {
  let usd = 0
  featureWorld(on, {
    surfaces: [],
    cost: () => usd,
    usage: () => TOKENS,
    files: { '.craftory/spend/csv/s0.json': otherSession },
  })
  await startSession($)
  usd = 0.5
  await mainStep($)
  const lines = (await run($))!.split('\n')
  expect(lines.slice(-4)).toEqual([
    '',
    'Spend: $2.50 (1k fresh tokens) across 2 sessions',
    '',
    'Next: **Build**, run `/implement-spec .scratch/csv/spec.md`.',
  ])
})

test('where the host keeps no cost ledger the reply gives fresh tokens and says why', async ($, on) => {
  featureWorld(on, { surfaces: [], usage: () => TOKENS })
  await startSession($)
  await mainStep($)
  expect(await run($)).toContain(
    'Spend: 300 fresh tokens across 1 session ($ unavailable on this surface)',
  )
})
