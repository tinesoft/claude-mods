import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { mountPane, session, stubEngine } from './harness'

const HOOKS = {
  hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: 'bash .claude/hooks/block-secrets.sh' }] }],
  },
}

const NOWHERE = [] as const

const blocking = (on: Parameters<typeof session>[0]) =>
  on('classic.PreToolUse', ($, e, next) =>
    (e as { command?: string }).command === 'cat .env' ? { deny: 'reads a secret' } : next(e),
  )

const activity = async ($: Engine) => {
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  await $.tool.call({ tool: 'mcp__github__get_pull_request' } as never)
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
}

const answer = (agentId?: string) =>
  ({ answer: 'done', reason: 'answer', ...(agentId && { agentId }) }) as never

test('with nothing to draw on, /session-activity replies with the tray as Markdown', async ($, on) => {
  session(on, HOOKS, new Map(), 'dark', NOWHERE)
  const { opened } = stubEngine(on)
  blocking(on)
  await activity($)
  const { text = '' } = await $.command.run({ command: 'session-activity', args: '' } as never)
  expect(opened).toEqual([])
  expect(text).toContain('### Skills (1)')
  expect(text).toContain('- ▤ docx')
  expect(text).toContain('### MCP (1)')
  expect(text).toContain('**BLOCKED**')
})

test('with nothing recorded the reply says so', async ($, on) => {
  session(on, {}, new Map(), 'dark', NOWHERE)
  stubEngine(on)
  const { text } = await $.command.run({ command: 'session-activity', args: '' } as never)
  expect(text).toBe('Nothing has activated yet in this session.')
})

test('on a terminal /session-activity still opens the pane', async ($, on) => {
  session(on, HOOKS, new Map(), 'dark', ['terminal'])
  const { opened } = stubEngine(on)
  const { text } = await $.command.run({ command: 'session-activity', args: '' } as never)
  expect(opened).toEqual(['session-activity'])
  expect(text).toBe('Opened the session activity pane.')
})

test(
  'text_summary adds one activity line beneath each main-loop answer',
  { options: { text_summary: true } },
  async ($, on) => {
    session(on, HOOKS, new Map(), 'dark', NOWHERE)
    stubEngine(on)
    blocking(on)
    await activity($)
    const first = await $.turn.complete(answer())
    expect(first.text).toMatch(/^Activity: .*▤ docx/)
    expect(first.text).toContain('BLOCKED')
    expect(first.text).not.toContain('\n')
    expect(first.text).not.toContain('done')
  },
)

test(
  'text_summary adds nothing for subagent turns or an empty session',
  { options: { text_summary: true } },
  async ($, on) => {
    session(on, HOOKS, new Map(), 'dark', NOWHERE)
    stubEngine(on)
    blocking(on)
    expect((await $.turn.complete(answer())).text).toBe('done')
    await activity($)
    expect((await $.turn.complete(answer('agent-1'))).text).toBe('done')
  },
)

test('text_summary is off by default', async ($, on) => {
  session(on, HOOKS, new Map(), 'dark', NOWHERE)
  stubEngine(on)
  blocking(on)
  await activity($)
  expect((await $.turn.complete(answer())).text).toBe('done')
})

test(
  'text_summary stays quiet where the session draws',
  { options: { text_summary: true } },
  async ($, on) => {
    session(on, HOOKS, new Map(), 'dark', ['desktop'])
    stubEngine(on)
    blocking(on)
    await activity($)
    expect((await $.turn.complete(answer())).text).toBe('done')
  },
)

test('the settings tab switch turns the text summary on', async ($, on) => {
  session(on, HOOKS, new Map(), 'dark', NOWHERE)
  stubEngine(on)
  blocking(on)
  await activity($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-text-summary' })
  expect((await $.turn.complete(answer())).text).toMatch(/^Activity: /)
})
