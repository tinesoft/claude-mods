import { expect, test } from 'claude-code/testing'
import type { BudgetStanding } from '../src/budgets'
import { phaseMeta } from '../src/card-model'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow, type Flow } from '../src/evidence'
import { SKILLS } from '../src/phases'
import type { Feature, FeatureRecord, IssueRef, PhaseId, PhaseMark } from '../types'

const feature = (marks: Partial<Record<PhaseId, PhaseMark>>): Feature => {
  const record: FeatureRecord = {
    version: 1,
    spec: '#42' as IssueRef,
    origin: 'spec',
    title: 'Export invoices as CSV',
    entry: 'align',
    enteredFrom: null,
    skips: {},
    integrationBranch: 'feat/csv',
    pr: null,
    marks,
    agents: {},
  }
  return { kind: 'specced', key: 'spec:#42', record }
}

const over = (usd: number, budget: number): BudgetStanding => ({ usd, budget, level: 'over' })

const flowOf = (args: {
  marks?: Partial<Record<PhaseId, PhaseMark>>
  running?: { phase: PhaseId; isAwaitingUser?: boolean }
  budgets: Partial<Record<PhaseId, BudgetStanding>>
}): Flow =>
  deriveFlow({
    feature: feature(args.marks ?? {}),
    config: DEFAULT_CONFIG,
    tracker: null,
    build: null,
    budgets: args.budgets,
    running: args.running
      ? {
          phase: args.running.phase,
          entry: null,
          skill: SKILLS.grillWithDocs,
          args: '',
          feature: 'spec:#42',
          startedAt: 1,
          isAwaitingUser: args.running.isAwaitingUser ?? false,
          progress: null,
        }
      : null,
  })

const view = (flow: Flow, phase: PhaseId) => flow.phases.find(s => s.phase === phase)!

test('a phase up next and over its dollar budget shows Over budget, with its spend of its budget', () => {
  const flow = flowOf({ budgets: { tickets: over(12.4, 12) } })
  expect(view(flow, 'tickets').state).toEqual({
    kind: 'over-budget',
    unit: 'usd',
    usd: 12.4,
    budget: 12,
  })
  expect(phaseMeta(view(flow, 'tickets'), flow)).toBe('$12.4 / $12')
  // Still the phase to run next: Over budget is how it looks, not where the flow stands
  expect(flow.next).toBe('tickets')
})

test('a running phase, or one waiting on you, over its budget shows Over budget', () => {
  const running = flowOf({ running: { phase: 'align' }, budgets: { align: over(2, 1) } })
  expect(view(running, 'align').state.kind).toBe('over-budget')
  expect(running.current).toBe('align')
  const waiting = flowOf({
    running: { phase: 'align', isAwaitingUser: true },
    budgets: { align: over(1.2, 1) },
  })
  expect(phaseMeta(view(waiting, 'align'), waiting)).toBe('$1.20 / $1')
})

test('a phase near its budget, or with none, keeps its state', () => {
  const flow = flowOf({
    running: { phase: 'align' },
    budgets: { align: { usd: 0.9, budget: 1, level: 'near' } },
  })
  expect(view(flow, 'align').state.kind).toBe('running')
  expect(view(flowOf({ budgets: {} }), 'tickets').state.kind).toBe('next')
})

test('done, gated and todo phases keep their state, over budget or not', () => {
  const flow = flowOf({
    budgets: { spec: over(5, 1), review: over(5, 1), retro: over(5, 1) },
  })
  expect(view(flow, 'spec').state.kind).toBe('done')
  expect(view(flow, 'review').state.kind).toBe('gated')
  expect(view(flow, 'retro').state.kind).toBe('todo')
})
