import { expect, test } from 'claude-code/testing'
import { mountPane, session, stubEngine } from './harness'

test('the status line counts what the band shows and points at the command', async ($, on) => {
  session(on)
  const { status } = stubEngine(on)
  expect(status()).toBeUndefined()
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  expect(status()).toBe('1 active · /session-activity')
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  expect(status()).toBe('2 active · /session-activity')
})

test('the status line clears when chips are turned off and returns when they are back on', async ($, on) => {
  session(on)
  const { status } = stubEngine(on)
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-enabled' })
  expect(status()).toBeUndefined()
  await pane.press({ key: 'toggle-enabled' })
  expect(status()).toBe('1 active · /session-activity')
})

test('hiding a type drops its chips from the count', async ($, on) => {
  session(on)
  const { status } = stubEngine(on)
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-skill' })
  expect(status()).toBe('1 active · /session-activity')
})

test('the status line clears after /clear', async ($, on) => {
  session(on)
  const { status } = stubEngine(on)
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
  expect(status()).toBeUndefined()
})
