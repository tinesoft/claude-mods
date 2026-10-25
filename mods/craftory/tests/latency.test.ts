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
