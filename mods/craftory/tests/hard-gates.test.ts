import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { reviewDenial, reviewOutflow, ruleVia } from '../src/deny'
import { DEFAULT_CONFIG } from '../src/config'
import {
  allText,
  featureWorld,
  mountBand,
  skillPrompt,
  startSession,
  submit,
  ticketFile,
  turnComplete,
} from './harness'

const hard = (deny: Record<string, boolean> = { hardGates: true }) => ({
  '.craftory/config.json': JSON.stringify({ deny }),
})

const DRAFT = {
  d1: {
    title: 'CSV export',
    entry: 'align',
    startedAt: '2026-10-24T09:00:00Z',
    marks: { align: { ranAt: '2026-10-24T10:00:00Z' } },
  },
}

const bash = ($: Engine, command: string) =>
  $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command } as never)

const merged = (n: number, title: string, blocked: number[] = []) =>
  ticketFile(n, title, blocked).replace('ready-for-agent', 'done')

const REVIEW_NOT_DONE = (what: string) =>
  `Craftory denied ${what}: Review is not done (csv/01, csv/02, csv/03 not merged yet), so the work is not ready for review. ` +
  'This is the deny.hardGates rule; turn it off in Settings › Automation, or set "deny": { "hardGates": false } in .craftory/config.json.'

test('reviewOutflow finds a ready PR or MR through the usual wrappers', () => {
  const found: [string, string | null][] = [
    ['gh pr create --title x', 'gh pr create'],
    ['rtk gh pr create', 'gh pr create'],
    ['GH_TOKEN=abc gh pr create --fill', 'gh pr create'],
    ['cd app && sudo gh pr create', 'gh pr create'],
    ['git push && gh pr create', 'gh pr create'],
    ['echo done | gh pr create', 'gh pr create'],
    ['gh pr create\ngh pr view', 'gh pr create'],
    ['gh pr ready 12', 'gh pr ready'],
    ['glab mr create --fill', 'glab mr create'],
    ['glab mr new', 'glab mr create'],
    ['rtk glab mr update 3 --ready', 'glab mr update --ready'],
  ]
  for (const [command, want] of found) expect(reviewOutflow(command)).toBe(want)
})

test('reviewOutflow lets drafts, reads and plain text through', () => {
  const passed = [
    'gh pr create --draft --fill',
    'gh pr create -d',
    'glab mr create --draft',
    'gh pr ready 12 --undo',
    'gh pr view 12',
    'gh pr list',
    'glab mr list',
    'glab mr view 3',
    'echo "gh pr create"',
    "printf 'glab mr create'",
    '"gh pr create"',
    'git commit -m "gh pr create"',
    'gh issue create',
    'gh api repos/o/r/pulls',
    '',
  ]
  for (const command of passed) expect(reviewOutflow(command)).toBeNull()
})

test('ruleVia names hardGates when it is on, else the rule itself, else nothing', () => {
  const deny = DEFAULT_CONFIG.deny
  expect(ruleVia(deny, 'skipGate')).toBeNull()
  expect(ruleVia({ ...deny, skipGate: true }, 'skipGate')).toBe('skipGate')
  expect(ruleVia({ ...deny, hardGates: true }, 'skipGate')).toBe('hardGates')
  expect(ruleVia({ ...deny, hardGates: true }, 'editOnIntegrationBranch')).toBe('hardGates')
})

test('reviewDenial lets through when the flow is unknown', () => {
  expect(reviewDenial('gh pr create', null)).toBeNull()
})

test('hardGates refuses gh pr create and glab mr create until Review is done', async ($, on) => {
  const w = featureWorld(on, { files: hard() })
  await startSession($)
  expect(await bash($, 'gh pr create --fill')).toEqual({ deny: REVIEW_NOT_DONE('gh pr create') })
  expect((await bash($, 'rtk glab mr create')).deny).toBe(REVIEW_NOT_DONE('glab mr create'))
  expect((await bash($, 'gh pr ready 4')).deny).toContain('Craftory denied gh pr ready')
  expect(w.calls.some(c => c.tool === 'Bash')).toBe(false)
})

test('hardGates lets a draft PR, a read and unrelated Bash calls through', async ($, on) => {
  featureWorld(on, { files: hard() })
  await startSession($)
  expect(await bash($, 'gh pr create --draft --fill')).toEqual({ result: 'ran' })
  expect(await bash($, 'gh pr view 3')).toEqual({ result: 'ran' })
  expect(await bash($, 'ls')).toEqual({ result: 'ran' })
})

test('with hardGates off, gh pr create runs', async ($, on) => {
  featureWorld(on, { files: hard({}) })
  await startSession($)
  expect(await bash($, 'gh pr create --fill')).toEqual({ result: 'ran' })
})

test('hardGates lets gh pr create through once Build and Review are done', async ($, on) => {
  featureWorld(on, {
    files: {
      ...hard(),
      '.scratch/csv/issues/01-button.md': merged(1, 'Export button'),
      '.scratch/csv/issues/02-ledger.md': merged(2, 'Ledger tax', [1]),
      '.scratch/csv/issues/03-filter.md': merged(3, 'Date filter', [1]),
    },
  })
  await startSession($)
  expect((await bash($, 'gh pr create --fill')).deny).toContain('Review is not done')
  await skillPrompt($, 'code-review')
  await turnComplete($)
  expect(await bash($, 'gh pr create --fill')).toEqual({ result: 'ran' })
})

test('hardGates fails open: an invalid config.json refuses nothing', async ($, on) => {
  featureWorld(on, { files: { '.craftory/config.json': '{nope' } })
  await startSession($)
  expect(await bash($, 'gh pr create --fill')).toEqual({ result: 'ran' })
})

test('hardGates fails open: a bad value for hardGates falls back to off', async ($, on) => {
  featureWorld(on, { files: hard({ hardGates: 'yes' } as never) })
  await startSession($)
  expect(await bash($, 'gh pr create --fill')).toEqual({ result: 'ran' })
})

test('hardGates turns on skipGate: the denial names hardGates, not skipGate', async ($, on) => {
  featureWorld(on, {
    files: { ...hard(), '.craftory/features/csv.json': '' },
    store: { drafts: DRAFT },
  })
  await startSession($)
  const result = await $.tool.call({
    tool: 'Skill',
    tool_use_id: 'sk1',
    skill: 'mattpocock-skills:to-tickets',
  } as never)
  expect(result.deny).toContain('This is the deny.hardGates rule')
  expect(result.deny).not.toContain('deny.skipGate')
  expect((await submit($, '/to-tickets csv')).drop).toContain('deny.hardGates')
})

test('hardGates turns on editOnIntegrationBranch, naming hardGates in the denial', async ($, on) => {
  featureWorld(on, {
    files: hard(),
    shell: (argv: readonly string[]) => {
      if (argv[0] !== 'git') return undefined
      if (argv[1] === 'worktree' && argv[2] === 'list')
        return { exitCode: 0, stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/feat/csv\n' }
      return { exitCode: 0, stdout: '' }
    },
  })
  await startSession($)
  const result = await $.tool.call({
    tool: 'Edit',
    tool_use_id: 'ed1',
    file_path: '/repo/src/app.ts',
  } as never)
  expect(result.deny).toContain('an integration branch')
  expect(result.deny).toContain('This is the deny.hardGates rule')
})

test('a rail press on a gated phase is refused: no Run anyway, Diagnose stays', async ($, on) => {
  const w = featureWorld(on, {
    files: { ...hard(), '.craftory/features/csv.json': '' },
    store: { drafts: DRAFT },
  })
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-tickets' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'primary' })
  const band = await mountBand($, 'terminal', 200)
  expect(w.commandsRun).toEqual([])
  expect(await allText(band)).toContain('Hard gates refuses it until Spec is done')
  expect(await band.find({ key: 'notice-run-anyway-tickets' })).toBeUndefined()
  expect(await band.find({ key: 'notice-diagnose-tickets' })).toBeDefined()
})

test('with only skipGate on, a rail press still asks and Run anyway still runs', async ($, on) => {
  const w = featureWorld(on, {
    files: { ...hard({ skipGate: true }), '.craftory/features/csv.json': '' },
    store: { drafts: DRAFT },
  })
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-tickets' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'primary' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-run-anyway-tickets' })
  expect(w.commandsRun).toEqual([{ command: 'mattpocock-skills:to-tickets', args: '' }])
})
