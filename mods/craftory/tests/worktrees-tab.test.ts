import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { paint } from '../src/theme'
import { building, fakeGit, start } from './build-harness'
import { allText, mountBand, mountPane, texts, type WorldOptions } from './harness'

const DAY = 86_400_000
const NOW = 10 * DAY

const SPEC = { path: '/repo/.worktrees/_spec-42', branch: 'feat/csv' }
const SPIKE = { path: '/repo/.worktrees/39-csv-spike', branch: 'prototype/csv-spike' }

const withWorktrees = async (
  on: Parameters<typeof building>[0],
  $: Engine,
  options: WorldOptions = {},
  git = fakeGit({
    extra: [SPEC, SPIKE],
    committed: { 'prototype/csv-spike': 4 * (DAY / 1000) },
    stat: ' 4 files changed, 142 insertions(+), 18 deletions(-)\n',
  }),
) => {
  const built = await building(on, $, { shell: git.shell, now: NOW, ...options })
  await start($, 44, 'Ledger tax')
  return { ...built, git }
}

const openTab = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => {
  const band = await mountBand($, surface, 200, 60)
  await band.press({ key: 'step-build' })
  await (await mountBand($, surface, 200, 60)).press({ key: 'agents-open-panel' })
  return mountPane($, surface)
}

test('the tab lists your checkout, the integration worktree, the running agent and the stale one', async ($, on) => {
  await withWorktrees(on, $)
  const words = await texts(await openTab($))
  expect(words).toContain('4 worktrees · 3 under .worktrees/')
  for (const row of [
    '/repo',
    '.worktrees/_spec-42',
    '.worktrees/44-ledger-tax',
    '.worktrees/39-csv-spike',
  ])
    expect(words).toContain(row)
  for (const label of ['[Your checkout]', '[Integration]', '[Agent running]', '[Stale]'])
    expect(words).toContain(label)
  expect(words).toContain('spec #42')
  expect(words).toContain('ticket #44')
  expect(words).toContain('no commits in 6 days')
  expect(words).toContain('craftory/44-ledger-tax')
  expect(words).toContain('[ Prune 1 stale ]')
})

test('desktop: the badges use the design colours for their kind', async ($, on) => {
  await withWorktrees(on, $, { surfaces: ['desktop'], theme: 'dark' })
  const pane = await openTab($, 'desktop')
  const badge = async (path: string) => (await pane.find({ key: `wt-badge-${path}` }))?.props
  const stale = paint('hook', 'dark')
  expect(await badge('.worktrees/39-csv-spike')).toMatchObject({
    backgroundColor: stale.bg,
    borderColor: stale.bd,
  })
  const integration = paint('perm', 'dark')
  expect(await badge('.worktrees/_spec-42')).toMatchObject({ backgroundColor: integration.bg })
  const agent = paint('skill', 'dark')
  expect(await badge('.worktrees/44-ledger-tax')).toMatchObject({ backgroundColor: agent.bg })
})

test('Diff shows the shortstat under the row, and a second press hides it', async ($, on) => {
  await withWorktrees(on, $)
  const pane = await openTab($)
  await pane.press({ key: 'wt-diff-.worktrees/44-ledger-tax' })
  await pane.redraw()
  expect(await texts(pane)).toContain('4 files changed · +142 −18')
  await pane.press({ key: 'wt-diff-.worktrees/44-ledger-tax' })
  await pane.redraw()
  expect(await texts(pane)).not.toContain('4 files changed · +142 −18')
})

test('Open terminal copies the cd line and says so, because a mod cannot open a terminal', async ($, on) => {
  const { w } = await withWorktrees(on, $)
  const pane = await openTab($)
  await pane.press({ key: 'wt-terminal-.worktrees/44-ledger-tax' })
  expect(w.copied.map(c => c.text)).toEqual(['cd /repo/.worktrees/44-ledger-tax'])
  expect(w.toasts.at(-1)).toBe('Copied cd /repo/.worktrees/44-ledger-tax · paste it in a terminal')
})

test('Remove on a stale worktree runs git without asking; the checkout and integration have no Remove', async ($, on) => {
  const { w } = await withWorktrees(on, $, { ask: () => undefined })
  const pane = await openTab($)
  expect(await pane.find({ key: 'wt-remove-/repo' })).toBeUndefined()
  expect(await pane.find({ key: 'wt-remove-.worktrees/_spec-42' })).toBeUndefined()
  await pane.press({ key: 'wt-remove-.worktrees/39-csv-spike' })
  expect(w.ran).toContainEqual(['git', 'worktree', 'remove', '--', '/repo/.worktrees/39-csv-spike'])
  expect(w.calls.some(c => c.tool === 'AskUserQuestion')).toBe(false)
  expect(w.toasts.at(-1)).toBe('Removed .worktrees/39-csv-spike')
})

test('Remove on a running agent asks first; Keep it and a dismissed question leave it alone', async ($, on) => {
  let answer: string | undefined = 'Keep it'
  const { w } = await withWorktrees(on, $, { ask: () => answer })
  const pane = await openTab($)
  await pane.press({ key: 'wt-remove-.worktrees/44-ledger-tax' })
  answer = undefined
  await pane.press({ key: 'wt-remove-.worktrees/44-ledger-tax' })
  expect(w.ran.filter(a => a[1] === 'worktree' && a[2] === 'remove')).toEqual([])
  expect(w.calls.filter(c => c.tool === 'AskUserQuestion')).toHaveLength(2)
})

test('confirming Remove anyway forces the removal of a kept worktree', async ($, on) => {
  const { w } = await withWorktrees(on, $, { ask: () => 'Remove anyway' })
  const pane = await openTab($)
  await pane.press({ key: 'wt-remove-.worktrees/44-ledger-tax' })
  expect(w.ran).toContainEqual([
    'git',
    'worktree',
    'remove',
    '--force',
    '--',
    '/repo/.worktrees/44-ledger-tax',
  ])
})

test('Prune 1 stale removes the stale worktree and nothing Craftory keeps', async ($, on) => {
  const { w } = await withWorktrees(on, $)
  const pane = await openTab($)
  await pane.press({ key: 'wt-prune' })
  const removals = w.ran.filter(a => a[1] === 'worktree' && a[2] === 'remove')
  expect(removals).toEqual([['git', 'worktree', 'remove', '--', '/repo/.worktrees/39-csv-spike']])
  expect(w.toasts.at(-1)).toBe('Pruned 1 of 1 stale worktrees')
  await pane.redraw()
  expect(await allText(pane)).not.toContain('Prune 1 stale')
})

test('Settings › prune stale worktrees runs the prune when the session starts', async ($, on) => {
  const git = fakeGit({
    extra: [SPIKE],
    committed: { 'prototype/csv-spike': 4 * (DAY / 1000) },
  })
  const w = (
    await building(on, $, {
      shell: git.shell,
      now: NOW,
      files: { '.craftory/config.json': JSON.stringify({ worktrees: { pruneStale: true } }) },
    })
  ).w
  expect(w.ran).toContainEqual(['git', 'worktree', 'remove', '--', '/repo/.worktrees/39-csv-spike'])
})
