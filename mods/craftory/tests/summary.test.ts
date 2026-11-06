import { expect, test } from 'claude-code/testing'
import { featureWorld, startSession, world } from './harness'

test('where nothing draws, /craftory replies with the feature as a list and opens no pane', async ($, on) => {
  const w = featureWorld(on, { surfaces: [] })
  await startSession($)
  const { text } = await $.command.run({ command: 'craftory', args: '' } as never)
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
    ].join('\n'),
  )
})

test('with no feature or no plugin the reply says how to start', async ($, on) => {
  world(on, { surfaces: [] })
  await startSession($)
  const { text } = await $.command.run({ command: 'craftory', args: '' } as never)
  expect(text).toBe('Craftory needs mattpocock-skills 1.3.x.')
})
