import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  featureWorld,
  mountBand,
  skillPrompt,
  startSession,
  turnComplete,
  type World,
} from './harness'

const ON = { '.craftory/config.json': JSON.stringify({ automation: { handoffAt80: true } }) }

const DOC = 'docs/handoffs/2026-11-10-csv-export.md'

const filled = (tokens: number) => ({
  input_tokens: 1_000,
  output_tokens: 500,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: tokens - 1_000,
})

const mainStep = async ($: Engine) => {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'opus', messageCount: 1 } as never)
  const steps = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await steps.next()).done);
}

/** A session at 85% whose band offers the handoff, pressed: the skill now runs. */
const pressedHandoff = async (on: Parameters<typeof featureWorld>[0], $: Engine) => {
  const w = featureWorld(on, { window: 200_000, usage: () => filled(170_000), files: ON })
  await startSession($)
  await mainStep($)
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'notice-run-handoff' })
  await skillPrompt($, 'handoff')
  return w
}

const write = ($: Engine, path: string) =>
  $.tool.call({ tool: 'Write', tool_use_id: `w-${path}`, file_path: path, content: '#' } as never)

/** The links the open Build card draws. */
const cardLinks = async ($: Engine) => {
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  const band = await mountBand($, 'terminal', 200, 60)
  return (await band.findAll({ type: 'Link' })).map(l => l.props.href)
}

const craftoryWrites = (w: World) => w.writes.filter(x => !x.path.startsWith('.craftory/features/'))

test('the handoff the notice ran is linked from the Feature card once it is written', async ($, on) => {
  const w = await pressedHandoff(on, $)
  await write($, DOC)
  await turnComplete($)
  expect(await cardLinks($)).toContain(DOC)
  expect(craftoryWrites(w)).toEqual([])
})

test('the link survives a restart: it is kept on the Feature record', async ($, on) => {
  await pressedHandoff(on, $)
  await write($, DOC)
  await turnComplete($)
  await startSession($)
  expect(await cardLinks($)).toContain(DOC)
})

test('no link when the handoff run wrote nothing', async ($, on) => {
  await pressedHandoff(on, $)
  await turnComplete($)
  expect(await cardLinks($)).not.toContain(DOC)
})

test('no link when the handoff run was cancelled, even after it wrote', async ($, on) => {
  await pressedHandoff(on, $)
  await write($, DOC)
  await turnComplete($, { isAborted: true, reason: 'aborted' })
  expect(await cardLinks($)).not.toContain(DOC)
})

test('a write outside a handoff run is never linked', async ($, on) => {
  featureWorld(on, { files: ON })
  await startSession($)
  await write($, DOC)
  await turnComplete($)
  expect(await cardLinks($)).not.toContain(DOC)
})

const edit = ($: Engine, path: string) =>
  $.tool.call({
    tool: 'Edit',
    tool_use_id: `e-${path}`,
    file_path: path,
    old_string: 'a',
    new_string: 'b',
  } as never)

test('a handoff run that ends on a non-Markdown write links its Markdown document', async ($, on) => {
  await pressedHandoff(on, $)
  await write($, DOC)
  await write($, 'src/app.ts')
  await turnComplete($)
  const links = await cardLinks($)
  expect(links).toContain(DOC)
  expect(links).not.toContain('src/app.ts')
})

test('a handoff document written with Edit is linked', async ($, on) => {
  await pressedHandoff(on, $)
  await edit($, DOC)
  await turnComplete($)
  expect(await cardLinks($)).toContain(DOC)
})

test('the bare /handoff skill is tracked too when Matt owns the name', async ($, on) => {
  featureWorld(on, { window: 200_000, usage: () => filled(170_000), files: ON })
  await startSession($)
  await $.skill.prompt({ skill: 'handoff', text: '', frontmatter: {}, source: 'plugin' } as never)
  await write($, DOC)
  await turnComplete($)
  expect(await cardLinks($)).toContain(DOC)
})
