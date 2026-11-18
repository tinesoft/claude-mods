import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { featureWorld, mountBand, MATT, skillPrompt, startSession, turnComplete } from './harness'

const DOC = 'docs/handoffs/2026-11-10-csv-export.md'
const OFF = { options: { hook_events: false } }

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

/** A handoff run that writes its document, then the turn ends: whether the Feature card links it. */
const handoffLinked = async ($: Engine, start: () => Promise<unknown>) => {
  await startSession($)
  await start()
  await write($, DOC)
  await turnComplete($)
  return (await cardLinks($)).includes(DOC)
}

test('with hook_events off, a handoff started by the Skill call is linked', OFF, async ($, on) => {
  featureWorld(on)
  expect(await handoffLinked($, () => viaTool($, 'handoff'))).toBe(true)
})

test('with hook_events off, a handoff started by a typed /skill is linked', OFF, async ($, on) => {
  featureWorld(on)
  expect(await handoffLinked($, () => viaTyped($, 'handoff'))).toBe(true)
})

test('with hook_events off, skill.prompt is not registered', OFF, async ($, on) => {
  featureWorld(on)
  expect(await handoffLinked($, () => skillPrompt($, 'handoff'))).toBe(false)
})

test('with hook_events on, skill.prompt starts the run and the Skill call and typed /skill add nothing', async ($, on) => {
  featureWorld(on)
  expect(await handoffLinked($, () => skillPrompt($, 'handoff'))).toBe(true)
})

test('with hook_events on, a Skill call alone does not start the run', async ($, on) => {
  featureWorld(on)
  expect(await handoffLinked($, () => viaTool($, 'handoff'))).toBe(false)
})

test('with hook_events off, a command that is not a skill starts nothing', OFF, async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  const before = w.writes.length
  await $.prompt.submit({ text: '/compact', command: { name: 'compact', args: '' } } as never)
  expect(w.writes.length).toBe(before)
})
