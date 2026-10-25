import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import {
  aheadBehindArgv,
  assembleGit,
  classifyWorktree,
  diffLine,
  gitStep2,
  hasConflict,
  lastCommitArgv,
  mergedArgv,
  parseAheadBehind,
  parseBranches,
  parseRemote,
  parseShortstat,
  parseWorktreeList,
  prunable,
  removalTargets,
  shortstatArgv,
  statusArgv,
  STALE_MS,
  syncText,
  ticketOfBranch,
  tipArgv,
  worktreeAddArgv,
} from '../src/git'

const PORCELAIN = `worktree /repo
HEAD 1111111
branch refs/heads/main

worktree /repo/.worktrees/_spec-42
HEAD 2222222
branch refs/heads/feat/invoice-csv

worktree /repo/.worktrees/44-ledger-tax
HEAD 3333333
branch refs/heads/craftory/44-ledger-tax

worktree /repo/.worktrees/scratch
HEAD 4444444
detached
`

test('the porcelain list gives path, branch and head, with the main checkout first', () => {
  expect(parseWorktreeList(PORCELAIN)).toEqual([
    { path: '/repo', branch: 'main', head: '1111111', isMain: true },
    {
      path: '/repo/.worktrees/_spec-42',
      branch: 'feat/invoice-csv',
      head: '2222222',
      isMain: false,
    },
    {
      path: '/repo/.worktrees/44-ledger-tax',
      branch: 'craftory/44-ledger-tax',
      head: '3333333',
      isMain: false,
    },
    { path: '/repo/.worktrees/scratch', branch: null, head: '4444444', isMain: false },
  ])
  expect(parseWorktreeList('')).toEqual([])
})

test('remotes in every spelling become a web URL and a slug', () => {
  expect(parseRemote('https://github.com/acme/billing.git\n')).toEqual({
    host: 'github',
    webUrl: 'https://github.com/acme/billing',
    slug: 'acme/billing',
  })
  expect(parseRemote('git@gitlab.com:acme/billing.git')).toEqual({
    host: 'gitlab',
    webUrl: 'https://gitlab.com/acme/billing',
    slug: 'acme/billing',
  })
  expect(parseRemote('ssh://git@git.example.com/team/app')).toMatchObject({
    host: 'other',
    slug: 'team/app',
  })
  expect(parseRemote(null)).toBeNull()
  expect(parseRemote('  ')).toBeNull()
})

test('ahead and behind come from the left-right count of base...branch', () => {
  expect(parseAheadBehind('1\t3\n')).toEqual({ behind: 1, ahead: 3 })
  expect(parseAheadBehind('')).toEqual({ behind: 0, ahead: 0 })
  expect(aheadBehindArgv('feat/x', 'craftory/44-a')).toEqual([
    'git',
    'rev-list',
    '--left-right',
    '--count',
    'feat/x...craftory/44-a',
  ])
})

test('the shortstat gives files, insertions and deletions, and zeros for no diff', () => {
  const stat = parseShortstat(' 4 files changed, 142 insertions(+), 18 deletions(-)\n')
  expect(stat).toEqual({ files: 4, added: 142, deleted: 18 })
  expect(diffLine(stat)).toBe('4 files changed · +142 −18')
  expect(parseShortstat(' 1 file changed, 2 insertions(+)\n')).toEqual({
    files: 1,
    added: 2,
    deleted: 0,
  })
  expect(diffLine(parseShortstat(''))).toBe('no changes against the base')
})

test('a branch listing drops the current marker, and a status shows only real conflicts', () => {
  expect(parseBranches('* feat/x\n  craftory/43-a\n\n')).toEqual(['feat/x', 'craftory/43-a'])
  expect(hasConflict(' M src/a.ts\nUU src/b.ts\n')).toBe(true)
  expect(hasConflict(' M src/a.ts\n?? new.ts\nA  added.ts\n')).toBe(false)
  expect(hasConflict('')).toBe(false)
})

test('worktree add makes the branch from the base, or checks an existing branch out', () => {
  expect(worktreeAddArgv('craftory/44-a', '.worktrees/44-a', 'feat/x', false)).toEqual([
    'git',
    'worktree',
    'add',
    '-b',
    'craftory/44-a',
    '.worktrees/44-a',
    'feat/x',
  ])
  expect(worktreeAddArgv('craftory/44-a', '.worktrees/44-a', 'feat/x', true)).toEqual([
    'git',
    'worktree',
    'add',
    '.worktrees/44-a',
    'craftory/44-a',
  ])
})

test('a branch made from the ticket template names its ticket', () => {
  expect(ticketOfBranch('craftory/44-ledger-tax', 'craftory/{ticket}-{slug}')).toBe('#44')
  expect(ticketOfBranch('feat/invoice-csv', 'craftory/{ticket}-{slug}')).toBeNull()
  expect(ticketOfBranch(null, 'craftory/{ticket}-{slug}')).toBeNull()
  expect(ticketOfBranch('wt/12-a', 'wt/{ticket}-{slug}')).toBe('#12')
})

const NOW = 1_000 * 24 * 60 * 60 * 1000
const classify = (over: Partial<Parameters<typeof classifyWorktree>[0]>) =>
  classifyWorktree({
    path: '/repo/.worktrees/44-a',
    branch: 'craftory/44-a',
    isMain: false,
    integrationBranches: new Set(['feat/csv']),
    config: DEFAULT_CONFIG.worktrees,
    lastCommitAt: NOW - 1000,
    runningPaths: new Set(),
    now: NOW,
    ...over,
  })

test('roles: checkout, integration, agent, stale and other', () => {
  expect(classify({ isMain: true, path: '/repo', branch: 'main' })).toEqual({
    role: 'checkout',
    ticket: null,
  })
  expect(classify({ branch: 'feat/csv', path: '/repo/.worktrees/_spec-42' }).role).toBe(
    'integration',
  )
  expect(classify({})).toEqual({ role: 'agent', ticket: '#44' })
  expect(classify({ lastCommitAt: NOW - STALE_MS - 1 }).role).toBe('stale')
  expect(
    classify({ lastCommitAt: NOW - STALE_MS - 1, runningPaths: new Set(['/repo/.worktrees/44-a']) })
      .role,
  ).toBe('agent')
  expect(classify({ branch: 'prototype/x', path: '/elsewhere/x' }).role).toBe('other')
})

test('a refresh asks for each fact once and assembles the snapshot', () => {
  const entries = parseWorktreeList(PORCELAIN)
  const bases = {
    '/repo/.worktrees/_spec-42': 'main',
    '/repo/.worktrees/44-ledger-tax': 'feat/invoice-csv',
  }
  const asked = gitStep2({ entries, bases, integrationBranches: ['feat/invoice-csv'] })
  expect(asked).toContainEqual(mergedArgv('feat/invoice-csv'))
  expect(asked).toContainEqual(statusArgv('/repo/.worktrees/44-ledger-tax'))
  expect(asked).not.toContainEqual(statusArgv('/repo'))
  expect(asked).toContainEqual(shortstatArgv('feat/invoice-csv', 'craftory/44-ledger-tax'))

  const results = new Map<string, string>([
    [mergedArgv('feat/invoice-csv').join(' '), 'main\ncraftory/43-button\n'],
    [tipArgv('feat/invoice-csv').join(' '), 'abc123\n'],
    [aheadBehindArgv('main', 'feat/invoice-csv').join(' '), '0\t4\n'],
    [aheadBehindArgv('feat/invoice-csv', 'craftory/44-ledger-tax').join(' '), '1\t3\n'],
    [
      shortstatArgv('feat/invoice-csv', 'craftory/44-ledger-tax').join(' '),
      ' 4 files changed, 142 insertions(+), 18 deletions(-)\n',
    ],
    [lastCommitArgv('craftory/44-ledger-tax').join(' '), `${Math.floor((NOW - 1000) / 1000)}\n`],
    [statusArgv('/repo/.worktrees/44-ledger-tax').join(' '), 'UU a.ts\n'],
  ])
  const git = assembleGit({
    root: '/repo',
    branch: 'main',
    remote: null,
    entries,
    bases,
    results,
    config: DEFAULT_CONFIG,
    integrationBranches: ['feat/invoice-csv'],
    runningPaths: new Set(),
    now: NOW,
  })
  expect(git.merged).toEqual({ 'feat/invoice-csv': ['main', 'craftory/43-button'] })
  expect(git.tips).toEqual({ 'feat/invoice-csv': 'abc123' })
  const agent = git.worktrees.find(w => w.ticket === '#44')!
  expect(agent).toMatchObject({
    role: 'agent',
    ahead: 3,
    behind: 1,
    commits: 3,
    added: 142,
    deleted: 18,
    isRebasing: true,
  })
  expect(git.worktrees.find(w => w.role === 'integration')?.ahead).toBe(4)
  expect(git.worktrees.find(w => w.role === 'checkout')?.path).toBe('/repo')
})

test('sync text says ahead, behind, conflicts and staleness in words', () => {
  const w = {
    path: '/repo/.worktrees/x',
    branch: 'b',
    role: 'agent',
    ticket: null,
    ahead: 3,
    behind: 1,
    added: 0,
    deleted: 0,
    commits: 3,
    lastCommitAt: NOW - 6 * 86_400_000,
    isRebasing: false,
  } as const
  expect(syncText(w, 'main', NOW)).toBe('3 ahead of main · 1 behind')
  expect(syncText({ ...w, ahead: 0, behind: 0 }, 'main', NOW)).toBe('in sync')
  expect(syncText({ ...w, isRebasing: true }, 'main', NOW)).toBe('stopped on merge conflicts')
  expect(syncText({ ...w, role: 'stale' }, 'main', NOW)).toBe('no commits in 6 days')
})

test('pruning takes the stale worktrees but never one Craftory keeps', () => {
  const stale = (path: string) => ({
    path,
    branch: null,
    role: 'stale' as const,
    ticket: null,
    ahead: 0,
    behind: 0,
    added: 0,
    deleted: 0,
    commits: 0,
    lastCommitAt: 1,
    isRebasing: false,
  })
  const git = {
    root: '/repo',
    branch: 'main',
    remote: null,
    merged: {},
    tips: {},
    at: 1,
    worktrees: [stale('/repo/.worktrees/39-spike'), stale('/repo/.worktrees/45-kept')],
  }
  expect(prunable(git, ['.worktrees/45-kept']).map(w => w.path)).toEqual([
    '/repo/.worktrees/39-spike',
  ])
})

test('worktree removals are found in a shell line, in any spelling', () => {
  expect(removalTargets('git worktree remove .worktrees/44-a')).toEqual(['.worktrees/44-a'])
  expect(removalTargets('git worktree remove --force "/repo/.worktrees/44-a"')).toEqual([
    '/repo/.worktrees/44-a',
  ])
  expect(
    removalTargets('cd /repo && git -C /repo worktree remove a && git worktree remove -f b'),
  ).toEqual(['a', 'b'])
  expect(removalTargets('git worktree list')).toEqual([])
  expect(removalTargets('echo remove')).toEqual([])
})
