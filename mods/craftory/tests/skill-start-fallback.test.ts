import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  featureWorld,
  mountBand,
  MATT,
  skillPrompt,
  startSession,
  submit,
  turnComplete,
} from './harness'

const DOC = 'docs/handoffs/2026-11-10-csv-export.md'

// A managed plugin above Craftory may end the `skill.prompt` chain; these never fire it.
const viaTool = ($: Engine, skill: string) =>
  $.tool.call({ tool: 'Skill', tool_use_id: `s-${skill}`, skill: `${MATT}:${skill}` } as never)

const viaTyped = ($: Engine, skill: string) =>
  $.prompt.submit({
    text: `/${MATT}:${skill}`,
    command: { name: `${MATT}:${skill}`, args: '' },
  } as never)

const write = ($: Engine, path: string) =>
  $.tool.call({ tool: 'Write', tool_use_id: `w-${path}`, file_path: path, content: '#' } as never)

const cardLinks = async ($: Engine) => {
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  const band = await mountBand($, 'terminal', 200, 60)
  return (await band.findAll({ type: 'Link' })).map(l => l.props.href)
}

for (const [how, start] of [
  ['the Skill tool call', viaTool],
  ['a typed /skill', viaTyped],
] as const) {
  test(`a handoff started by ${how} is still linked without skill.prompt`, async ($, on) => {
    featureWorld(on)
    await startSession($)
    await start($, 'handoff')
    await write($, DOC)
    await turnComplete($)
    expect(await cardLinks($)).toContain(DOC)
  })
}

test('the same start reported by two sources is noted once', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  await viaTool($, 'handoff')
  await skillPrompt($, 'handoff')
  await write($, DOC)
  await turnComplete($)
  const kept = w.writes.filter(x => x.path.startsWith('.craftory/features/'))
  const again = await (async () => {
    await viaTool($, 'handoff')
    return w.writes.length
  })()
  expect(kept.length).toBeGreaterThan(0)
  expect(again).toBeGreaterThanOrEqual(w.writes.length)
})

test('a command that is not a skill starts nothing', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  const before = w.writes.length
  await submit($, '/compact')
  await $.prompt.submit({ text: '/compact', command: { name: 'compact', args: '' } } as never)
  expect(w.writes.length).toBe(before)
})

test(
  'with hook_events off, skill.prompt is not registered',
  { options: { hook_events: false } },
  async ($, on) => {
    featureWorld(on)
    await startSession($)
    await skillPrompt($, 'handoff')
    await write($, DOC)
    await turnComplete($)
    expect(await cardLinks($)).not.toContain(DOC)
  },
)

test(
  'with hook_events off, the Skill call still starts the run',
  { options: { hook_events: false } },
  async ($, on) => {
    featureWorld(on)
    await startSession($)
    await viaTool($, 'handoff')
    await write($, DOC)
    await turnComplete($)
    expect(await cardLinks($)).toContain(DOC)
  },
)
