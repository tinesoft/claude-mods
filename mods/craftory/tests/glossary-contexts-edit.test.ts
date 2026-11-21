import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { fakeGit } from './build-harness'
import { allText, featureWorld, mountPane, startSession, texts, type WorldOptions } from './harness'

const MAP = [
  '# Glossary Map',
  '',
  '## Contexts',
  '',
  '- [Billing](./billing/GLOSSARY.md): invoices and payments',
  '- [Shipping](./shipping/GLOSSARY.md): parcels and routes',
  '- [Ghost](./ghost/GLOSSARY.md): not written yet',
  '',
].join('\n')

const BILLING =
  '# Billing\n\nIntro.\n\n## Language\n\n**Customer**:\nThe paying account.\n_Avoid_: client\n\n**Ledger line**:\nA priced row.\n\n## Relationships\n\n- **Customer** pays\n'
const SHIPPING = '# Shipping\n\n## Language\n\n**Parcel**:\nA box that travels.\n'

const FILES = {
  'GLOSSARY-MAP.md': MAP,
  'billing/GLOSSARY.md': BILLING,
  'shipping/GLOSSARY.md': SHIPPING,
}

const open = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  options: WorldOptions = {},
) => {
  const w = featureWorld(on, {
    surfaces: ['terminal'],
    ...options,
    files: { ...FILES, ...options.files },
  })
  const surface = options.surfaces?.[0] ?? 'terminal'
  await startSession($, surface)
  const pane = await mountPane($, surface)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'section-section-glossary' })
  return { w, pane }
}

const fill = async (pane: Awaited<ReturnType<typeof open>>['pane'], name: string) => {
  await pane.input({ key: 'set-gl-name', text: name, kind: 'change' })
  await pane.input({ key: 'set-gl-definition', text: 'A definition.', kind: 'change' })
}

test('Settings lists each context with its own Edit and Delete', async ($, on) => {
  const { pane } = await open(on, $)
  expect(await pane.find({ key: 'gl-edit-Billing-Customer' })).toBeDefined()
  expect(await pane.find({ key: 'gl-delete-Shipping-Parcel' })).toBeDefined()
  expect(await texts(pane)).toContain('No glossary yet')
})

test('adding a term to a chosen context writes only that file, and deleting it restores it', async ($, on) => {
  const { w, pane } = await open(on, $)
  await pane.press({ key: 'gl-context-Shipping' })
  await fill(pane, 'Route')
  await pane.press({ key: 'gl-save' })
  expect(w.files.get('shipping/GLOSSARY.md')).toBe(`${SHIPPING}\n**Route**:\nA definition.\n`)
  expect(w.files.get('billing/GLOSSARY.md')).toBe(BILLING)
  expect(w.files.get('GLOSSARY-MAP.md')).toBe(MAP)
  expect(w.writes.map(x => x.path)).toEqual(['shipping/GLOSSARY.md'])
  await pane.redraw()
  await pane.press({ key: 'gl-delete-Shipping-Route' })
  expect(w.files.get('shipping/GLOSSARY.md')).toBe(SHIPPING)
})

test('editing a term rewrites only its lines in its own context', async ($, on) => {
  const { w, pane } = await open(on, $)
  await pane.press({ key: 'gl-edit-Billing-Customer' })
  await pane.redraw()
  expect((await pane.find({ key: 'set-gl-name' }))?.props.value).toBe('Customer')
  await pane.input({ key: 'set-gl-definition', text: 'The organisation.', kind: 'change' })
  await pane.press({ key: 'gl-save' })
  expect(w.files.get('billing/GLOSSARY.md')).toBe(
    BILLING.replace('The paying account.', 'The organisation.'),
  )
  expect(w.files.get('shipping/GLOSSARY.md')).toBe(SHIPPING)
})

test('the same name may live in two contexts', async ($, on) => {
  const { w, pane } = await open(on, $)
  await pane.press({ key: 'gl-context-Shipping' })
  await fill(pane, 'Customer')
  await pane.press({ key: 'gl-save' })
  expect(w.files.get('shipping/GLOSSARY.md')).toContain('**Customer**:\nA definition.\n')
})

test('a name added to a second context this session is New there and only there', async ($, on) => {
  const { pane } = await open(on, $)
  await pane.press({ key: 'gl-context-Shipping' })
  await fill(pane, 'Customer')
  await pane.press({ key: 'gl-save' })
  await pane.press({ key: 'tab-glossary' })
  await pane.redraw()
  const all = await allText(pane)
  expect(all).toContain('1 added this session')
  expect(all.split('[New]')).toHaveLength(2)
  expect(all.indexOf('[New]')).toBeGreaterThan(all.indexOf('Shipping Parcel'))
})

test('editing a name two contexts define highlights only the card being edited', async ($, on) => {
  const shipping = `${SHIPPING}\n**Customer**:\nThe receiver.\n`
  const { pane } = await open(on, $, {
    surfaces: ['desktop'],
    files: { 'shipping/GLOSSARY.md': shipping },
  })
  const border = async (key: string) => (await pane.find({ key }))?.props.borderColor
  const plain = await border('gl-Shipping-Customer')
  await pane.press({ key: 'gl-edit-Billing-Customer' })
  await pane.redraw()
  expect(await border('gl-Billing-Customer')).not.toBe(plain)
  expect(await border('gl-Shipping-Customer')).toBe(plain)
})

test('Add term with nothing picked goes to the first context in the map when there is no diff', async ($, on) => {
  const { w, pane } = await open(on, $)
  await fill(pane, 'Invoice run')
  await pane.press({ key: 'gl-save' })
  expect(w.files.get('billing/GLOSSARY.md')).toContain('**Invoice run**:')
  expect(w.files.get('shipping/GLOSSARY.md')).toBe(SHIPPING)
})

test("Add term defaults to the context the Feature's diff touches most", async ($, on) => {
  const git = fakeGit({ extra: [{ path: '/repo/.claude/worktrees/_spec-42', branch: 'feat/csv' }] })
  const diff = '+++ b/shipping/a.ts\n+one\n+two\n+++ b/billing/b.ts\n+x\n'
  const { w, pane } = await open(on, $, {
    shell: (argv, cwd) =>
      argv[1] === 'diff' && argv[4] === 'main...feat/csv'
        ? { exitCode: 0, stdout: diff }
        : git.shell(argv, cwd),
  })
  await fill(pane, 'Route')
  await pane.press({ key: 'gl-save' })
  expect(w.files.get('shipping/GLOSSARY.md')).toContain('**Route**:')
  expect(w.files.get('billing/GLOSSARY.md')).toBe(BILLING)
})

test('Settings reads the integration diff once, not on every render and save', async ($, on) => {
  const git = fakeGit({ extra: [{ path: '/repo/.claude/worktrees/_spec-42', branch: 'feat/csv' }] })
  let diffs = 0
  const { w, pane } = await open(on, $, {
    shell: (argv, cwd) => {
      if (argv[1] !== 'diff' || argv[4] !== 'main...feat/csv') return git.shell(argv, cwd)
      diffs++
      return { exitCode: 0, stdout: '+++ b/shipping/a.ts\n+one\n' }
    },
  })
  await pane.redraw()
  await pane.redraw()
  await fill(pane, 'Route')
  await pane.press({ key: 'gl-save' })
  await pane.redraw()
  expect(w.files.get('shipping/GLOSSARY.md')).toContain('**Route**:')
  expect(diffs).toBe(1)
})

test("Add term on a missing glossary creates the file in Matt's format, then adds the term", async ($, on) => {
  const { w, pane } = await open(on, $)
  await pane.press({ key: 'gl-context-Ghost' })
  await fill(pane, 'Spirit')
  await pane.press({ key: 'gl-save' })
  expect(w.files.get('ghost/GLOSSARY.md')).toBe(
    '# Ghost\n\nnot written yet\n\n## Language\n\n**Spirit**:\nA definition.\n',
  )
  expect(w.files.get('billing/GLOSSARY.md')).toBe(BILLING)
  await pane.redraw()
  expect(await allText(pane)).not.toContain('No glossary yet')
})

test('a context glossary that names a term twice is reported, read-only and never written', async ($, on) => {
  const broken = `${SHIPPING}\n**Parcel**:\nA second, different box.\n`
  const { w, pane } = await open(on, $, { files: { 'shipping/GLOSSARY.md': broken } })
  expect(await allText(pane)).toContain('shipping/GLOSSARY.md could not be read')
  expect(await pane.find({ key: 'gl-edit-Shipping-Parcel' })).toBeUndefined()
  await pane.press({ key: 'gl-context-Shipping' })
  await fill(pane, 'Route')
  await pane.press({ key: 'gl-save' })
  await pane.redraw()
  expect(w.files.get('shipping/GLOSSARY.md')).toBe(broken)
  expect(w.writes).toEqual([])
  expect(await allText(pane)).toContain('shipping/GLOSSARY.md could not be read')
  await pane.press({ key: 'tab-glossary' })
  await pane.redraw()
  expect(await allText(pane)).toContain('shipping/GLOSSARY.md could not be read')
})

test('the Glossary tab Edit jumps to the form with that context chosen', async ($, on) => {
  const { pane } = await open(on, $)
  await pane.press({ key: 'tab-glossary' })
  await pane.press({ key: 'term-edit-Shipping-Parcel' })
  await pane.redraw()
  expect((await pane.find({ key: 'set-gl-name' }))?.props.value).toBe('Parcel')
})
