import { expect, test } from 'claude-code/testing'
import {
  callSummary,
  commandName,
  fromHook,
  fromInstructions,
  fromPermission,
  hookCommands,
  mcpParts,
} from '../src/classify'

test('an MCP tool name splits into server and tool', () => {
  expect(mcpParts('mcp__github__get_pull_request')).toEqual({
    server: 'github',
    name: 'get_pull_request',
  })
  expect(mcpParts('mcp__claude_ai_Gmail__search')).toEqual({
    server: 'claude_ai_Gmail',
    name: 'search',
  })
  expect(mcpParts('Bash')).toBeUndefined()
})

test('call summaries name what the call does', () => {
  expect(callSummary('Bash', { command: 'FOO=1 git push origin main' }, '/repo')).toBe('git push')
  expect(callSummary('Edit', { file_path: '/repo/src/app.ts' }, '/repo')).toBe('src/app.ts')
  expect(callSummary('WebFetch', { url: 'https://docs.example.com/a' }, '/repo')).toBe(
    'docs.example.com',
  )
  expect(callSummary('mcp__github__create_review', {}, '/repo')).toBe('github · create_review')
})

test('a hook command is named by its script', () => {
  expect(commandName('bash .claude/hooks/block-secrets.sh --strict')).toBe('block-secrets')
  expect(commandName('npx lint-staged')).toBe('npx')
  expect(commandName('node ./scripts/check.mjs')).toBe('check')
})

const settings = {
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'a.sh' }] },
      { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'b.sh' }] },
      { hooks: [{ type: 'command', command: 'c.sh' }] },
    ],
  },
}

test('only commands whose matcher admits the tool count as run', () => {
  expect(hookCommands(settings, 'PreToolUse', 'Bash')).toEqual(['a.sh', 'c.sh'])
  expect(hookCommands(settings, 'PreToolUse', 'Write')).toEqual(['b.sh', 'c.sh'])
  expect(hookCommands(settings, 'Stop')).toEqual([])
  expect(hookCommands(null, 'Stop')).toEqual([])
})

test('a hook event with nothing configured and nothing blocked records no chip', () => {
  expect(fromHook('Stop', [], {}, undefined)).toBeUndefined()
  expect(fromHook('PreToolUse', [], { blocked: 'no' }, 'Bash')).toMatchObject({
    label: 'PreToolUse hooks',
    status: 'blocked',
  })
  expect(fromHook('PreToolUse', ['bash x/block-secrets.sh'], {}, 'Bash')).toMatchObject({
    label: 'block-secrets',
    meta: 'PreToolUse · Bash',
    status: 'ok',
  })
})

test('a hook that allowed or denied a call leaves it to the hook chip', () => {
  const input = { command: 'cat .env' }
  expect(
    fromPermission('Bash', input, { decision: 'deny', hook: 'PreToolUse' }, '/repo', 'tu'),
  ).toBeUndefined()
  expect(
    fromPermission('Bash', input, { decision: 'allow', hook: 'PreToolUse' }, '/repo', 'tu'),
  ).toBeUndefined()
  expect(
    fromPermission('Bash', input, { decision: 'ask', hook: 'PreToolUse' }, '/repo', 'tu')?.status,
  ).toBe('running')
})

test('the mode allowing a call on its own records no permission chip', () => {
  expect(
    fromPermission('Read', { file_path: '/repo/a' }, { decision: 'allow' }, '/repo', 'tu'),
  ).toBeUndefined()
  expect(
    fromPermission(
      'Bash',
      { command: 'git push' },
      { decision: 'allow', rule: 'Bash(git push:*)' },
      '/repo',
      'tu',
    ),
  ).toMatchObject({
    key: 'Bash(git push:*)',
    label: 'git push',
    status: 'ok',
  })
  expect(
    fromPermission(
      'Bash',
      { command: 'rm -rf /' },
      { decision: 'deny', reason: 'nope' },
      '/repo',
      'tu',
    ),
  ).toMatchObject({
    key: 'Bash:rm -rf',
    status: 'denied',
  })
})

test('rule files inside the project show their relative path', () => {
  expect(
    fromInstructions(
      { path: '/repo/.claude/rules/testing.md', tier: 'Project', lines: 12 },
      '/repo',
    ),
  ).toMatchObject({
    label: '.claude/rules/testing.md',
    detail: 'Loaded at session start · 12 lines.',
    meta: 'project',
  })
  expect(
    fromInstructions({ path: '/home/me/.claude/CLAUDE.md', tier: 'user' }, '/repo').label,
  ).toBe('.claude/CLAUDE.md')
})
