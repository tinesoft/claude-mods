import { expect, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import { chipTexts, FRESH, mountBand, session, stubEngine } from './harness'

const band = async ($: Engine, clock: MockClock) => {
  await clock.advance(FRESH)
  return chipTexts(await mountBand($, 'terminal', 200))
}

const step = async ($: Engine, model: string, agentId?: string) => {
  const input = { turnId: 't', index: 0, model, messageCount: 1, ...(agentId && { agentId }) }
  for await (const _ of $.turn.step(input as never) as AsyncIterable<unknown>) void _
}

const stubModel = (on: Parameters<typeof stubEngine>[0]) => {
  // eslint-disable-next-line require-yield -- a step that streams nothing still answers as a stream
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
}

test(
  'the model chip appears only when the model switches, named and untallied',
  { options: { show_model: true } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    stubModel(on)
    await step($, 'opus')
    await step($, 'opus')
    await step($, 'haiku', 'agent-1')
    expect(await band($, clock)).toEqual([])
    await step($, 'sonnet')
    await step($, 'sonnet')
    expect(await band($, clock)).toEqual(['model:model|≡ Model: sonnet'])
  },
)
