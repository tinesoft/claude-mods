import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { building, OVER, start, step } from './build-harness'
import {
  allText,
  bandProps,
  featureWorld,
  mountBand,
  startSession,
  type WorldOptions,
} from './harness'

const ON = { '.craftory/config.json': JSON.stringify({ automation: { handoffAt80: true } }) }

/** Input tokens the main session's last response was answered over, against a 200k window. */
const filled = (tokens: number) => ({
  input_tokens: 1_000,
  output_tokens: 500,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: tokens - 1_000,
})

const session = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  tokens: number,
  options: WorldOptions = {},
) => {
  const w = featureWorld(on, {
    window: 200_000,
    usage: e => (e.agentId === undefined ? filled(tokens) : filled(1_000)),
    ...options,
    files: { ...ON, ...options.files },
  })
  await startSession($)
  return w
}

const mainStep = async ($: Engine, index = 0) => {
  const stream = $.turn.step({ turnId: 't', index, model: 'opus', messageCount: 1 } as never)
  const steps = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await steps.next()).done);
}

const working = ($: Engine) =>
  $.ui.mount({
    plugin: 'craftory',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...bandProps(200), isWorking: true },
  })

const HANDOFF = 'Context is 80% full · write a handoff so a fresh session can pick up'

test('at 80% of the main context the band offers Write handoff, which submits /handoff', async ($, on) => {
  const w = await session(on, $, 160_000)
  await mainStep($)
  const band = await mountBand($, 'terminal', 200)
  expect(await allText(band)).toContain(HANDOFF)
  expect(w.commandsRun).toEqual([])
  await band.press({ key: 'notice-run-handoff' })
  expect(w.commandsRun).toEqual([{ command: 'mattpocock-skills:handoff', args: '' }])
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain(HANDOFF)
  expect(w.writes.filter(x => !x.path.startsWith('.craftory/features/'))).toEqual([])
})

test('below 80% there is no notice', async ($, on) => {
  await session(on, $, 159_000)
  await mainStep($)
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain(HANDOFF)
})

test('with the switch off there is no notice at any context level', async ($, on) => {
  await session(on, $, 199_000, { files: { '.craftory/config.json': '{}' } })
  await mainStep($)
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain(HANDOFF)
})

test('the notice waits while a turn runs and shows once the turn is idle', async ($, on) => {
  await session(on, $, 170_000)
  await mainStep($)
  expect(await allText(await working($))).not.toContain(HANDOFF)
  expect(await allText(await mountBand($, 'terminal', 200))).toContain(HANDOFF)
})

test('it fires once per session: later steps past 80% do not raise it again', async ($, on) => {
  const w = await session(on, $, 170_000)
  await mainStep($, 0)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-run-handoff' })
  await mainStep($, 1)
  await mainStep($, 2)
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain(HANDOFF)
  expect(w.commandsRun).toHaveLength(1)
})

test('a dismiss silences it for the session, and a new session re-arms it', async ($, on) => {
  const w = await session(on, $, 170_000)
  await mainStep($, 0)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-dismiss-handoff' })
  await mainStep($, 1)
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain(HANDOFF)
  expect(w.commandsRun).toEqual([])
  await startSession($)
  await mainStep($, 0)
  expect(await allText(await mountBand($, 'terminal', 200))).toContain(HANDOFF)
})

test('a subagent past 80% of the window is never offered a handoff and keeps its own budget', async ($, on) => {
  const { w } = await building(on, $, {
    window: 200_000,
    usage: () => OVER,
    files: ON,
  })
  await start($, 44, 'Ledger tax')
  await step($, 'agent-tu44', 0)
  const text = await allText(await mountBand($, 'terminal', 200))
  expect(text).not.toContain(HANDOFF)
  expect(text).toContain('Agent csv/02 hit its 80k budget')
  expect(w.commandsRun).toEqual([])
})
