import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import {
  NO_USER_LABEL,
  parseSpendGroup,
  type PersonRow,
  type SpendFeatureInput,
  spendTabView,
} from '../src/spend-view'
import type { FeatureKey, IssueRef, SpendRow } from '../types'
import { allText, featureWorld, mountPane, startSession, texts, type WorldOptions } from './harness'

const CSV = 'spec:csv' as FeatureKey

const row = (usd: number | null, over: Partial<PersonRow> = {}): PersonRow => ({
  feature: CSV,
  phase: 'align',
  ticket: null,
  agentId: null,
  model: 'claude-opus-5-5',
  tokens: { input: 1_000, output: 0, cacheRead: 0, cacheWrite: 0 },
  usd,
  isEstimated: false,
  steps: 1,
  user: 'Dev Dev <dev@example.com>',
  ...over,
})

const feature = (
  key: string,
  rows: PersonRow[],
  over: Partial<SpendFeatureInput> = {},
): SpendFeatureInput => ({
  key: key as FeatureKey,
  title: key,
  isArchived: false,
  rows,
  ...over,
})

const view = (over: Partial<Parameters<typeof spendTabView>[0]> = {}) =>
  spendTabView({
    group: 'phase',
    hasCost: true,
    active: CSV,
    features: [],
    outside: [],
    skipped: [],
    ...over,
  })

test('by phase: phases in order, Between phases last, tickets under Build with their titles', () => {
  const v = view({
    features: [
      feature(CSV, [
        row(0.5, { phase: 'between' }),
        row(2, { phase: 'build', ticket: 'csv/02' as IssueRef, isEstimated: true }),
        row(1, { phase: 'build', ticket: 'csv/01' as IssueRef }),
        row(0.4),
      ]),
    ],
    titles: { ['csv/01' as IssueRef]: 'Export button' },
  })
  expect(v.active?.text).toBe('$3.90 · 4k fresh · 0% cache')
  expect(v.active?.lines.map(l => l.label)).toEqual(['Align', 'Build', 'Between phases'])
  const build = v.active!.lines[1]!
  expect(build.text).toBe('$3.00 · 2k fresh · 0% cache')
  expect(build.children?.map(c => [c.label, c.text])).toEqual([
    ['csv/01 Export button', '$1.00'],
    ['csv/02', '≈$2.00'],
  ])
})

test('by model and by person: the costliest first; a session with no git user is named so', () => {
  const rows = [
    row(0.5, { model: 'claude-haiku-5-5', user: null }),
    row(2, { model: 'claude-opus-5-5' }),
    row(1, { model: 'claude-sonnet-5-5', user: 'Mate Mate <mate@example.com>' }),
  ]
  expect(
    view({ group: 'model', features: [feature(CSV, rows)] }).active?.lines.map(l => l.label),
  ).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'])
  expect(
    view({ group: 'person', features: [feature(CSV, rows)] }).active?.lines.map(l => l.label),
  ).toEqual(['Dev Dev <dev@example.com>', 'Mate Mate <mate@example.com>', NO_USER_LABEL])
})

test('other features follow, archived ones last; ones that spent nothing are left out', () => {
  const v = view({
    features: [
      feature(CSV, [row(1)]),
      feature('spec:old', [row(9)], { title: 'Old thing', isArchived: true }),
      feature('spec:big', [row(3)], { title: 'Big thing' }),
      feature('spec:none', [], { title: 'Nothing yet' }),
    ],
  })
  expect(v.others.map(f => [f.title, f.isArchived])).toEqual([
    ['Big thing', false],
    ['Old thing', true],
  ])
})

test('Outside features and unreadable files are listed; with no cost ledger it is said so', () => {
  const v = view({
    hasCost: false,
    outside: [row(null, { feature: null, phase: null })],
    skipped: ['.craftory/spend/csv/bad.json'],
  })
  expect(v.outside).toBe('1k fresh · 0% cache · $ unavailable on this surface')
  expect(v.skipped).toEqual(['.craftory/spend/csv/bad.json'])
  expect(v.active).toBeNull()
})

test('the grouping read from the store falls back to phase', () => {
  expect(parseSpendGroup('model')).toBe('model')
  expect(parseSpendGroup('nope')).toBe('phase')
  expect(parseSpendGroup(undefined)).toBe('phase')
})

const TOKENS = {
  input_tokens: 100,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1_000,
}

const fileOf = (session: string, user: string, rows: SpendRow[]) =>
  serialiseSpendFile({ version: 1, session, user, startedAt: '2026-11-16T09:00:00.000Z', rows })

const mainStep = async ($: Engine, index: number) => {
  const stream = $.turn.step({ turnId: 'm', index, model: 'opus', messageCount: 1 } as never)
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await iterator.next()).done) {
    // drained: the step's result is what counts
  }
}

type PaneSurface = 'terminal' | 'desktop' | 'mobile'

const spendWorld = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  surface: PaneSurface,
  options: WorldOptions = {},
) => {
  let usd = 0
  const w = featureWorld(on, {
    surfaces: [surface],
    cost: () => usd,
    usage: () => TOKENS,
    ...options,
    files: {
      '.craftory/spend/csv/s0.json': fileOf('s0', 'Mate Mate <mate@example.com>', [
        row(2, { phase: 'spec' }),
      ]),
      '.craftory/spend/csv/broken.json': '{',
      ...options.files,
    },
  })
  await startSession($, surface)
  usd = 0.5
  await mainStep($, 0)
  return w
}

const openSpend = async ($: Engine, surface: PaneSurface) => {
  const pane = await mountPane($, surface)
  await pane.press({ key: 'tab-spend' })
  await pane.redraw()
  return pane
}

for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
  test(`${surface}: the Spend tab breaks the Feature down and names the file it could not read`, async ($, on) => {
    await spendWorld(on, $, surface)
    const pane = await openSpend($, surface)
    const words = await texts(pane)
    expect(words).toContain('Export invoices as CSV')
    expect(words).toContain('$2.50 · 1k fresh · 48% cache')
    expect(words).toContain('Spec')
    expect(words).toContain('Between phases')
    expect(words).toContain('.craftory/spend/csv/broken.json')
    const groups = (await pane.findAll({ type: 'Button' })).filter(b =>
      b.key?.startsWith('spend-group-'),
    )
    expect(groups.length).toBe(surface === 'mobile' ? 0 : 3)
  })
}

test('the Spend tab’s count is the active Feature’s spend', async ($, on) => {
  await spendWorld(on, $, 'terminal')
  const pane = await mountPane($, 'terminal')
  expect(await allText(pane)).toMatch(/Spend\s+\$2\.50/)
})

test('choosing a grouping keeps it for next time and redraws by it', async ($, on) => {
  const w = await spendWorld(on, $, 'terminal')
  const pane = await openSpend($, 'terminal')
  await pane.press({ key: 'spend-group-person' })
  await pane.redraw()
  expect(w.store.get('spendGroup')).toBe('person')
  const words = await texts(pane)
  expect(words).toContain('Mate Mate <mate@example.com>')
  expect(words).toContain(NO_USER_LABEL)
})

test('with nothing spent the tab says what it will count', async ($, on) => {
  featureWorld(on, { cost: () => 0 })
  await startSession($)
  const pane = await openSpend($, 'terminal')
  expect(await allText(pane)).toContain('Nothing spent yet.')
})
