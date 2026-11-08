import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  allText,
  featureWorld,
  type Finder,
  mountBand,
  mountPane,
  startSession,
  turnComplete,
} from './harness'
import { scenarioFiles } from './wayfinder'

const issues = '.scratch/billing-v2/issues'

/** Plays the skill: `/wayfinder` writes a ticket's `Status:` line; the mod only reads it back. */
const wayfinder = (files: Map<string, string>, file: string, status: 'claimed' | 'resolved') => {
  const path = `${issues}/${file}`
  const text = files.get(path)!
  const claimed = status === 'claimed' ? '\nAssignee: tinekondo' : ''
  files.set(path, text.replace(/^Status: .*$/m, `Status: ${status}${claimed}`))
}

const chip = async ($: Engine) =>
  (await (await mountBand($, 'terminal', 200)).find({ key: 'box-map-chip' }))!.text

const card = async ($: Engine) => {
  await (await mountBand($, 'terminal', 200)).press({ key: 'map-chip' })
  const text = (await (await mountBand($, 'terminal', 200)).find({ key: 'map-card' }))!.text
  await (await mountBand($, 'terminal', 200)).press({ key: 'map-chip' })
  return text
}

const ticketsTab = async (pane: Finder & { redraw: () => Promise<unknown> }) => {
  await pane.redraw()
  return allText(pane)
}

test('a claim and then a resolve by /wayfinder update the chip, card and Tickets tab', async ($, on) => {
  const w = featureWorld(on, { files: scenarioFiles('local', 'mixed') })
  await startSession($)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'tab-tickets' })

  expect(await chip($)).toContain('Billing v2 · 2 decided · 4 open')
  expect(await card($)).toContain('2 decided · 4 open (1 claimed)')
  expect(await ticketsTab(pane)).toContain('2 decided · 4 open (1 claimed)')

  wayfinder(w.files, '03-invoice-layout.md', 'claimed')
  await turnComplete($)
  expect(await chip($)).toContain('Billing v2 · 2 decided · 4 open')
  expect(await card($)).toContain('2 decided · 4 open (2 claimed)')
  expect(await ticketsTab(pane)).toContain('2 decided · 4 open (2 claimed)')

  wayfinder(w.files, '03-invoice-layout.md', 'resolved')
  await turnComplete($)
  expect(await chip($)).toContain('Billing v2 · 3 decided · 3 open')
  expect(await card($)).toContain('3 decided · 3 open (1 claimed)')
  const tab = await ticketsTab(pane)
  expect(tab).toContain('3 decided · 3 open (1 claimed)')
  expect(tab).toContain('Decided (3)')
})
