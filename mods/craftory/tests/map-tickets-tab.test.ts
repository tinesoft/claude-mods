import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { allText, featureJson, featureWorld, mountPane, startSession, texts } from './harness'
import { scenarioFiles } from './wayfinder'

const mixed = () => ({ files: scenarioFiles('local', 'mixed') })

const ticketsTab = async ($: Engine) => {
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'tab-tickets' })
  await pane.redraw()
  return pane
}

/** The mixed map with its two takeable tickets claimed, so nothing is takeable. */
const nothingTakeable = () => {
  const files = { ...scenarioFiles('local', 'mixed') }
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith('03-invoice-layout.md') || path.endsWith('04-tax-rounding.md'))
      files[path] = text.replace(/^# .*$/m, (m: string) => `${m}\nStatus: claimed\nAssignee: ada`)
  }
  return { files }
}

test('no map, no map card on the Tickets tab', async ($, on) => {
  featureWorld(on)
  await startSession($)
  expect(await (await ticketsTab($)).find({ key: 'tickets-map' })).toBeUndefined()
})

test('the Tickets tab opens with the map card: counts, then Takeable, Claimed, Blocked, Decided', async ($, on) => {
  featureWorld(on, mixed())
  await startSession($)
  const pane = await ticketsTab($)
  const words = await texts(pane)
  const at = (needle: string) => words.findIndex(w => w.includes(needle))
  const order = [
    '2 decided · 4 open (1 claimed)',
    'Takeable',
    'Claimed',
    '@tinekondo',
    'Blocked',
    'waits on Proration rules',
    'Decided (2)',
  ]
  const idx = order.map(at)
  expect(idx.every(i => i >= 0)).toBe(true)
  expect([...idx].sort((a, b) => a - b)).toEqual(idx)
})

test('Work next ticket submits /wayfinder with the map', async ($, on) => {
  const w = featureWorld(on, mixed())
  await startSession($)
  const pane = await ticketsTab($)
  await pane.press({ key: 'work-next' })
  expect(w.commandsRun).toEqual([
    { command: 'mattpocock-skills:wayfinder', args: '.scratch/billing-v2/map.md' },
  ])
})

test('a Takeable row submits its named ticket', async ($, on) => {
  const w = featureWorld(on, mixed())
  await startSession($)
  const pane = await ticketsTab($)
  await pane.press({ key: 'take-billing-v2/04' })
  expect(w.commandsRun).toEqual([
    {
      command: 'mattpocock-skills:wayfinder',
      args: '.scratch/billing-v2/map.md .scratch/billing-v2/issues/04-tax-rounding.md',
    },
  ])
})

test('with nothing takeable the button is disabled with a hint, and Claimed and Blocked stay', async ($, on) => {
  const w = featureWorld(on, nothingTakeable())
  await startSession($)
  const pane = await ticketsTab($)
  expect(await pane.find({ key: 'work-next' })).toBeUndefined()
  const text = await allText(pane)
  expect(text).toContain('Nothing takeable')
  expect(text).toContain('Claimed')
  expect(text).toContain('Blocked')
  expect(w.commandsRun).toEqual([])
})

test('rows and the map link to their files, and the card never writes', async ($, on) => {
  const w = featureWorld(on, mixed())
  await startSession($)
  const pane = await ticketsTab($)
  const links = await pane.findAll({ type: 'Link' })
  const byHref = new Map(links.map(l => [l.props.href, l.props.label]))
  expect(byHref.get('.scratch/billing-v2/issues/04-tax-rounding.md')).toContain('Tax rounding')
  expect(byHref.get('.scratch/billing-v2/issues/03-invoice-layout.md')).toContain('Invoice layout')
  expect(byHref.get('.scratch/billing-v2/issues/05-proration-rules.md')).toContain(
    'Proration rules',
  )
  expect(byHref.get('.scratch/billing-v2/issues/06-refund-flow.md')).toContain('Refund flow')
  expect(byHref.get('.scratch/billing-v2/map.md')).toBe('Open map')
  expect(byHref.has('.scratch/billing-v2/issues/01-billing-model.md')).toBe(false)
  expect(w.writes).toEqual([])
})

test('a route-clear map says so on the Tickets tab, with the fog hint', async ($, on) => {
  featureWorld(on, { files: scenarioFiles('local', 'route-clear') })
  await startSession($)
  const text = await allText(await ticketsTab($))
  expect(text).toContain('2 decided · 0 open')
  expect(text).toContain('No open tickets · Route clear? Not yet specified still has fog.')
})

test('a route-clear map without fog drops the fog hint', async ($, on) => {
  const files = { ...scenarioFiles('local', 'route-clear') }
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith('map.md')) files[path] = text.replace(/## Not yet specified[\s\S]*$/, '')
  }
  featureWorld(on, { files })
  await startSession($)
  const text = await allText(await ticketsTab($))
  expect(text).toContain('No open tickets · Route clear?')
  expect(text).not.toContain('fog')
})

test('a closed map is labelled Closed and still shows its tickets', async ($, on) => {
  featureWorld(on, { files: scenarioFiles('local', 'closed-map') })
  await startSession($)
  const pane = await ticketsTab($)
  const text = await allText(pane)
  const labels = (await pane.findAll({ type: 'Link' })).map(l => String(l.props.label))
  expect(text).toContain('2 decided · 1 open · Closed')
  expect(labels.some(l => l.includes('Invoice layout'))).toBe(true)
  expect(text).toContain('Decided (2)')
  expect(text).not.toContain('Route clear?')
})

test('a stale map link shows the quiet Map not found line on the card too', async ($, on) => {
  featureWorld(on, {
    files: {
      ...scenarioFiles('local', 'stale-link'),
      '.craftory/features/csv.json': featureJson({ map: 'notes' }),
    },
  })
  await startSession($)
  expect(await allText(await ticketsTab($))).toContain('Map not found')
})

test('a valid link shows no Map not found line on the card', async ($, on) => {
  featureWorld(on, {
    files: {
      ...scenarioFiles('local', 'mixed'),
      '.craftory/features/csv.json': featureJson({ map: 'billing-v2' }),
    },
  })
  await startSession($)
  expect(await allText(await ticketsTab($))).not.toContain('Map not found')
})

test('Decided is collapsed by default, expands on press, and its rows link to the tickets', async ($, on) => {
  featureWorld(on, mixed())
  await startSession($)
  const pane = await ticketsTab($)
  const links = async () => (await pane.findAll({ type: 'Link' })).map(l => String(l.props.label))
  expect(await links()).not.toContain('Billing model (grilling)')
  await pane.press({ key: 'decided-toggle' })
  await pane.redraw()
  expect(await links()).toContain('Billing model (grilling)')
  expect(await links()).toContain('Gateway limits (research)')
  const hrefs = (await pane.findAll({ type: 'Link' })).map(l => String(l.props.href))
  expect(hrefs).toContain('.scratch/billing-v2/issues/01-billing-model.md')
  await pane.press({ key: 'decided-toggle' })
  await pane.redraw()
  expect(await links()).not.toContain('Billing model (grilling)')
})
