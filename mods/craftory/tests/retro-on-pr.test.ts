import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  allText,
  bandProps,
  featureJson,
  featureWorld,
  mountBand,
  skillPrompt,
  startSession,
  turnComplete,
} from './harness'

const RETRO = 'The pull request merged · run a retro while it is fresh'

const config = (retroOnPr: boolean) => JSON.stringify({ automation: { retroOnPr } })

/** A GitHub Feature whose PR is #50 on `feat/csv`; `pr.state` is what `gh pr view` says now. */
const github = (
  on: Parameters<typeof featureWorld>[0],
  pr: { state: string },
  options: { on?: boolean; feature?: Record<string, unknown> } = {},
) =>
  featureWorld(on, {
    files: {
      'docs/agents/issue-tracker.md': '# Issue tracker: GitHub\n',
      '.craftory/config.json': config(options.on ?? true),
      '.craftory/features/csv.json': featureJson({ spec: '#42', ...options.feature }),
    },
    gh: argv => {
      if (argv[1] === 'pr')
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            number: 50,
            url: 'https://github.com/acme/app/pull/50',
            headRefName: 'feat/csv',
            baseRefName: 'main',
            isDraft: false,
            state: pr.state,
          }),
        }
      return { exitCode: 0, stdout: '[]' }
    },
  })

/** The agent merges the PR during a turn: the `gh` call refreshes the tracker, then the turn ends. */
const mergeInSession = async ($: Engine, pr: { state: string }) => {
  pr.state = 'MERGED'
  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 50 --squash' } as never)
  await turnComplete($)
}

/** The Feature as Craftory last wrote it. */
const stored = (w: { writes: { path: string; text: string }[] }) =>
  JSON.parse(w.writes.filter(x => x.path.startsWith('.craftory/features/')).at(-1)!.text)

const band = async ($: Engine) => allText(await mountBand($, 'terminal', 200))

const working = async ($: Engine) =>
  allText(
    await $.ui.mount({
      plugin: 'craftory',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { ...bandProps(200), isWorking: true },
    }),
  )

test('a PR merged in the session offers Run retro once the turn is idle, which submits /retro', async ($, on) => {
  const pr = { state: 'OPEN' }
  const w = github(on, pr)
  await startSession($)
  expect(await band($)).not.toContain(RETRO)
  await mergeInSession($, pr)
  expect(await working($)).not.toContain(RETRO)
  expect(await band($)).toContain(RETRO)
  expect(w.commandsRun).toEqual([])
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-run-retro' })
  expect(w.commandsRun).toEqual([{ command: 'mattpocock-skills:retro', args: '' }])
  expect(await band($)).not.toContain(RETRO)
})

test('a PR merged while away is offered at session start', async ($, on) => {
  github(on, { state: 'MERGED' })
  await startSession($)
  expect(await band($)).toContain(RETRO)
})

test('with the switch off a merged PR raises nothing', async ($, on) => {
  const pr = { state: 'OPEN' }
  const w = github(on, pr, { on: false })
  await startSession($)
  await mergeInSession($, pr)
  expect(await band($)).not.toContain(RETRO)
  await startSession($)
  expect(await band($)).not.toContain(RETRO)
  expect(w.commandsRun).toEqual([])
})

test('an open PR raises nothing', async ($, on) => {
  github(on, { state: 'OPEN' })
  await startSession($)
  expect(await band($)).not.toContain(RETRO)
})

test('one notice per Feature: later refreshes and new sessions do not raise it again after the click', async ($, on) => {
  const w = github(on, { state: 'MERGED' })
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-run-retro' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr view 50' } as never)
  await turnComplete($)
  expect(await band($)).not.toContain(RETRO)
  await startSession($)
  expect(await band($)).not.toContain(RETRO)
  expect(w.commandsRun).toHaveLength(1)
})

test('a dismiss is final for the Feature, across sessions', async ($, on) => {
  const w = github(on, { state: 'MERGED' })
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-dismiss-retro' })
  expect(await band($)).not.toContain(RETRO)
  expect(stored(w).retroOffered).toBe(true)
  await startSession($)
  expect(await band($)).not.toContain(RETRO)
  expect(w.commandsRun).toEqual([])
})

test('a notice never answered comes back in the next session', async ($, on) => {
  github(on, { state: 'MERGED' })
  await startSession($)
  expect(await band($)).toContain(RETRO)
  await startSession($)
  expect(await band($)).toContain(RETRO)
})

test('a Feature whose retro already ran is not offered one', async ($, on) => {
  github(
    on,
    { state: 'MERGED' },
    {
      feature: { marks: { retro: { ranAt: '2026-10-24T11:00:00Z' } } },
    },
  )
  await startSession($)
  expect(await band($)).not.toContain(RETRO)
})

test('the Retro phase completes from the ranked suggestions /retro produced', async ($, on) => {
  const w = github(on, { state: 'MERGED' })
  await startSession($)
  await skillPrompt($, 'retro')
  await turnComplete($, {
    answer: 'Ranked:\n1. Keep tickets small\n2. Pin the CLI\n3. Fewer mocks',
  })
  const record = stored(w)
  expect(record.marks.retro.artifacts).toEqual(['3 ranked suggestions'])
})
