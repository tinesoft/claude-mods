import { expect, test } from 'claude-code/testing'
import { mountPane, startSession, SURFACES, world } from './harness'

test('session start registers /craftory to run mid-turn and passes the start through', async ($, on) => {
  const w = world(on)
  const started = await startSession($)
  expect(started).toEqual({ cwd: '/repo' })
  expect(w.registered).toEqual([expect.objectContaining({ name: 'craftory', immediate: true })])
})

test('/craftory opens the craftory pane', async ($, on) => {
  const w = world(on)
  await $.command.run({ command: 'craftory', args: '' } as never)
  expect(w.opens).toEqual([expect.objectContaining({ id: 'craftory', title: 'Craftory' })])
})

for (const surface of SURFACES) {
  test(`the pane mounts on ${surface}`, async ($, on) => {
    world(on)
    await startSession($, surface)
    const pane = await mountPane($, surface)
    expect(await pane.find({ type: 'Text', text: 'Craftory' })).toBeDefined()
  })
}
