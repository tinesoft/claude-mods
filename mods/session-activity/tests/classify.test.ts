import { expect, test } from 'claude-code/testing'
import {
  callSummary,
  commandName,
  fromHook,
  fromInstructions,
  fromMemoryWrite,
  fromPermission,
  fromSpawn,
  stopNotice,
  hookTarget,
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
  expect(commandName('npx lint-staged')).toBe('lint-staged')
  expect(commandName('npx --yes lint-staged')).toBe('lint-staged')
  expect(commandName('pnpm exec eslint .')).toBe('eslint')
  expect(commandName('pnpm dlx prettier --check .')).toBe('prettier')
  expect(commandName('npm run lint')).toBe('lint')
  expect(commandName('yarn lint')).toBe('lint')
  expect(commandName('bunx tsc --noEmit')).toBe('tsc')
  expect(commandName('uv run ruff check')).toBe('ruff')
  expect(commandName('npx')).toBe('npx')
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

test('non-tool hook matchers are tested against the start source or compaction trigger', () => {
  const start = {
    hooks: {
      SessionStart: [{ matcher: 'compact', hooks: [{ type: 'command', command: 'a.sh' }] }],
    },
  }
  expect(hookCommands(start, 'SessionStart', hookTarget({ source: 'startup' }))).toEqual([])
  expect(hookCommands(start, 'SessionStart', hookTarget({ source: 'compact' }))).toEqual(['a.sh'])
  expect(hookTarget({ tool_name: 'Bash', source: 'x' })).toBe('Bash')
})

test('prompt and http hooks count as configured', () => {
  const settings = {
    hooks: {
      Stop: [
        {
          hooks: [
            { type: 'prompt', prompt: 'check' },
            { type: 'http', url: 'u' },
          ],
        },
      ],
    },
  }
  expect(hookCommands(settings, 'Stop')).toEqual(['prompt hook', 'http hook'])
})

test('a subagent with no id to wait on is not shown as running', () => {
  const e = {
    subagentType: 'Explore',
    description: 'x',
    background: false,
    provider: { plugin: 'engine' },
  }
  expect(fromSpawn(e, undefined).status).toBe('ok')
  expect(fromSpawn(e, 'a1').status).toBe('running')
})

test('a write to CLAUDE.md or a memory markdown file is a memory chip', () => {
  expect(fromMemoryWrite('Edit', { file_path: '/repo/CLAUDE.md' })).toMatchObject({
    kind: 'memory',
    label: 'Remembered: CLAUDE.md',
    source: '/repo/CLAUDE.md',
  })
  expect(fromMemoryWrite('Write', { file_path: '/repo/CLAUDE.local.md' })?.kind).toBe('memory')
  expect(
    fromMemoryWrite('MultiEdit', { file_path: '/home/me/.claude/memory/prefs.md' })?.label,
  ).toBe('Remembered: prefs.md')
})

test('other writes, and reads of memory files, are not memory chips', () => {
  expect(fromMemoryWrite('Write', { file_path: '/repo/README.md' })).toBeUndefined()
  expect(fromMemoryWrite('Write', { file_path: '/repo/memory/data.json' })).toBeUndefined()
  expect(fromMemoryWrite('Read', { file_path: '/repo/CLAUDE.md' })).toBeUndefined()
})

test('a stopped action has a one-line notice; a quiet one has none', () => {
  expect(stopNotice({ status: 'blocked', label: 'block-secrets', meta: 'PreToolUse · Bash' })).toBe(
    '↯ block-secrets blocked Bash',
  )
  expect(stopNotice({ status: 'denied', label: 'rm -rf', meta: 'Bash' })).toBe(
    '⚷ Bash denied: rm -rf',
  )
  expect(stopNotice({ status: 'ok', label: 'x' })).toBeUndefined()
})
