import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { allText, featureWorld, mountPane, startSession, texts, type WorldOptions } from './harness'

const MAP = [
  '# Glossary Map',
  '',
  '## Contexts',
  '',
  '- [Billing](./billing/GLOSSARY.md): invoices and payments',
  '- [Shipping](./shipping/GLOSSARY.md): parcels and routes',
  '- [Ghost](./ghost/GLOSSARY.md): not written yet',
  '- not a link',
  '- [Out](../elsewhere/GLOSSARY.md): outside the repo',
  '',
  '## Relationships',
  '',
  '- **Billing → Shipping**: an invoice triggers a parcel',
  '',
].join('\n')

const BILLING =
  '# Billing\n\n## Language\n\n**Customer**:\nThe paying account.\n_Avoid_: client\n\n**Ledger line**:\nA priced row.\n'
const SHIPPING = '# Shipping\n\n## Language\n\n**Parcel**:\nA box that travels.\n'

const files = (extra: Record<string, string> = {}): WorldOptions => ({
  files: {
    'GLOSSARY-MAP.md': MAP,
    'billing/GLOSSARY.md': BILLING,
    'shipping/GLOSSARY.md': SHIPPING,
    ...extra,
  },
})

const open = async (on: Parameters<typeof featureWorld>[0], $: Engine, options: WorldOptions) => {
  const w = featureWorld(on, { surfaces: ['terminal'], ...options })
  await startSession($, 'terminal')
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'tab-glossary' })
  await pane.redraw()
  return { w, pane }
}

test('with a map the Glossary tab lists every context under its name, even when docs/agents/domain.md is stale', async ($, on) => {
  const { pane } = await open(on, $, files())
  const words = await texts(pane)
  for (const word of ['Billing', 'Shipping', 'Customer', 'Ledger line', 'Parcel'])
    expect(words).toContain(word)
  expect(words).toContain('No glossary yet')
  expect(words).toContain('GLOSSARY-MAP.md · 3 contexts · 0 added this session')
})

test('a malformed or out-of-repo map line is a problem line and the other contexts still show', async ($, on) => {
  const { pane } = await open(on, $, files())
  const all = await allText(pane)
  expect(all).toContain('GLOSSARY-MAP.md: cannot read "- not a link"')
  expect(all).toContain('GLOSSARY-MAP.md: ../elsewhere/GLOSSARY.md is outside the repo')
})

test('the filter chips narrow the tab to one context and are remembered', async ($, on) => {
  const { pane } = await open(on, $, files())
  await pane.press({ key: 'glossary-chip-Shipping' })
  await pane.redraw()
  const words = await texts(pane)
  expect(words).toContain('Parcel')
  expect(words).not.toContain('Customer')
  await pane.press({ key: 'glossary-chip-*' })
  await pane.redraw()
  expect(await texts(pane)).toContain('Customer')
})

test('search spans every context', async ($, on) => {
  const { pane } = await open(on, $, files())
  await pane.input({ key: 'glossary-search', text: 'travels', kind: 'change' })
  await pane.redraw()
  const words = await texts(pane)
  expect(words).toContain('Parcel')
  expect(words).not.toContain('Customer')
})

test('Settings, Glossary shows the map read-only', async ($, on) => {
  const { pane } = await open(on, $, files())
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'section-section-glossary' })
  const all = await allText(pane)
  expect(all).toContain('Billing: invoices and payments')
  expect(all).toContain('Billing → Shipping')
})
