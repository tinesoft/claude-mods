import { type Engine, expect, test } from 'claude-code/testing'
import { serialiseSpendFile } from '../src/spend'
import { paint } from '../src/theme'
import type { SpendRow } from '../types'
import {
  allText,
  featureJson,
  featureWorld,
  mountBand,
  mountPane,
  startSession,
  texts,
  type Finder,
  type WorldOptions,
} from './harness'

/** Align's spend, committed by another session: 3k fresh tokens, 78% cache. */
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

/** A Feature that spent `usd` on Align, on a host with a cost ledger unless `cost` is left out. */
const spentOn = (
  on: Parameters<typeof featureWorld>[0],
  usd: number,
  files: Record<string, string>,
  options: WorldOptions = { cost: () => 0 },
) =>
  featureWorld(on, {
    ...options,
    files: { '.craftory/spend/csv/s0.json': alignFile(usd), ...files },
  })

const openCard = async ($: Engine, surface: 'terminal' | 'desktop', phase: string) => {
  await (await mountBand($, surface, 200, 60)).press({ key: `phase-${phase}` })
  return mountBand($, surface, 200, 60)
}

/** The Text that starts with `head`: the engine keeps no key on a Text. */
const textStarting = async (drawing: Finder, head: string) =>
  (await drawing.findAll({ type: 'Text' })).find(t => t.text.startsWith(head))

const inks = (role: 'hook' | 'danger') =>
  [undefined, 'light', 'dark'].map(t => paint(role, t as 'light' | 'dark' | undefined).fg)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a phase card’s Spend row reads of its budget, and turns amber with Near budget at 80%`, async ($, on) => {
    spentOn(on, 0.85, { '.craftory/config.json': config({ phaseUsd: { align: 1 } }) })
    await startSession($, surface)
    const row = await textStarting(await openCard($, surface, 'align'), '$')
    expect(row?.text).toBe('$0.85 of $1 · 3k fresh · 78% cache · Near budget')
    expect(inks('hook')).toContain(row?.props.color)
  })

  test(`${surface}: a phase card’s Spend row at its own budget turns red with Over budget`, async ($, on) => {
    spentOn(on, 1.2, {
      '.craftory/features/csv.json': featureJson({ budgets: { phases: { align: 1 } } }),
    })
    await startSession($, surface)
    const row = await textStarting(await openCard($, surface, 'align'), '$')
    expect(row?.text).toBe('$1.20 of $1 · 3k fresh · 78% cache · Over budget')
    expect(inks('danger')).toContain(row?.props.color)
  })
}

test('under its budget a Spend row reads of it in its usual ink, with no word', async ($, on) => {
  spentOn(on, 0.4, { '.craftory/config.json': config({ phaseUsd: { align: 1 } }) })
  await startSession($)
  const row = await textStarting(await openCard($, 'terminal', 'align'), '$')
  expect(row?.text).toBe('$0.40 of $1 · 3k fresh · 78% cache')
  expect([...inks('hook'), ...inks('danger')]).not.toContain(row?.props.color)
})

test('the status line reads the Feature’s own budget over the default', async ($, on) => {
  const w = spentOn(on, 0.4, {
    '.craftory/config.json': config({ featureUsd: 50 }),
    '.craftory/features/csv.json': featureJson({ budgets: { usd: 1 } }),
  })
  await startSession($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · $0.40 of $1 · /craftory')
})

test('the status line at the Feature’s budget says Over budget', async ($, on) => {
  const w = spentOn(on, 1, { '.craftory/config.json': config({ featureUsd: 1 }) })
  await startSession($)
  expect(w.statuses.at(-1)).toBe(
    'Export invoices as CSV · Build · $1.00 of $1 · Over budget · /craftory',
  )
})

test('the summary chip reads the Feature’s spend of its budget, amber near it', async ($, on) => {
  spentOn(
    on,
    0.85,
    { '.craftory/config.json': config({ featureUsd: 1 }) },
    { cost: () => 0, store: { prefs: { railLayout: 'summary' } } },
  )
  await startSession($)
  const spend = await textStarting(await mountBand($, 'terminal', 200), ' · $')
  expect(spend?.text).toBe(' · $0.85 of $1 · Near budget')
  expect(inks('hook')).toContain(spend?.props.color)
})

test('the Spend tab reads the Feature and each phase of its budget', async ($, on) => {
  spentOn(on, 0.85, {
    '.craftory/config.json': config({ featureUsd: 5, phaseUsd: { align: 1 } }),
  })
  await startSession($, 'desktop')
  const pane = await mountPane($, 'desktop')
  await pane.press({ key: 'tab-spend' })
  await pane.redraw()
  const words = await texts(pane)
  expect(words).toContain('$0.85 of $5 · 3k fresh · 78% cache')
  expect(words).toContain('$0.85 of $1 · 3k fresh · 78% cache · Near budget')
})

test('/craftory’s text reply reads the Feature’s spend of its budget', async ($, on) => {
  spentOn(
    on,
    0.85,
    { '.craftory/config.json': config({ featureUsd: 1 }) },
    { cost: () => 0, surfaces: [] },
  )
  await startSession($)
  const text = (await $.command.run({ command: 'craftory', args: '' } as never)).text
  expect(text).toContain('Spend: $0.85 of $1 (3k fresh tokens) across 1 session · Near budget')
})

test('where the host keeps no cost ledger budgets do not apply: no of, no word', async ($, on) => {
  const w = spentOn(
    on,
    0.85,
    { '.craftory/config.json': config({ featureUsd: 1, phaseUsd: { align: 1 } }) },
    {},
  )
  await startSession($)
  expect(w.statuses.at(-1)).not.toContain(' of $')
  const card = await allText(await openCard($, 'terminal', 'align'))
  expect(card).not.toContain(' of $1')
  expect(card).not.toContain('Near budget')
})
