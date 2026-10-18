import { expect, test } from 'claude-code/testing'
import { mountPane, session, stubEngine } from './harness'

const HOOKS = {
  hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: 'bash .claude/hooks/block-secrets.sh' }] }],
  },
}

const blocking = (on: Parameters<typeof session>[0]) =>
  on('classic.PreToolUse', ($, e, next) =>
    (e as { command?: string }).command === 'cat .env' ? { deny: 'reads a secret' } : next(e),
  )

test('a blocked tool call shows one toast naming the hook and the tool', async ($, on) => {
  session(on, HOOKS)
  const { toasts } = stubEngine(on)
  blocking(on)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(toasts).toEqual([])
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  expect(toasts).toEqual(['↯ block-secrets blocked Bash'])
})

test('a denied tool check shows one toast', async ($, on) => {
  session(on)
  const { toasts } = stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
  await $.tool.check({
    tool: 'Bash',
    input: { command: 'rm -rf build' },
    tool_use_id: 'tu1',
  } as never)
  expect(toasts).toEqual(['⚷ Bash denied: rm -rf'])
})

test('an asked call that never ran shows a denied toast', async ($, on) => {
  session(on)
  const { toasts } = stubEngine(on, { verdict: { decision: 'ask' }, call: { deny: 'declined' } })
  await $.tool.check({ tool: 'Bash', input: { command: 'git push' }, tool_use_id: 'tu2' } as never)
  expect(toasts).toEqual([])
  await $.tool.call({ tool: 'Bash', command: 'git push', tool_use_id: 'tu2' } as never)
  expect(toasts).toEqual(['⚷ Bash denied: git push'])
})

test('allowed calls and loaded skills never toast', async ($, on) => {
  session(on)
  const { toasts } = stubEngine(on)
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  expect(toasts).toEqual([])
})

test('each repeat of a block toasts again', async ($, on) => {
  session(on, HOOKS)
  const { toasts } = stubEngine(on)
  blocking(on)
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  expect(toasts).toHaveLength(2)
})

test(
  'toast_on_block off silences the toast',
  { options: { toast_on_block: false } },
  async ($, on) => {
    session(on, HOOKS)
    const { toasts } = stubEngine(on)
    blocking(on)
    await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
    expect(toasts).toEqual([])
  },
)

test('the settings tab switch turns the toast off', async ($, on) => {
  session(on, HOOKS)
  const { toasts } = stubEngine(on)
  blocking(on)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-toast' })
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  expect(toasts).toEqual([])
})
