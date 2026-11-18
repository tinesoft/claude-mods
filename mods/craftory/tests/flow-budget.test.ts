import { type Engine, expect, test } from 'claude-code/testing'
import { featureBudgetOf } from '../src/budgets'
import { DEFAULT_CONFIG } from '../src/config'
import { mergeFeature, parseFeature, serialiseFeature } from '../src/features'
import { ownBudgetOf } from '../src/flow-budget'
import { serialiseSpendFile } from '../src/spend'
import { paint } from '../src/theme'
import type { SpendRow } from '../types'
import {
  allText,
  featureJson,
  featureWorld,
  IN_RANGE,
  MATT_SKILLS,
  mattCommands,
  mountPane,
  SETUP_FILES,
  startSession,
  texts,
  world,
  type Finder,
  type WorldOptions,
} from './harness'

/** Align's spend, committed by another session. */
const alignFile = (usd: number) =>
  serialiseSpendFile({
    version: 1,
    session: 's0',
    startedAt: '2026-11-16T10:00:00.000Z',
    rows: [
      {
        feature: 'spec:csv' as SpendRow['feature'],
        phase: 'align',
        ticket: null,
        agentId: null,
        model: 'claude-opus-5-5',
        tokens: { input: 2_000, output: 1_000, cacheRead: 7_000, cacheWrite: 0 },
        usd,
        isEstimated: false,
        steps: 4,
      },
    ],
  })

const config = (budgets: Record<string, unknown>) =>
  `${JSON.stringify({ version: 1, budgets }, null, 2)}\n`

const RECORD = '.craftory/features/csv.json'

/** A Feature that spent `usd` on Align, on a host with a cost ledger unless `cost` is left out. */
const spentOn = (
  on: Parameters<typeof featureWorld>[0],
  usd: number,
  files: Record<string, string> = {},
  options: WorldOptions = { cost: () => 0 },
) =>
  featureWorld(on, {
    ...options,
    files: { '.craftory/spend/csv/s0.json': alignFile(usd), ...files },
  })

const flowTab = async ($: Engine, surface: 'terminal' | 'desktop' | 'mobile' = 'terminal') => {
  await startSession($, surface)
  return mountPane($, surface)
}

const savedBudgets = (w: { files: Map<string, string> }) =>
  JSON.parse(w.files.get(RECORD)!).budgets as { usd?: number | null } | undefined

const inputs = async (pane: Finder) => (await pane.findAll({ type: 'Input' })).map(i => i.key)

test('an own budget is whole dollars, $ or not; 0 is none; empty is the default; anything else is refused', () => {
  expect(ownBudgetOf('30')).toEqual({ usd: 30 })
  expect(ownBudgetOf(' $45 ')).toEqual({ usd: 45 })
  expect(ownBudgetOf('')).toEqual({ usd: null })
  expect(ownBudgetOf('0')).toEqual({ usd: 0 })
  expect(ownBudgetOf('$0')).toEqual({ usd: 0 })
  expect(ownBudgetOf('100000')).toEqual({ usd: 100_000 })
  for (const text of ['2.5', 'lots', '-3', '100001'])
    expect(ownBudgetOf(text)).toEqual({
      problem: 'Budget: use whole dollars up to $100000, or 0 for none',
    })
})

test('a dropped own budget is kept through a save, a reload and a merge with an older record', () => {
  const loaded = (budgets: unknown) => {
    const read = parseFeature(featureJson({ budgets }))
    if (read.state !== 'ok') throw new Error('unreadable record')
    return read.value
  }
  const defaults = { ...DEFAULT_CONFIG.budgets, featureUsd: 50 }
  const older = loaded({ usd: 20 })
  const cleared = loaded({ usd: null })
  const merged = mergeFeature(older, cleared)
  expect(merged.budgets).toEqual({ usd: null })
  const reloaded = parseFeature(serialiseFeature(merged))
  expect(reloaded.state === 'ok' && reloaded.value.budgets).toEqual({ usd: null })
  expect(featureBudgetOf(defaults, { kind: 'specced', key: 'spec:csv', record: merged })).toBe(50)
  expect(mergeFeature(cleared, loaded({ usd: 0 })).budgets).toEqual({ usd: 0 })
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the Flow tab’s Budget row reads the Feature’s spend of its budget, amber near it`, async ($, on) => {
    spentOn(on, 0.85, { '.craftory/config.json': config({ featureUsd: 1 }) })
    const pane = await flowTab($, surface)
    const words = await texts(pane)
    expect(words).toContain('Budget')
    expect(words).toContain('$0.85 of $1 · Near budget')
    expect(words).toContain('The default from Settings › Pipeline')
    const row = (await pane.findAll({ type: 'Text' })).find(
      t => t.text === '$0.85 of $1 · Near budget',
    )
    expect([undefined, 'light', 'dark'].map(t => paint('hook', t as never).fg)).toContain(
      row?.props.color,
    )
    expect(await inputs(pane)).toContain('flow-budget-edit')
  })

  test(`${surface}: Edit writes the Feature’s own budget on its record`, async ($, on) => {
    const w = spentOn(on, 0.85, { '.craftory/config.json': config({ featureUsd: 1 }) })
    const pane = await flowTab($, surface)
    await pane.input({ key: 'flow-budget-edit', text: '$30' })
    expect(savedBudgets(w)).toEqual({ usd: 30 })
    await pane.redraw()
    const words = await texts(pane)
    expect(words).toContain('$0.85 of $30')
    expect(words).not.toContain('The default from Settings › Pipeline')
  })
}

test('Edit with 0 leaves the Feature with no budget, over the default', async ($, on) => {
  const w = spentOn(on, 0.85, {
    '.craftory/config.json': config({ featureUsd: 50 }),
    [RECORD]: featureJson({ budgets: { usd: 20 } }),
  })
  const pane = await flowTab($)
  expect(await texts(pane)).toContain('$0.85 of $20')
  await pane.input({ key: 'flow-budget-edit', text: '0' })
  expect(savedBudgets(w)).toEqual({ usd: 0 })
  await pane.redraw()
  expect(await texts(pane)).toContain('$0.85 · No budget')
})

test('Edit with an empty field drops the own budget, and the default applies again after a reload', async ($, on) => {
  const w = spentOn(on, 0.85, {
    '.craftory/config.json': config({ featureUsd: 50 }),
    [RECORD]: featureJson({ budgets: { usd: 20 } }),
  })
  const pane = await flowTab($)
  await pane.input({ key: 'flow-budget-edit', text: '' })
  expect(savedBudgets(w)).toEqual({ usd: null })
  await pane.redraw()
  expect(await texts(pane)).toContain('$0.85 of $50')
  expect(await texts(pane)).toContain('The default from Settings › Pipeline')
  await pane.unmount()
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1' } as never)
  const again = await flowTab($)
  expect(await texts(again)).toContain('$0.85 of $50')
  expect(await texts(again)).toContain('The default from Settings › Pipeline')
})

test('Edit refuses what is not whole dollars with a line, and writes nothing', async ($, on) => {
  const w = spentOn(on, 0.85, { [RECORD]: featureJson({ budgets: { usd: 20 } }) })
  const pane = await flowTab($)
  await pane.input({ key: 'flow-budget-edit', text: '2.5' })
  expect(savedBudgets(w)).toEqual({ usd: 20 })
  await pane.redraw()
  expect(await allText(pane)).toContain('Budget: use whole dollars up to $100000, or 0 for none')
  await pane.input({ key: 'flow-budget-edit', text: '25' })
  await pane.redraw()
  expect(savedBudgets(w)).toEqual({ usd: 25 })
  expect(await allText(pane)).not.toContain('use whole dollars')
})

test('mobile: the Budget row is read-only', async ($, on) => {
  spentOn(on, 0.85, { [RECORD]: featureJson({ budgets: { usd: 20 } }) })
  const pane = await flowTab($, 'mobile')
  expect(await texts(pane)).toContain('$0.85 of $20')
  expect(await inputs(pane)).not.toContain('flow-budget-edit')
})

test('where the host keeps no cost ledger the Budget row says budgets do not apply', async ($, on) => {
  spentOn(on, 0.85, { [RECORD]: featureJson({ budgets: { usd: 20 } }) }, {})
  const text = await allText(await flowTab($))
  expect(text).toContain('Needs a cost ledger: budgets do not apply on this surface')
  expect(text).not.toContain('of $20')
})

test('a draft shows the default budget, to be set once the spec binds, with no field', async ($, on) => {
  world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    cost: () => 0,
    files: { ...SETUP_FILES, '.craftory/config.json': config({ featureUsd: 5 }) },
    store: {
      drafts: {
        d1: {
          draftId: 'd1',
          title: 'Export invoices as CSV',
          entry: 'align',
          enteredFrom: null,
          marks: { align: { ranAt: '1970-01-01T00:16:00.000Z' } },
          startedAt: '1970-01-01T00:15:00.000Z',
        },
      },
      lastActive: 'draft:d1',
    },
  })
  const pane = await flowTab($)
  const words = await texts(pane)
  expect(words).toContain('Budget')
  expect(words).toContain('$0.00 of $5')
  expect(words).toContain('The default · set once the spec binds')
  expect(await inputs(pane)).not.toContain('flow-budget-edit')
})
