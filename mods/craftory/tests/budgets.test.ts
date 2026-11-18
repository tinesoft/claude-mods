import { expect, test } from 'claude-code/testing'
import { budgetLevel, featureBudgetOf, phaseBudgetOf } from '../src/budgets'
import { DEFAULT_CONFIG } from '../src/config'
import type { BudgetConfig, Feature, FeatureRecord, IssueRef } from '../types'

const level = (usd: number | null, budget: number, hasCost = true) =>
  budgetLevel({ usd, budget, warnAtPercent: 80, hasCost })

test('a budget level is none, ok, near from the warning share, and over from 100%', () => {
  const table: [number | null, number, boolean, string][] = [
    [5, 0, true, 'none'],
    [null, 20, true, 'none'],
    [25, 20, false, 'none'],
    [0, 20, true, 'ok'],
    [15.99, 20, true, 'ok'],
    [16, 20, true, 'near'],
    [19.99, 20, true, 'near'],
    [20, 20, true, 'over'],
    [31, 20, true, 'over'],
  ]
  for (const [usd, budget, hasCost, want] of table)
    expect(level(usd, budget, hasCost), `${usd} of ${budget}`).toBe(want)
  expect(budgetLevel({ usd: 9, budget: 10, warnAtPercent: 95, hasCost: true })).toBe('ok')
})

const DEFAULTS: BudgetConfig = {
  ...DEFAULT_CONFIG.budgets,
  featureUsd: 20,
  phaseUsd: { ...DEFAULT_CONFIG.budgets.phaseUsd, build: 12, spec: 5 },
}

const record = (budgets?: FeatureRecord['budgets']): Feature => ({
  kind: 'specced',
  key: 'spec:csv',
  record: {
    version: 1,
    spec: 'csv' as IssueRef,
    origin: 'spec',
    title: 'Export invoices as CSV',
    entry: 'align',
    enteredFrom: null,
    skips: {},
    integrationBranch: 'feat/csv',
    pr: null,
    ...(budgets && { budgets }),
    marks: {},
    agents: {},
  },
})

const draft: Feature = {
  kind: 'draft',
  key: 'draft:d1',
  draft: {
    draftId: 'd1',
    title: 'Grill',
    entry: 'align',
    enteredFrom: null,
    marks: {},
    startedAt: '2026-11-17T09:00:00.000Z',
  },
}

test('a Feature’s own budget wins over the default, and 0 means none at every level', () => {
  expect(featureBudgetOf(DEFAULTS, record())).toBe(20)
  expect(featureBudgetOf(DEFAULTS, record({ usd: 50 }))).toBe(50)
  expect(featureBudgetOf(DEFAULTS, record({ usd: 0 }))).toBe(0)
  expect(featureBudgetOf(DEFAULT_CONFIG.budgets, record())).toBe(0)
  expect(phaseBudgetOf(DEFAULTS, record(), 'build')).toBe(12)
  expect(phaseBudgetOf(DEFAULTS, record({ phases: { build: 18 } }), 'build')).toBe(18)
  expect(phaseBudgetOf(DEFAULTS, record({ phases: { build: 18 } }), 'spec')).toBe(5)
  expect(phaseBudgetOf(DEFAULTS, record({ phases: { spec: 0 } }), 'spec')).toBe(0)
  expect(phaseBudgetOf(DEFAULTS, record(), 'align')).toBe(0)
})

test('a draft has no record, so it gets the defaults only', () => {
  expect(featureBudgetOf(DEFAULTS, draft)).toBe(20)
  expect(phaseBudgetOf(DEFAULTS, draft, 'build')).toBe(12)
})
