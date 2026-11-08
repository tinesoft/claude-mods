import { expect, test } from 'claude-code/testing'
import type { Space } from 'claude-code'
import { across } from '../src/theme'
import { featureWorld, mountBand, startSession } from './harness'
import { scenarioFiles } from './wayfinder'

const mixed = () => ({ files: scenarioFiles('local', 'mixed') })

type Node = { type: string; props: Record<string, unknown>; children?: unknown[] }
const isNode = (c: unknown): c is Node => typeof c === 'object' && c !== null && 'type' in c

/** Cells a terminal tree draws on one line: Texts by length, rows summed with their gaps. */
const cells = (node: unknown): number => {
  if (typeof node === 'string') return [...node].length
  if (!isNode(node)) return 0
  const kids = (node.children ?? []).map(cells)
  if (node.type !== 'Box') return kids.reduce((a, b) => a + b, 0)
  if (node.props.flexDirection === 'column') return Math.max(0, ...kids)
  const gap = node.props.columnGap === undefined ? 0 : across(node.props.columnGap as Space)
  const padX = node.props.paddingX === undefined ? 0 : across(node.props.paddingX as Space)
  const border = node.props.borderStyle === undefined ? 0 : 2
  return kids.reduce((a, b) => a + b, 0) + gap * Math.max(0, kids.length - 1) + 2 * padX + border
}

test('terminal at 115 columns with a map and a long title shows the full rail', async ($, on) => {
  featureWorld(on, mixed())
  await startSession($)
  const band = await mountBand($, 'terminal', 115)
  expect(await band.find({ key: 'rail' })).toBeDefined()
  expect(await band.find({ key: 'phase-retro' })).toBeDefined()
  expect(await band.find({ key: 'map-chip' })).toBeDefined()
  expect(await band.find({ key: 'summary' })).toBeUndefined()
})

test('terminal: whenever the rail shows, its one line fits the band', async ($, on) => {
  featureWorld(on, mixed())
  await startSession($)
  let shown = 0
  for (let columns = 60; columns <= 200; columns += 1) {
    const rail = await (await mountBand($, 'terminal', columns)).find({ key: 'rail' })
    if (rail === undefined) continue
    shown += 1
    expect({ columns, cells: cells(rail) }).toEqual({
      columns,
      cells: Math.min(columns, cells(rail)),
    })
  }
  expect(shown).toBeGreaterThan(80)
})

test('terminal at 60 columns falls back to the summary', async ($, on) => {
  featureWorld(on, mixed())
  await startSession($)
  const band = await mountBand($, 'terminal', 60)
  expect(await band.find({ key: 'rail' })).toBeUndefined()
  expect(await band.find({ key: 'summary' })).toBeDefined()
})

test('desktop at 85 body columns keeps the row with a map and wraps it', async ($, on) => {
  featureWorld(on, { surfaces: ['desktop'], theme: 'dark', ...mixed() })
  await startSession($, 'desktop')
  const band = await mountBand($, 'desktop', 85, 12)
  const rail = (await band.find({ key: 'rail' }))!
  expect(rail).toBeDefined()
  expect(await band.find({ key: 'summary' })).toBeUndefined()
  expect(await band.find({ key: 'phase-retro' })).toBeDefined()
  expect((await band.find({ key: 'phases' }))!.props.flexWrap).toBe('wrap')
  expect(rail.props.borderStyle).toBeUndefined()
  expect(rail.props.backgroundColor).toBeUndefined()
})

test('desktop never collapses for width, even far narrower than the rail', async ($, on) => {
  featureWorld(on, { surfaces: ['desktop'], theme: 'light', ...mixed() })
  await startSession($, 'desktop')
  const band = await mountBand($, 'desktop', 40, 12)
  expect(await band.find({ key: 'rail' })).toBeDefined()
  expect(await band.find({ key: 'summary' })).toBeUndefined()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the summary layout wins over a band wide enough for the row`, async ($, on) => {
    featureWorld(on, {
      surfaces: [surface],
      theme: 'light',
      store: { prefs: { railLayout: 'summary' } },
      ...mixed(),
    })
    await startSession($, surface)
    const band = await mountBand($, surface, 200)
    expect(await band.find({ key: 'summary' })).toBeDefined()
    expect(await band.find({ key: 'rail' })).toBeUndefined()
  })
}

for (const maxRows of [12, 40]) {
  test(`desktop: a card over a wrapped rail is compact so both fit the band (${maxRows} rows)`, async ($, on) => {
    featureWorld(on, { surfaces: ['desktop'], theme: 'light', ...mixed() })
    await startSession($, 'desktop')
    await (await mountBand($, 'desktop', 85, maxRows)).press({ key: 'phase-build' })
    const card = (await (await mountBand($, 'desktop', 85, maxRows)).find({ key: 'card' }))!
    expect(card.props.paddingY).toBe('xs')
  })
}

test('desktop: the same card over a one-line rail is roomy when the band is tall', async ($, on) => {
  featureWorld(on, { surfaces: ['desktop'], theme: 'light' })
  await startSession($, 'desktop')
  await (await mountBand($, 'desktop', 200, 40)).press({ key: 'phase-build' })
  const card = (await (await mountBand($, 'desktop', 200, 40)).find({ key: 'card' }))!
  expect(card.props.paddingY).toBe('lg')
})
