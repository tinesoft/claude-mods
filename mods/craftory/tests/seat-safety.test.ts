import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { seatPlan } from '../src/build'
import { DEFAULT_CONFIG } from '../src/config'
import type { IssueRef } from '../types'
import { building, start } from './build-harness'
import { mountBand, texts } from './harness'

const config = (worktrees: Record<string, unknown>) => ({
  '.craftory/config.json': JSON.stringify({ worktrees }),
})

const cardText = async ($: Engine) => {
  const band = await mountBand($, 'terminal', 200, 60)
  await band.press({ key: 'phase-build' })
  return texts(await mountBand($, 'terminal', 200, 60))
}

const copies = (ran: string[][]) => ran.filter(argv => argv[0] === 'cp')

test('copy entries that leave the repo or reach into .git are dropped from the plan and named', () => {
  const plan = seatPlan({
    config: {
      ...DEFAULT_CONFIG,
      worktrees: {
        ...DEFAULT_CONFIG.worktrees,
        copy: [
          '.env.local',
          './config/dev.env',
          '/etc/passwd',
          '../secrets',
          'a/../../b',
          '.git/config',
          'x\\y',
        ],
      },
    },
    ref: '#43' as IssueRef,
    title: 'Export button',
    name: 'craftory-43-export-button',
    integrationBranch: 'feat/csv',
  })
  expect(plan.copy).toEqual(['.env.local', 'config/dev.env'])
  expect(plan.rejectedCopy).toEqual([
    '/etc/passwd',
    '../secrets',
    'a/../../b',
    '.git/config',
    'x\\y',
  ])
})

test('a committed copy list cannot copy a file from outside the repo into the worktree', async ($, on) => {
  const { w } = await building(on, $, {
    files: {
      ...config({ copy: ['../outside.txt', '/etc/hostname', '.env.local'] }),
      '.env.local': 'A=1',
      '../outside.txt': 'secret',
    },
  })
  await start($, 43, 'Export button')
  expect(copies(w.ran)).toEqual([
    ['cp', '--', '.env.local', '.worktrees/43-export-button/.env.local'],
  ])
  const words = await cardText($)
  expect(words).toContain(
    'Craftory did not copy ../outside.txt, /etc/hostname: not a file inside the repo',
  )
})

test('the first run of a setup command from the committed config asks, and Run is remembered', async ($, on) => {
  const asked: string[] = []
  const { w } = await building(on, $, {
    files: config({ setup: 'make bootstrap' }),
    ask: question => (asked.push(question), 'Run'),
  })
  await start($, 43, 'Export button')
  await start($, 44, 'Ledger tax')
  expect(asked).toEqual([
    'Run the setup command from .craftory/config.json in new worktrees? `make bootstrap`',
  ])
  expect(w.ranIn.filter(r => r.argv[0] === 'make').map(r => r.cwd)).toEqual([
    '/repo/.worktrees/43-export-button',
    '/repo/.worktrees/44-ledger-tax',
  ])
  expect(w.store.get('setupApproved:make bootstrap')).toBe(true)
})

test('Skip runs no setup, still starts the agent, and says so on the card', async ($, on) => {
  const { w } = await building(on, $, {
    files: config({ setup: 'make bootstrap' }),
    ask: () => 'Skip',
  })
  const result = await start($, 43, 'Export button')
  expect(result).toMatchObject({ agentId: 'agent-tu43' })
  expect(w.ran.some(argv => argv[0] === 'make')).toBe(false)
  expect(w.store.has('setupApproved:make bootstrap')).toBe(false)
  expect(await cardText($)).toContain(
    'Craftory skipped the setup command `make bootstrap`: you did not approve it',
  )
})

test('a question nobody can answer skips the setup instead of running it', async ($, on) => {
  const { w } = await building(on, $, { files: config({ setup: 'make bootstrap' }) })
  const result = await start($, 43, 'Export button')
  expect(result).toMatchObject({ agentId: 'agent-tu43' })
  expect(w.ran.some(argv => argv[0] === 'make')).toBe(false)
})

test('an approval from an earlier session is honoured without asking', async ($, on) => {
  const { w } = await building(on, $, {
    files: config({ setup: 'make bootstrap' }),
    store: { 'setupApproved:make bootstrap': true },
  })
  await start($, 43, 'Export button')
  expect(w.ran.some(argv => argv[0] === 'make')).toBe(true)
})

test("the default setup command is the mod's own and runs without asking", async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  expect(w.ran.some(argv => argv[0] === 'pnpm')).toBe(true)
})
