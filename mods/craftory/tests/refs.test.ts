import { expect, test } from 'claude-code/testing'
import { argFor, byNumber, parseIssueRef, parseRef, refSlug, refsIn } from '../src/tracker/refs'
import type { IssueRef } from '../types'

const ref = (text: string) => text as IssueRef

test('a numeric ref keeps parsing as before, and a word is still not one', () => {
  expect(parseRef('#44')).toBe('#44')
  expect(parseRef('044')).toBe('#44')
  expect(parseRef('ENG-12')).toBe('ENG-12')
  expect(parseIssueRef('csv-export')).toBeUndefined()
})

test('a .scratch feature is a ref and so is one of its tickets', () => {
  expect(parseRef('csv-export')).toBe('csv-export')
  expect(parseRef('csv-export/01')).toBe('csv-export/01')
  expect(parseRef(' csv-export/12 ')).toBe('csv-export/12')
})

test('text that is not a ref is refused', () => {
  expect(parseRef('')).toBeUndefined()
  expect(parseRef('CSV Export')).toBeUndefined()
  expect(parseRef('csv-export/')).toBeUndefined()
  expect(parseRef('csv-export/one')).toBeUndefined()
  expect(parseRef('../escape/01')).toBeUndefined()
})

test('a ref spells as a file, branch and worktree name without a slash', () => {
  expect(refSlug(ref('#44'))).toBe('44')
  expect(refSlug(ref('ENG-12'))).toBe('ENG-12')
  expect(refSlug(ref('csv-export'))).toBe('csv-export')
  expect(refSlug(ref('csv-export/01'))).toBe('csv-export-01')
})

test('refs sort by number, then by feature and ticket number', () => {
  const issues = ['csv-export/10', '#9', 'csv-export/02', '#10', 'billing/01', 'csv-export'].map(
    r => ({ ref: ref(r) }),
  )
  expect(issues.sort(byNumber).map(i => i.ref)).toEqual(
    ['#9', '#10', 'billing/01', 'csv-export', 'csv-export/02', 'csv-export/10'].map(ref),
  )
})

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

test('a skill is given a numbered ref as it is, and a .scratch ref as the path of its file', () => {
  const issues = [
    { ref: ref('csv'), location: '.scratch/csv/spec.md' },
    { ref: ref('csv/01'), location: '.scratch/csv/issues/01-button.md' },
    { ref: ref('#44'), location: 'https://github.com/acme/app/issues/44' },
  ]
  expect(argFor(issues, ref('csv'))).toBe('.scratch/csv/spec.md')
  expect(argFor(issues, ref('csv/01'))).toBe('.scratch/csv/issues/01-button.md')
  expect(argFor(issues, ref('#44'))).toBe('#44')
  expect(argFor(issues, ref('csv/09'))).toBe('csv/09')
  expect(argFor(null, ref('csv'))).toBe('csv')
})
