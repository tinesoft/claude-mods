import { expect, test } from 'claude-code/testing'
import { scenarioFiles, SKILLS_RANGE } from './wayfinder'
import { WAYFINDER_FIXTURES } from './wayfinder-fixtures'

test('the wayfinder fixtures are pinned to mattpocock-skills 1.3.x', () => {
  expect(SKILLS_RANGE).toBe('1.3')
  expect(Object.keys(WAYFINDER_FIXTURES).every(path => path.startsWith('1.3/'))).toBe(true)
})

test('every fixture file says in its header whether it was captured or hand-made', () => {
  for (const [path, text] of Object.entries(WAYFINDER_FIXTURES)) {
    expect(text.split('\n')[0], path).toMatch(/^<!-- (captured|hand-made):/)
  }
})

test('the Local mixed scenario is laid out as a repo: a map and its numbered tickets under .scratch', () => {
  const files = scenarioFiles('local', 'mixed')
  expect(Object.keys(files).sort()).toEqual([
    '.scratch/billing-v2/issues/01-billing-model.md',
    '.scratch/billing-v2/issues/02-gateway-limits.md',
    '.scratch/billing-v2/issues/03-invoice-layout.md',
    '.scratch/billing-v2/issues/04-tax-rounding.md',
    '.scratch/billing-v2/issues/05-proration-rules.md',
    '.scratch/billing-v2/issues/06-refund-flow.md',
    '.scratch/billing-v2/map.md',
  ])
})
