import { expect, test } from 'claude-code/testing'
import { byNumber, parseIssueRef, parseRef, refSlug } from '../src/tracker/refs'
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
