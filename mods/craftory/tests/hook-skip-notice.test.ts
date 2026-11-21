import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  allText,
  featureWorld,
  mountBand,
  mountPane,
  MATT,
  skillPrompt,
  startSession,
  turnComplete,
} from './harness'

const typed = ($: Engine, skill: string) =>
  $.prompt.submit({
    text: `/${skill}`,
    command: { name: skill, args: '' },
  } as never)

/** A security guard sent `skill.prompt` past Craftory: a typed Matt command, then the turn ends. */
const skipped = async ($: Engine, skill = 'handoff', end: Record<string, unknown> = {}) => {
  await typed($, `${MATT}:${skill}`)
  await turnComplete($, end)
}

const bandText = async ($: Engine) => allText(await mountBand($, 'terminal', 200, 60))
const NOTICE = 'security guard'
const OFF = { options: { hook_events: false } }

test('two skipped skill starts raise the notice; one does not', async ($, on) => {
  featureWorld(on)
  await startSession($)
  await skipped($)
  expect(await bandText($)).not.toContain(NOTICE)
  await skipped($, 'grilling')
  expect(await bandText($)).toContain(NOTICE)
})

test('a skill.prompt that follows clears the pending start', async ($, on) => {
  featureWorld(on)
  await startSession($)
  for (const skill of ['handoff', 'grilling']) {
    await typed($, `${MATT}:${skill}`)
    await skillPrompt($, skill)
    await turnComplete($)
  }
  expect(await bandText($)).not.toContain(NOTICE)
})

test('a Skill call that no skill.prompt follows counts as a miss', async ($, on) => {
  featureWorld(on)
  await startSession($)
  for (const skill of ['handoff', 'grilling']) {
    await $.tool.call({ tool: 'Skill', tool_use_id: skill, skill: `${MATT}:${skill}` } as never)
    await turnComplete($)
  }
  expect(await bandText($)).toContain(NOTICE)
})

test('a skill of another plugin raises nothing', async ($, on) => {
  featureWorld(on)
  await startSession($)
  for (let i = 0; i < 3; i++) {
    await typed($, 'other-plugin:thing')
    await turnComplete($)
  }
  expect(await bandText($)).not.toContain(NOTICE)
})

test('with hook_events off, nothing is watched', OFF, async ($, on) => {
  featureWorld(on)
  await startSession($)
  await skipped($)
  await skipped($, 'grilling')
  expect(await bandText($)).not.toContain(NOTICE)
})

test('an interrupted turn is not a miss', async ($, on) => {
  featureWorld(on)
  await startSession($)
  await skipped($, 'handoff', { isAborted: true, reason: 'aborted' })
  await skipped($, 'grilling', { isAborted: true, reason: 'aborted' })
  expect(await bandText($)).not.toContain(NOTICE)
})

test('a session with nothing drawn raises nothing and writes nothing', async ($, on) => {
  const w = featureWorld(on, { surfaces: [] })
  await startSession($)
  await skipped($)
  await skipped($, 'grilling')
  expect(w.store.has('hookSkipHandled')).toBe(false)
  expect(await bandText($)).not.toContain(NOTICE)
})

test('the pane shows the notice where no band draws', async ($, on) => {
  featureWorld(on, { surfaces: ['vscode'] })
  await startSession($, 'vscode')
  await skipped($)
  await skipped($, 'grilling')
  expect(await allText(await mountPane($, 'vscode'))).toContain(NOTICE)
})

test('Turn off hook events sets the option to false and says to reload', async ($, on) => {
  const w = featureWorld(on)
  const sets: unknown[] = []
  on('config.set', (_$, e) => (sets.push({ key: e.key, value: e.value }), { value: e.value }))
  await startSession($)
  await skipped($)
  await skipped($, 'grilling')
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'notice-turn-off-hook-events' })
  expect(sets).toEqual([{ key: 'craftory.hook_events', value: false }])
  const text = await bandText($)
  expect(text).toContain('/reload-plugins')
  expect(text).not.toContain('Turn off hook events')
  expect(w.store.get('hookSkipHandled')).toBe(true)
})

test('a refused switch shows the denial and the row to change', async ($, on) => {
  const w = featureWorld(on)
  on('config.set', () => ({ deny: 'Set by your organization.' }))
  await startSession($)
  await skipped($)
  await skipped($, 'grilling')
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'notice-turn-off-hook-events' })
  const text = await bandText($)
  expect(text).toContain('Set by your organization.')
  expect(text).toContain('Skill prompt events')
  expect(w.store.get('hookSkipHandled')).toBe(true)
})

test('after the press a new session raises nothing', async ($, on) => {
  featureWorld(on, { store: { hookSkipHandled: true } })
  await startSession($)
  await skipped($)
  await skipped($, 'grilling')
  expect(await bandText($)).not.toContain(NOTICE)
})

test('Not now hides it, writes nothing, and a new session can raise it again', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  await skipped($)
  await skipped($, 'grilling')
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'notice-not-now-hook-skip' })
  expect(await bandText($)).not.toContain(NOTICE)
  await skipped($, 'handoff')
  expect(await bandText($)).not.toContain(NOTICE)
  expect(w.store.has('hookSkipHandled')).toBe(false)
  await startSession($)
  await skipped($)
  await skipped($, 'grilling')
  expect(await bandText($)).toContain(NOTICE)
})

test('with hook_events on, skill.prompt starts the run once', async ($, on) => {
  featureWorld(on)
  await startSession($)
  await typed($, `${MATT}:handoff`)
  await skillPrompt($, 'handoff')
  await $.tool.call({ tool: 'Skill', tool_use_id: 'x', skill: `${MATT}:handoff` } as never)
  await turnComplete($)
  expect(await bandText($)).not.toContain(NOTICE)
})
