import { expect, test } from 'claude-code/testing'
import {
  allText,
  BAND_SURFACES,
  featureWorld,
  mountBand,
  mountPane,
  startSession,
  texts,
} from './harness'
import { scenarioFiles } from './wayfinder'

const mixed = () => ({ files: scenarioFiles('local', 'mixed') })

test('a repo with no map shows no chip', async ($, on) => {
  featureWorld(on)
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  expect(await band.find({ key: 'map-chip' })).toBeUndefined()
})

for (const surface of BAND_SURFACES) {
  test(`${surface}: a Local map shows in one rail chip with decided and open counts that add up`, async ($, on) => {
    featureWorld(on, { surfaces: [surface], ...mixed() })
    await startSession($, surface)
    const band = await mountBand($, surface, 200)
    // 2 decided + 4 open (2 takeable, 1 claimed, 1 blocked) = 6 tickets
    expect((await band.find({ key: 'map-chip' }))!.text).toContain('Billing v2 2✓ 4?')
    expect(await band.find({ key: 'rail' })).toBeDefined()
  })
}

test('the chip is ascii-safe when the glyphs are off', async ($, on) => {
  featureWorld(on, { ...mixed(), store: { prefs: { ascii: true } } })
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  expect((await band.find({ key: 'map-chip' }))!.text).toBe('* Billing v2 2v 4?')
})

test('pressing the chip opens the frontier card above the rail, naming the source, and Close shuts it', async ($, on) => {
  featureWorld(on, mixed())
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  await band.press({ key: 'map-chip' })
  const open = await mountBand($, 'terminal', 200)
  const card = (await open.find({ key: 'map-card' }))!
  expect(card.text).toContain('Wayfinder · Local · .scratch/billing-v2')
  expect(card.text).toContain('2 decided · 4 open (1 claimed)')
  expect(card.text).toContain('Invoice layout')
  expect(card.text).toContain('Tax rounding')
  expect(card.text).not.toContain('Refund flow')
  await open.press({ key: 'close' })
  expect(await (await mountBand($, 'terminal', 200)).find({ key: 'map-card' })).toBeUndefined()
})

test('opening a phase card closes the map card, and the reverse', async ($, on) => {
  featureWorld(on, mixed())
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'map-chip' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-build' })
  const band = await mountBand($, 'terminal', 200)
  expect(await band.find({ key: 'map-card' })).toBeUndefined()
  expect(await band.find({ key: 'card' })).toBeDefined()
})

test('a band too narrow for the rail collapses the map into the summary', async ($, on) => {
  featureWorld(on, mixed())
  await startSession($)
  const band = await mountBand($, 'terminal', 50)
  expect(await band.find({ key: 'rail' })).toBeUndefined()
  expect((await band.find({ key: 'map-chip' }))!.text).toContain('Billing v2 2✓ 4?')
  expect(await band.find({ key: 'summary' })).toBeDefined()
})

test('mobile: the chip heads the Flow tab', async ($, on) => {
  featureWorld(on, { surfaces: ['mobile'], ...mixed() })
  await startSession($, 'mobile')
  const pane = await mountPane($, 'mobile')
  await pane.press({ key: 'tab-flow' })
  await pane.redraw()
  const words = await texts(pane)
  const chip = words.findIndex(w => w.includes('Billing v2 2✓ 4?'))
  expect(chip).toBeGreaterThanOrEqual(0)
  expect(chip).toBeLessThan(words.findIndex(w => w.includes('Align')))
  await pane.press({ key: 'map-chip' })
  await pane.redraw()
  expect(await allText(pane)).toContain('Wayfinder · Local · .scratch/billing-v2')
})

test('showing a map never writes a file', async ($, on) => {
  const w = featureWorld(on, mixed())
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  await band.press({ key: 'map-chip' })
  expect(w.writes).toEqual([])
})

const scenario = (name: string) => ({ files: scenarioFiles('local', name) })

test('route clear: the chip and the card say no open tickets, with the fog hint, and never "reached"', async ($, on) => {
  featureWorld(on, scenario('route-clear'))
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  const chip = (await band.find({ key: 'map-chip' }))!.text
  expect(chip).toContain('No open tickets · Route clear?')
  expect(chip).toContain('fog')
  await band.press({ key: 'map-chip' })
  const card = (await (await mountBand($, 'terminal', 200)).find({ key: 'map-card' }))!.text
  expect(card).toContain('No open tickets · Route clear? Not yet specified still has fog.')
  expect(card).not.toMatch(/reached|stale/i)
})

test('route clear without fog has no fog hint', async ($, on) => {
  const files = scenarioFiles('local', 'route-clear')
  files['.scratch/billing-v2/map.md'] = files['.scratch/billing-v2/map.md']!.replace(
    '- How invoices are archived once a customer is closed.',
    '',
  )
  featureWorld(on, { files })
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  expect((await band.find({ key: 'map-chip' }))!.text).not.toContain('fog')
  await band.press({ key: 'map-chip' })
  const card = (await (await mountBand($, 'terminal', 200)).find({ key: 'map-card' }))!.text
  expect(card).toContain('No open tickets · Route clear?')
  expect(card).not.toContain('fog')
})

test('a closed map is labelled Closed and keeps its tickets visible', async ($, on) => {
  featureWorld(on, scenario('closed-map'))
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  const chip = (await band.find({ key: 'map-chip' }))!.text
  expect(chip).toContain('Closed')
  expect(chip).toContain('2✓ 1?')
  await band.press({ key: 'map-chip' })
  const card = (await (await mountBand($, 'terminal', 200)).find({ key: 'map-card' }))!.text
  expect(card).toContain('Closed')
  expect(card).toContain('Invoice layout')
})

test('an open map is preferred over a closed one', async ($, on) => {
  const files = {
    ...scenarioFiles('local', 'mixed'),
    ...Object.fromEntries(
      Object.entries(scenarioFiles('local', 'closed-map')).map(([p, t]) => [
        p.replace('billing-v2', 'old-effort'),
        t,
      ]),
    ),
  }
  featureWorld(on, { files })
  await startSession($)
  const chip = (await (await mountBand($, 'terminal', 200)).find({ key: 'map-chip' }))!.text
  expect(chip).toContain('2✓ 4?')
  expect(chip).not.toContain('Closed')
})

test('prose-trap: quoting a ticket in prose leaves the counts alone', async ($, on) => {
  featureWorld(on, scenario('prose-trap'))
  await startSession($)
  const chip = (await (await mountBand($, 'terminal', 200)).find({ key: 'map-chip' }))!.text
  expect(chip).toContain('1✓ 2?')
  expect(chip).not.toContain('Closed')
})
