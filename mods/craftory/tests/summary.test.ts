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
