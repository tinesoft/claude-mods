import { expect, test } from 'claude-code/testing'
import { FRESH, mountBand, mountPane, session, stubEngine } from './harness'

for (const reason of ['clear', 'resume'] as const) {
  test(`activations are empty after ${reason}, and settings survive it`, async ($, on) => {
    const store = new Map<string, unknown>()
    session(on, {}, store)
    stubEngine(on)
    await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
    const pane = await mountPane($)
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'layout-summary' })
    await $.session.end({ reason, sessionId: 's1', resume: {} } as never)
    expect(await (await mountBand($)).find({ key: 'summary-mcp' })).toBeUndefined()
    await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
    expect((await (await mountBand($)).find({ key: 'summary-mcp' }))?.text).toBe('⇌1')
    expect(store.get('overrides')).toEqual({ layout: 'summary' })
  })
}

test('a plain exit keeps the activations', async ($, on) => {
  session(on)
  stubEngine(on)
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: {} } as never)
  expect(await (await mountBand($)).find({ key: 'chip-mcp-github' })).toBeDefined()
})

test('settings are reloaded from the store when a session starts, as after /clear', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, {}, store)
  const { status } = stubEngine(on)
  on('classic.SessionStart', () => ({}))
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  expect(status()).toBe('1 active · /session-activity')
  store.set('overrides', { enabled: false })
  await $.classic.SessionStart({ source: 'clear' } as never)
  expect(status()).toBeUndefined()
  expect(await (await mountBand($)).find({ key: 'chip-mcp-github' })).toBeUndefined()
})

test('activations and mutes are cleared when the session forks, as /branch does', async ($, on) => {
  const clock = session(on)
  const { status } = stubEngine(on)
  on('classic.SessionStart', () => ({}))
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  await clock.advance(FRESH)
  await (await mountBand($)).press({ key: 'chip-mcp-github' })
  await (await mountBand($)).press({ key: 'mute' })
  await $.classic.SessionStart({ source: 'fork' } as never)
  expect(status()).toBeUndefined()
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  expect((await (await mountBand($)).find({ key: 'chip-mcp-github' }))?.text).toBe('⇌ ● github')
})
