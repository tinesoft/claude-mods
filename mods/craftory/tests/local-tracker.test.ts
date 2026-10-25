import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { DEFAULT_LABELS } from '../src/agents-md'
import { TRACKERS, parseIssueRef, refsIn, type ReadContext, type ReadResult } from '../src/tracker'
import { numberOf, parseFrontMatter, parseIssueFile } from '../src/tracker/local'
import type { Issue } from '../types'

const folder = 'docs/issues/'
const parse = (name: string, text: string, labels = DEFAULT_LABELS, mtimeMs?: number): Issue => {
  const issue = parseIssueFile({ folder, name, text, labels, ...(mtimeMs && { mtimeMs }) })
  if ('problem' in issue) throw new Error(issue.problem)
  return issue
}

test('issue references are normalised at the boundary', () => {
  expect(parseIssueRef('42')).toBe('#42')
  expect(parseIssueRef(' #042 ')).toBe('#42')
  expect(parseIssueRef('BILL-42')).toBe('BILL-42')
  for (const bad of ['', 'x', '#', 'bill-4', '4.2']) expect(parseIssueRef(bad)).toBeUndefined()
  expect(refsIn('Fixes #4, relates to BILL-7 and #4 again, not path/#9 or v#1')).toEqual([
    '#4',
    'BILL-7',
  ])
})

test('front matter reads scalars, bracket lists and bare lists', () => {
  const parsed = parseFrontMatter(
    '---\ntype: ticket\nblocked_by: 43, 44\nlabels: [bug, "p1"]\nstatus: done\n---\n# T\n',
  )
  expect(parsed?.data).toEqual({
    type: 'ticket',
    'blocked-by': ['43', '44'],
    labels: ['bug', 'p1'],
    status: 'done',
  })
  expect(parsed?.body).toBe('# T\n')
  expect(parseFrontMatter('# no front matter\n')).toBeNull()
  expect(parseFrontMatter('---\nunterminated\n')).toBeNull()
})

test('a Craftory ticket file: front matter, labels and dates', () => {
  const issue = parse(
    '44-ledger-lines.md',
    '---\ntype: ticket\nstatus: ready-for-agent\nparent: 42\nblocked-by: [43]\nlabels: [bug]\ncreated: 2026-10-24\n---\n# Ledger lines include tax\n',
  )
  expect(issue).toMatchObject({
    ref: '#44',
    title: 'Ledger lines include tax',
    kind: 'ticket',
    status: 'open',
    role: 'ready-for-agent',
    parent: '#42',
    blockedBy: ['#43'],
    isBug: true,
    location: 'docs/issues/44-ledger-lines.md',
  })
  expect(issue.createdAt).toBe(Date.parse('2026-10-24') + 86_400_000 - 1)
})

test('an upstream to-tickets file: Status and Blocked by lines, numbered title', () => {
  const text =
    '# 02: Add the export button\n\n**What to build:** a button.\n\n**Blocked by:** 01, #03\n\n**Status:** ready-for-agent\n\n- [ ] works\n'
  expect(parse('02-add-the-export-button.md', text)).toMatchObject({
    ref: '#2',
    title: 'Add the export button',
    kind: 'ticket',
    role: 'ready-for-agent',
    status: 'open',
    blockedBy: ['#1', '#3'],
  })
  const plain = '# 05: Solo\n\nBlocked by: None (can start immediately)\nStatus: needs-triage\n'
  expect(parse('05-solo.md', plain)).toMatchObject({
    blockedBy: [],
    role: 'needs-triage',
    kind: 'ticket',
  })
})

test('front matter beats the upstream lines when both are present', () => {
  const text = '---\nstatus: done\n---\n# T\n**Status:** ready-for-agent\n'
  expect(parse('1-t.md', text)).toMatchObject({ status: 'done', role: null })
})

test('a spec is told apart by type or by the to-spec headings, since no label marks it', () => {
  const headings = '# Export invoices\n\n## Problem Statement\n\nx\n\n## User Stories\n\n1. y\n'
  expect(parse('42-export.md', headings).kind).toBe('spec')
  expect(parse('42-export.md', '---\ntype: spec\n---\n# Export\n').kind).toBe('spec')
  expect(parse('42-export.md', '# Export\n\n## Problem Statement\n\nonly one heading\n').kind).toBe(
    'issue',
  )
  expect(parse('7-bug.md', '# Crash on save\n').kind).toBe('issue')
})

test('a renamed triage label still maps to its role, and wontfix closes the issue', () => {
  const labels = { ...DEFAULT_LABELS, 'ready-for-agent': 'afk', wontfix: 'nope' }
  expect(parse('1-a.md', '---\nstatus: afk\n---\n# A\n', labels)).toMatchObject({
    role: 'ready-for-agent',
    status: 'open',
  })
  expect(parse('2-b.md', '---\nstatus: nope\n---\n# B\n', labels)).toMatchObject({
    role: 'wontfix',
    status: 'closed',
  })
  expect(parse('3-c.md', '---\nstatus: in-progress\n---\n# C\n')).toMatchObject({
    status: 'in-progress',
  })
})

test('with no created date the file time stands in, and the title falls back to the slug', () => {
  const issue = parse('9-fix-the-thing.md', 'no heading here\n', DEFAULT_LABELS, 1234)
  expect(issue).toMatchObject({ title: 'fix the thing', createdAt: 1234 })
})

test('files outside the <n>-<slug>.md layout are named as problems', () => {
  expect(numberOf('notes.md')).toBeUndefined()
  expect(numberOf('12-a.md')).toBe(12)
  expect(parseIssueFile({ folder, name: 'notes.md', text: '', labels: DEFAULT_LABELS })).toEqual({
    problem: 'notes.md: not named <n>-<slug>.md',
  })
})

const ctx: ReadContext = { config: DEFAULT_CONFIG, labels: DEFAULT_LABELS, now: 5 }
const local = TRACKERS.local!

test('the local tracker lists the folder, then reads each issue file, newest first', () => {
  expect(local.plan(ctx, [])).toEqual([{ kind: 'list', dir: 'docs/issues/' }])
  const listing: ReadResult = {
    kind: 'list',
    entries: [
      { name: '1-a.md', kind: 'file', mtimeMs: 1 },
      { name: '10-b.md', kind: 'file', mtimeMs: 2 },
      { name: 'README.md', kind: 'file', mtimeMs: 3 },
      { name: '2-dir.md', kind: 'dir', mtimeMs: 4 },
    ],
  }
  expect(local.plan(ctx, [listing])).toEqual([
    { kind: 'read', path: 'docs/issues/10-b.md' },
    { kind: 'read', path: 'docs/issues/1-a.md' },
  ])
  const snapshot = local.parse(ctx, [
    listing,
    { kind: 'read', text: '# B\n' },
    { kind: 'read', text: null },
  ])
  expect(snapshot).toMatchObject({
    kind: 'local',
    rich: true,
    at: 5,
    problem: '1-a.md: unreadable',
  })
  expect(snapshot.rich && snapshot.issues.map(i => i.ref)).toEqual(['#10'])
  expect(local.parse(ctx, [{ kind: 'list', entries: null }])).toMatchObject({
    issues: [],
    problem: null,
  })
})

test('only writes and commands that touch the issues folder refresh the tracker', () => {
  expect(local.touches(ctx, { name: 'Write', path: '/r/docs/issues/3-x.md' })).toBe(true)
  expect(local.touches(ctx, { name: 'Edit', path: '/r/src/a.ts' })).toBe(false)
  expect(local.touches(ctx, { name: 'Bash', command: 'ls docs/issues/' })).toBe(true)
  expect(local.touches(ctx, { name: 'Bash', command: 'ls' })).toBe(false)
  expect(local.header(ctx)).toBe('Local Markdown · docs/issues/')
})
