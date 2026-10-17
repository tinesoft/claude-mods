import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { chipTexts, stubEngine, mountBand, mountPane, session } from './harness'

const band = async ($: Engine) => chipTexts(await mountBand($, 'terminal', 200))

const spawn = (description: string, subagentType = 'code-reviewer') => ({
  tool_use_id: `tu-${description}`,
  prompt: 'review',
  description,
  subagentType,
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'opus',
  background: false,
  fork: false,
})

test('two calls to one MCP server record one github chip counted twice', async ($, on) => {
  session(on)
  stubEngine(on)
  await $.tool.call({ tool: 'mcp__github__get_pull_request', number: 418 } as never)
  await $.tool.call({ tool: 'mcp__github__create_review', number: 418 } as never)
  expect(await band($)).toEqual(['chip-mcp-github|⇌ github ×2'])
})

test('a skill Claude loads becomes a skill chip', async ($, on) => {
  session(on)
  stubEngine(on)
  await $.skill.prompt({
    skill: 'docx',
    text: 'x',
    frontmatter: {},
    source: 'plugin',
    pluginName: 'anthropic-skills',
  } as never)
  expect(await band($)).toEqual(['chip-skill-docx|▤ docx'])
})

test('a subagent chip runs until its turn completes', async ($, on) => {
  session(on)
  stubEngine(on)
  await $.agent.spawn(spawn('pr'))
  expect(await band($)).toEqual(['chip-agent-code-reviewer|◉ code-reviewer RUNNING'])
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1,
    isAborted: false,
    turnId: 't',
    agentId: 'agent-pr',
    reason: 'answer',
  })
  expect(await band($)).toEqual(['chip-agent-code-reviewer|◉ code-reviewer'])
})

test('a denied tool call records a denied permission chip', async ($, on) => {
  session(on)
  stubEngine(on, { verdict: { decision: 'deny', rule: 'Bash(rm:*)' } })
  await $.tool.check({
    tool: 'Bash',
    input: { command: 'rm -rf build' },
    tool_use_id: 'tu1',
  } as never)
  expect(await band($)).toEqual(['chip-perm-Bash(rm:*)|⚷ rm -rf DENIED '])
})

test('an asked call that runs ends as approved, not pending', async ($, on) => {
  session(on)
  stubEngine(on, { verdict: { decision: 'ask' } })
  await $.tool.check({ tool: 'Bash', input: { command: 'git push' }, tool_use_id: 'tu2' } as never)
  expect(await band($)).toEqual(['chip-perm-Bash:git push|⚷ git push RUNNING'])
  await $.tool.call({ tool: 'Bash', command: 'git push', tool_use_id: 'tu2' } as never)
  expect(await band($)).toEqual(['chip-perm-Bash:git push|⚷ git push'])
})

test('a PreToolUse hook that blocks shows its script name and BLOCKED', async ($, on) => {
  session(on, {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'bash .claude/hooks/block-secrets.sh' }],
        },
      ],
    },
  })
  stubEngine(on)
  on('classic.PreToolUse', ($, e, next) =>
    (e as { command?: string }).command === 'cat .env' ? { deny: 'reads a secret' } : next(e),
  )
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
  expect(await band($)).toEqual(['chip-hook-PreToolUse|↯ block-secrets ×2 BLOCKED '])
})

test('settings hooks that are not configured record nothing', async ($, on) => {
  session(on)
  stubEngine(on)
  await $.classic.Stop({ stop_hook_active: false } as never)
  expect(await band($)).toEqual([])
})

test('each instruction file load becomes a rule chip with its line count', async ($, on) => {
  session(on)
  stubEngine(on)
  await $.classic.InstructionsLoaded({
    file_path: '/repo/CLAUDE.md',
    memory_type: 'Project',
    load_reason: 'session_start',
  } as never)
  await $.classic.InstructionsLoaded({
    file_path: '/repo/.claude/rules/testing.md',
    memory_type: 'Project',
    load_reason: 'path_glob_match',
  } as never)
  expect(await band($)).toEqual([
    'chip-rule-/repo/CLAUDE.md|▣ CLAUDE.md',
    'chip-rule-/repo/.claude/rules/testing.md|▣ .claude/rules/testing.md',
  ])
  const pane = await mountPane($)
  await pane.press({ key: 'row-rule-/repo/CLAUDE.md' })
  expect((await pane.findAll({ type: 'Text' })).map(t => t.text)).toContain(
    'Loaded at session start · 3 lines.',
  )
})

test('optional types stay off by default', async ($, on) => {
  session(on)
  stubEngine(on)
  await $.command.run({ command: 'review', args: '' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true } as never)
  expect(await band($)).toEqual([])
})

test(
  'optional types show once turned on',
  { options: { show_commands: true, show_background: true } },
  async ($, on) => {
    session(on)
    stubEngine(on)
    await $.command.run({ command: 'review', args: '' } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true } as never)
    expect(await band($)).toEqual([
      'chip-command-review|/ /review',
      'chip-background-npm run|▶ npm run',
    ])
  },
)

test('every observed event reaches the caller exactly as the engine answered it', async ($, on) => {
  session(on, { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x.sh' }] }] } })
  stubEngine(on, { verdict: { decision: 'ask', reason: 'why' }, stop: { block: 'keep going' } })
  expect(await $.tool.call({ tool: 'mcp__github__get_issue' } as never)).toEqual({ result: 'ran' })
  expect(
    await $.tool.check({ tool: 'Bash', input: { command: 'x' }, tool_use_id: 't' } as never),
  ).toEqual({ decision: 'ask', reason: 'why' })
  expect(
    await $.skill.prompt({ skill: 'docx', text: 'x', frontmatter: {}, source: 'plugin' } as never),
  ).toEqual({ text: 'body of docx' })
  expect(await $.agent.spawn(spawn('a'))).toEqual({ model: 'haiku', agentId: 'agent-a' })
  expect(await $.classic.Stop({ stop_hook_active: false } as never)).toEqual({
    block: 'keep going',
  })
  expect(await $.command.run({ command: 'review', args: 'x' } as never)).toEqual({ text: 'ran' })
})
