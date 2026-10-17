import { expect, test } from 'claude-code/testing'
import { engine, mountBand, mountPane, session } from './harness'

for (const reason of ['clear', 'resume'] as const) {
  test(`activations are empty after ${reason}, and settings survive it`, async ($, on) => {
    const store = new Map<string, unknown>()
    session(on, {}, store)
    engine(on)
    await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
    const pane = await mountPane($)
    await pane.press({ key: 'tab-settings' })
    await pane.select({ key: 'layout', value: 'summary' })
    await $.session.end({ reason, sessionId: 's1', resume: {} } as never)
    expect(await (await mountBand($)).find({ key: 'summary' })).toBeUndefined()
    await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
    expect((await (await mountBand($)).find({ key: 'summary' }))?.text).toBe('1 active · ⇌1')
    expect(store.get('overrides')).toEqual({ layout: 'summary' })
  })
}

test('a plain exit keeps the activations', async ($, on) => {
  session(on)
  engine(on)
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: {} } as never)
  expect(await (await mountBand($)).find({ key: 'chip-mcp-github' })).toBeDefined()
})
