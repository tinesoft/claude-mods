import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { building, fakeGit, start } from './build-harness'
import { mountBand, texts, turnComplete, type WorldOptions } from './harness'

const HOUR = 3_600_000

type Outcome = { exitCode: number; stdout?: string; stderr?: string } | 'hang'

/** A repo whose `pnpm test` answers with `outcomes` in turn, the last one repeating. */
const testing = async (
  on: Parameters<typeof building>[0],
  $: Engine,
  outcomes: Outcome[],
  config: Record<string, unknown> = { worktrees: { test: 'pnpm test' } },
  extra: WorldOptions = {},
) => {
  const git = fakeGit()
  const runs: { cwd: string | undefined }[] = []
  let started = 0
  const isTest = (argv: readonly string[]) => argv[0] === 'pnpm' && argv[1] === 'test'
  const current = () => outcomes[Math.min(started - 1, outcomes.length - 1)]!
  const built = await building(on, $, {
    files: { '.craftory/config.json': JSON.stringify(config) },
    shell: (argv, cwd) => {
      if (!isTest(argv)) return git.shell(argv, cwd)
      runs.push({ cwd })
      const outcome = current()
      return outcome === 'hang' ? { exitCode: 0 } : outcome
    },
    // the harness asks this once per command, before it answers
    stall: { when: argv => isTest(argv) && ++started > 0 && current() === 'hang', ms: HOUR },
    ...extra,
  })
  return { ...built, runs }
}

const openCard = async ($: Engine) => {
  const band = await mountBand($, 'terminal', 200, 60)
  await band.press({ key: 'phase-build' })
  return mountBand($, 'terminal', 200, 60)
}

const FAILING = {
  exitCode: 1,
  stdout: 'running 12 tests\nok 1 export\n',
  stderr: 'FAIL ledger.test.ts\nexpected 12 to be 13\n',
}

test('a failing test run after an implementer finishes marks its ticket Failed with the output tail', async ($, on) => {
  const { w, runs } = await testing(on, $, [FAILING])
  await start($, 43, 'Export button')
  await turnComplete($, { agentId: 'agent-tu43' })
  await w.clock.settle()
  expect(runs).toHaveLength(1)
  expect(runs[0]!.cwd).toContain('.claude/worktrees/csv-01-export-button')
  const words = await texts(await openCard($))
  expect(words).toContain('[Failed]')
  expect(words.join(' ')).toContain('expected 12 to be 13')
})

const PASSING = { exitCode: 0, stdout: 'all 12 passed\n' }
const WORKTREE = '.claude/worktrees/csv-01-export-button'

test('a test run past worktrees.testTimeoutSec marks the ticket Failed, timed out', async ($, on) => {
  const { w } = await testing(on, $, ['hang'], {
    worktrees: { test: 'pnpm test', testTimeoutSec: 30 },
  })
  await start($, 43, 'Export button')
  await turnComplete($, { agentId: 'agent-tu43' })
  await w.clock.advance(30_000)
  const words = await texts(await openCard($))
  expect(words).toContain('[Failed]')
  expect(words.join(' ')).toContain('timed out')
})

test('the next turn of the implementer re-runs the tests, and a pass clears Failed', async ($, on) => {
  const { w, runs } = await testing(on, $, [FAILING, PASSING])
  await start($, 43, 'Export button')
  await turnComplete($, { agentId: 'agent-tu43' })
  await w.clock.settle()
  expect(await texts(await openCard($))).toContain('[Failed]')
  await turnComplete($, { agentId: 'agent-tu43' })
  await w.clock.settle()
  expect(runs).toHaveLength(2)
  const words = await texts(await mountBand($, 'terminal', 200, 60))
  expect(words).not.toContain('[Failed]')
  expect(words).toContain('[Done]')
  expect(words.join(' ')).not.toContain('expected 12 to be 13')
})

test('with worktrees.test unset nothing runs and the ticket is Done', async ($, on) => {
  const { w, runs } = await testing(on, $, [FAILING], {})
  await start($, 43, 'Export button')
  await turnComplete($, { agentId: 'agent-tu43' })
  await w.clock.settle()
  expect(runs).toHaveLength(0)
  expect(await texts(await openCard($))).toContain('[Done]')
  const record = JSON.parse(w.files.get('.craftory/features/csv.json')!)
  expect(record.agents['csv/01'].test).toBeUndefined()
})

test('the main session ending its turn and an agent stopped mid-run run no tests', async ($, on) => {
  const { w, runs } = await testing(on, $, [PASSING])
  await start($, 43, 'Export button')
  await turnComplete($)
  await turnComplete($, { agentId: 'agent-tu43', reason: 'aborted' })
  await turnComplete($, { agentId: 'agent-unknown' })
  await w.clock.settle()
  expect(runs).toHaveLength(0)
})

const removeWorktree = ($: Engine) =>
  $.tool.call({ tool: 'Bash', command: `git worktree remove ${WORKTREE}` } as never)

test('keepFailed keeps the worktree of a ticket whose tests failed', async ($, on) => {
  const { w } = await testing(on, $, [FAILING])
  await start($, 43, 'Export button')
  await turnComplete($, { agentId: 'agent-tu43' })
  await w.clock.settle()
  expect((await removeWorktree($)).deny).toContain('its agent failed')
})

test('without keepFailed the worktree of a failed ticket can be removed', async ($, on) => {
  const { w } = await testing(on, $, [FAILING], {
    worktrees: { test: 'pnpm test', keepFailed: false },
  })
  await start($, 43, 'Export button')
  await turnComplete($, { agentId: 'agent-tu43' })
  await w.clock.settle()
  expect((await removeWorktree($)).deny).toBeUndefined()
})
