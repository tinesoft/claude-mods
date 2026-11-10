import { expect, test } from 'claude-code/testing'
import { building, fakeGit, start } from './build-harness'
import {
  featureWorld,
  IN_RANGE,
  MATT_SKILLS,
  mattCommands,
  SETUP_FILES,
  startSession,
  world,
} from './harness'

const SLOW_MS = 30_000

const gitList = (argv: readonly string[]) => argv[0] === 'git' && argv[2] === 'list'

const complete = (extra: Record<string, unknown> = {}) => ({
  answer: 'ok',
  durationMs: 1,
  isAborted: false,
  turnId: 't',
  reason: 'answer',
  ...extra,
})

test('session start returns before the slow git read finishes, which then lands', async ($, on) => {
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    stall: { when: gitList, ms: SLOW_MS },
  })
  let returned = false
  void $.session.start({ cwd: '/repo', surface: 'terminal' } as never).then(() => (returned = true))
  await w.clock.settle()
  expect(returned).toBe(true)
  const listed = () => w.ran.filter(argv => argv.join(' ') === 'git worktree list --porcelain')
  expect(listed()).toHaveLength(1)
  await w.clock.advance(SLOW_MS)
  expect(w.statuses.at(-1)).toContain('Export invoices as CSV')
})

test('a subagent that finishes does not hold its turn.complete for the git read', async ($, on) => {
  let isStalled = false
  const { w } = await building(on, $, {
    stall: { when: argv => isStalled && gitList(argv), ms: SLOW_MS },
  })
  await start($, 43, 'Export button')
  isStalled = true
  let finished = false
  void $.turn.complete(complete({ agentId: 'agent-tu43' }) as never).then(() => (finished = true))
  await w.clock.settle()
  expect(finished).toBe(true)
  await w.clock.advance(SLOW_MS * 2)
})

test('the main turn ending does not hold turn.complete for the tracker read', async ($, on) => {
  let isStalled = false
  const w = world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    files: { ...SETUP_FILES, 'docs/agents/issue-tracker.md': '# Issue tracker: GitHub\n' },
    gh: () => ({ exitCode: 0, stdout: '[]' }),
    stall: { when: argv => isStalled && argv[0] === 'gh', ms: SLOW_MS },
  })
  await startSession($)
  isStalled = true
  let finished = false
  void $.turn.complete(complete() as never).then(() => (finished = true))
  await w.clock.settle()
  expect(finished).toBe(true)
  await w.clock.advance(SLOW_MS * 2)
})

test('with the deny rules on, Edit, Write and Skill calls do not wait on a slow git read', async ($, on) => {
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    stall: { when: gitList, ms: SLOW_MS },
    files: {
      '.craftory/config.json': JSON.stringify({
        deny: { skipGate: true, editOnIntegrationBranch: true },
      }),
    },
  })
  void $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  await w.clock.settle()
  let answered = 0
  for (const call of [
    { tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/src/app.ts' },
    { tool: 'Write', tool_use_id: 'w1', file_path: '/repo/README.md' },
    { tool: 'Skill', tool_use_id: 's1', skill: 'mattpocock-skills:to-tickets' },
  ])
    void $.tool.call(call as never).then(() => answered++)
  await w.clock.settle()
  expect(answered).toBe(3)
  await w.clock.advance(SLOW_MS * 2)
})

test('an implementer that finishes does not hold its turn.complete for worktrees.test', async ($, on) => {
  const TEST_MS = 30_000
  const isTest = (argv: readonly string[]) => argv[0] === 'pnpm' && argv[1] === 'test'
  const { w } = await building(on, $, {
    files: {
      '.craftory/config.json': JSON.stringify({
        worktrees: { test: 'pnpm test', testTimeoutSec: 30 },
      }),
    },
    stall: { when: isTest, ms: TEST_MS - 1 },
  })
  await start($, 43, 'Export button')
  let finished = false
  void $.turn.complete(complete({ agentId: 'agent-tu43' }) as never).then(() => (finished = true))
  await w.clock.settle()
  expect(finished).toBe(true)
  expect(w.sent).toHaveLength(0)
  expect(w.submitted).toHaveLength(0)
  await w.clock.advance(TEST_MS)
  expect(w.ran.filter(isTest)).toHaveLength(1)
})

test('a main step past 80% with the handoff on does not wait on the git or tracker reads', async ($, on) => {
  let isStalled = false
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    stall: { when: argv => isStalled && (gitList(argv) || argv[0] === 'gh'), ms: SLOW_MS },
    window: 200_000,
    usage: () => ({
      input_tokens: 1_000,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 170_000,
    }),
    files: { '.craftory/config.json': JSON.stringify({ automation: { handoffAt80: true } }) },
  })
  await startSession($)
  isStalled = true
  let finished = false
  void (async () => {
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'opus', messageCount: 1 } as never)
    const steps = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
    while (!(await steps.next()).done);
    finished = true
  })()
  await w.clock.settle()
  expect(finished).toBe(true)
  await w.clock.advance(SLOW_MS * 2)
})

const ARCHITECTURE_ON = {
  '.craftory/config.json': JSON.stringify({ automation: { weeklyArchitecture: true } }),
}

test('session start with the weekly architecture check on returns before the slow git read', async ($, on) => {
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    stall: { when: gitList, ms: SLOW_MS },
    files: ARCHITECTURE_ON,
  })
  let returned = false
  void $.session.start({ cwd: '/repo', surface: 'terminal' } as never).then(() => (returned = true))
  await w.clock.settle()
  expect(returned).toBe(true)
  await w.clock.advance(SLOW_MS)
})

test('the architecture check reporting done does not hold turn.complete for the git or tracker reads', async ($, on) => {
  let isStalled = false
  const w = featureWorld(on, {
    shell: fakeGit().shell,
    stall: { when: argv => isStalled && (gitList(argv) || argv[0] === 'gh'), ms: SLOW_MS },
    files: ARCHITECTURE_ON,
  })
  await startSession($)
  await $.skill.prompt({
    skill: 'mattpocock-skills:improve-codebase-architecture',
    text: '',
    frontmatter: {},
    source: 'plugin',
  } as never)
  isStalled = true
  let finished = false
  void $.turn.complete(complete() as never).then(() => (finished = true))
  await w.clock.settle()
  expect(finished).toBe(true)
  expect(w.writes.map(x => x.path)).toContain('.craftory/state.json')
  await w.clock.advance(SLOW_MS * 2)
})
