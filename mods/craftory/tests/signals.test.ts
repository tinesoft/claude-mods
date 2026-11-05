import { expect, test } from 'claude-code/testing'
import { diffSignals, toastText } from '../src/signals'
import type { IssueRef, SignalBasis } from '../types'

const basis = (over: Partial<SignalBasis> = {}): SignalBasis => ({
  specs: [],
  gates: [],
  budgets: [],
  conflicts: [],
  drifts: [],
  retros: [],
  ...over,
})
const spec = (n: number, stories: number | null = null) => ({ ref: `#${n}` as IssueRef, stories })
const gate = {
  id: 'gate-tickets',
  phase: 'tickets',
  by: 'spec',
  reason: 'no spec has been published yet',
} as const

test('the first look only seeds: nothing is announced for what is already there', () => {
  expect(diffSignals(null, basis({ specs: [spec(42)], gates: [gate] }))).toEqual([])
})

test('a new spec and a new gate are each announced once', () => {
  const before = basis({ specs: [spec(42)] })
  const after = basis({ specs: [spec(42), spec(50, 6)], gates: [gate] })
  const signals = diffSignals(before, after)
  expect(signals.map(toastText)).toEqual([
    'Spec #50 published · 6 user stories',
    'Tickets is gated · no spec has been published yet',
  ])
  expect(diffSignals(after, after)).toEqual([])
})

test('a spec with no story count is announced without one', () => {
  expect(toastText({ kind: 'spec-published', spec: '#7' as IssueRef, stories: null })).toBe(
    'Spec #7 published',
  )
})

const budget = { id: 'budget-#44', ticket: '#44' as IssueRef, budget: 80_000 }
const conflict = {
  id: 'conflict-#45',
  ticket: '#45' as IssueRef,
  worktree: '.claude/worktrees/45-date-filter',
}

test('a budget hit and a rebase conflict are each announced once, in the design words', () => {
  const before = basis()
  const after = basis({ budgets: [budget], conflicts: [conflict] })
  const signals = diffSignals(before, after)
  expect(signals.map(toastText)).toEqual([
    'Agent #44 hit its 80k budget · worktree kept',
    'Rebase conflict in .claude/worktrees/45-date-filter · agent stopped',
  ])
  expect(diffSignals(after, after)).toEqual([])
  expect(diffSignals(null, after)).toEqual([])
})
