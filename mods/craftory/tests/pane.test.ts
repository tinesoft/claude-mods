import { expect, test } from 'claude-code/testing'
import { mountPane, stubEngine, SURFACES } from './harness'

test('session start registers /craftory to run mid-turn', async ($, on) => {
  const { registered } = stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  expect(registered).toEqual([expect.objectContaining({ name: 'craftory', immediate: true })])
})

test('/craftory opens the craftory pane', async ($, on) => {
  const { opens } = stubEngine(on)
  await $.command.run({ command: 'craftory', args: '' } as never)
  expect(opens).toEqual([expect.objectContaining({ id: 'craftory', title: 'Craftory' })])
})

for (const surface of SURFACES) {
  test(`the pane mounts on ${surface}`, async $ => {
    const pane = await mountPane($, surface)
    expect(await pane.find({ type: 'Text', text: 'Craftory' })).toBeDefined()
  })
}
