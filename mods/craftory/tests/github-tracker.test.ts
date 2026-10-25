import { expect, test } from 'claude-code/testing'
import { DEFAULT_LABELS } from '../src/agents-md'
import { DEFAULT_CONFIG } from '../src/config'
import { readTracker, TRACKERS, type ReadContext, type ReadResult } from '../src/tracker'
import {
  applyDependencies,
  applySubIssues,
  bodyEdges,
  dependenciesArgv,
  listIssuesArgv,
  parseIssueList,
  parsePr,
  prViewArgv,
  subIssuesArgv,
} from '../src/tracker/github'
import type { IssueRef } from '../types'

const SPEC_BODY =
  '## Problem Statement\n\nCSV.\n\n## Solution\n\nExport.\n\n## User Stories\n\n1. As an accountant, I want a CSV, so that I can import it\n2. As an admin, I want a filter, so that I can narrow it\n\n## Out of Scope\n\nNone.\n'

const row = (n: number, title: string, body: string, labels: string[], state = 'OPEN') => ({
  number: n,
  title,
  body,
  labels: labels.map(name => ({ name })),
  state,
  stateReason: state === 'CLOSED' ? 'COMPLETED' : null,
  createdAt: '2026-10-24T10:00:00Z',
  url: `https://github.com/acme/app/issues/${n}`,
})

const LIST = JSON.stringify([
  row(42, 'Export invoices as CSV', SPEC_BODY, ['ready-for-agent']),
  row(43, 'Export button', 'Part of #42\n\nBuild it.', ['ready-for-agent'], 'CLOSED'),
  row(44, 'Ledger tax', 'Part of #42\nBlocked by: #43\n', ['ready-for-agent']),
  row(45, 'Date filter', 'Part of #42\n\nBlocked by: None (can start immediately)', [
    'ready-for-agent',
  ]),
  row(46, 'Default column order', 'A decision.', ['ready-for-human', 'bug']),
  row(47, 'Sub-issue only', 'No link in the body.', ['ready-for-agent']),
])

const parse = (json = LIST) => {
  const issues = parseIssueList(json, DEFAULT_LABELS, 'spec', 'ticket')
  if (!Array.isArray(issues)) throw new Error(issues.problem)
  return issues
}

test('gh argv are builders, not strings to split', () => {
  expect(listIssuesArgv(50)).toEqual([
    'gh',
    'issue',
    'list',
    '--state',
    'all',
    '--limit',
    '50',
    '--json',
    'number,title,body,labels,state,stateReason,createdAt,url',
  ])
  expect(subIssuesArgv(42)).toEqual([
    'gh',
    'api',
    'repos/{owner}/{repo}/issues/42/sub_issues',
    '--paginate',
  ])
  expect(dependenciesArgv(44)[2]).toBe('repos/{owner}/{repo}/issues/44/dependencies/blocked_by')
  expect(prViewArgv('feat/csv')).toContain('feat/csv')
})

test('a spec is found by its template headings, because to-spec applies no spec label', () => {
  const issues = parse()
  expect(issues.find(i => i.ref === '#42')).toMatchObject({ kind: 'spec', stories: 2 })
  expect(issues.filter(i => i.kind === 'spec')).toHaveLength(1)
  const labelled = parseIssueList(
    JSON.stringify([row(9, 'Plain', 'x', ['spec'])]),
    DEFAULT_LABELS,
    'spec',
    'ticket',
  )
  expect(Array.isArray(labelled) && labelled[0]!.kind).toBe('spec')
})

test('Part of and Blocked by lines in the body give parent and edges', () => {
  const issues = parse()
  expect(issues.find(i => i.ref === '#44')).toMatchObject({
    kind: 'ticket',
    parent: '#42',
    blockedBy: ['#43'],
  })
  expect(issues.find(i => i.ref === '#45')).toMatchObject({ parent: '#42', blockedBy: [] })
  expect(bodyEdges('**Blocked by:** #1, #2\n\nParent: #7')).toEqual({
    blockedBy: ['#1', '#2'],
    parent: '#7',
  })
})

test('labels map to roles through the triage labels, closed issues are done', () => {
  const issues = parse()
  expect(issues.find(i => i.ref === '#43')).toMatchObject({
    status: 'done',
    role: 'ready-for-agent',
  })
  expect(issues.find(i => i.ref === '#46')).toMatchObject({ role: 'ready-for-human', isBug: true })
  const renamed = parseIssueList(
    JSON.stringify([row(5, 'T', 'b', ['afk'])]),
    { ...DEFAULT_LABELS, 'ready-for-agent': 'afk' },
    'spec',
    'ticket',
  )
  expect(Array.isArray(renamed) && renamed[0]!.role).toBe('ready-for-agent')
})

test('sub-issues make tickets of their spec, dependencies replace the edges', () => {
  const pages = `${JSON.stringify([{ number: 44 }])}\n${JSON.stringify([{ number: 47 }])}`
  const withChildren = applySubIssues(parse(), '#42' as IssueRef, pages)
  expect(withChildren.find(i => i.ref === '#47')).toMatchObject({ kind: 'ticket', parent: '#42' })
  const blocked = applyDependencies(
    withChildren,
    '#47' as IssueRef,
    JSON.stringify([{ number: 44 }]),
  )
  expect(blocked.find(i => i.ref === '#47')?.blockedBy).toEqual(['#44'])
})

test('a pull request is parsed, a missing one is null', () => {
  expect(
    parsePr(
      JSON.stringify({
        number: 50,
        url: 'https://github.com/acme/app/pull/50',
        headRefName: 'feat/csv',
        baseRefName: 'main',
        isDraft: true,
        state: 'OPEN',
      }),
    ),
  ).toEqual({
    ref: '#50',
    url: 'https://github.com/acme/app/pull/50',
    branch: 'feat/csv',
    base: 'main',
    isDraft: true,
    state: 'open',
  })
  expect(parsePr('no pull requests found')).toBeNull()
})

test('the whole read: list, then sub-issues, then dependencies, through the executor', async () => {
  const ctx: ReadContext = {
    config: DEFAULT_CONFIG,
    labels: DEFAULT_LABELS,
    now: 9,
    focus: { specs: ['#42' as IssueRef], branch: 'feat/csv' },
  }
  const asked: string[] = []
  const snapshot = await readTracker(TRACKERS.github!, ctx, async reads =>
    reads.map((read): ReadResult => {
      if (read.kind !== 'run') throw new Error('gh only')
      const argv = read.argv
      asked.push(argv.slice(1, 3).join(' '))
      const done = (stdout: string) => ({ kind: 'run' as const, argv, exitCode: 0, stdout })
      if (argv[1] === 'issue') return done(LIST)
      if (argv[1] === 'pr')
        return done(
          '{"number":50,"url":"u","headRefName":"feat/csv","baseRefName":"main","isDraft":true,"state":"OPEN"}',
        )
      if (argv[2]?.endsWith('/sub_issues')) return done('[{"number":44},{"number":47}]')
      return done('[{"number":43}]')
    }),
  )
  expect(asked).toEqual([
    'issue list',
    'pr view',
    'api repos/{owner}/{repo}/issues/42/sub_issues',
    'api repos/{owner}/{repo}/issues/47/dependencies/blocked_by',
    'api repos/{owner}/{repo}/issues/43/dependencies/blocked_by',
    'api repos/{owner}/{repo}/issues/45/dependencies/blocked_by',
  ])
  expect(snapshot).toMatchObject({ kind: 'github', rich: true, problem: null, at: 9 })
  if (!snapshot.rich) throw new Error('rich')
  expect(snapshot.pr?.isDraft).toBe(true)
  expect(snapshot.issues.find(i => i.ref === '#47')).toMatchObject({
    parent: '#42',
    blockedBy: ['#43'],
  })
})

test('a failed gh list is a problem, not a crash', async () => {
  const ctx: ReadContext = { config: DEFAULT_CONFIG, labels: DEFAULT_LABELS, now: 1 }
  const snapshot = await readTracker(TRACKERS.github!, ctx, async reads =>
    reads.map(read => ({
      kind: 'run' as const,
      argv: read.kind === 'run' ? read.argv : [],
      exitCode: 1,
      stdout: '',
    })),
  )
  expect(snapshot).toMatchObject({ kind: 'github', issues: [], problem: 'gh issue list failed' })
})

test('only gh and git push commands refresh the GitHub tracker', () => {
  const ctx: ReadContext = { config: DEFAULT_CONFIG, labels: DEFAULT_LABELS, now: 1 }
  const touches = (command: string) => TRACKERS.github!.touches(ctx, { name: 'Bash', command })
  expect(touches('gh issue create --title x')).toBe(true)
  expect(touches('git push -u origin feat/x')).toBe(true)
  expect(touches('ls docs')).toBe(false)
  expect(TRACKERS.github!.touches(ctx, { name: 'Write', path: 'docs/issues/1-a.md' })).toBe(false)
})

test('a branch that git would read as an option is never handed to gh pr view', () => {
  const ctx: ReadContext = {
    config: DEFAULT_CONFIG,
    labels: DEFAULT_LABELS,
    now: 9,
    focus: { specs: ['#42' as IssueRef], branch: '--web' },
  }
  const reads = TRACKERS.github!.plan(ctx, [])
  expect(reads.some(r => r.kind === 'run' && r.argv[1] === 'pr')).toBe(false)
})
