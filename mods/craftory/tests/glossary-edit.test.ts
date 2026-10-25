import { expect, test } from 'claude-code/testing'
import { allText, featureWorld, mountPane, startSession, texts } from './harness'

const GLOSSARY = `# Billing

Intro that must survive.

## Language

**Customer**:
The paying account.
_Avoid_: client, user

**Ledger line**:
A priced row on an invoice.
_Avoid_: line item

## Relationships

- A **Customer** has many **Ledger lines**
`

const open = async (
  on: Parameters<typeof featureWorld>[0],
  $: Parameters<typeof startSession>[0],
  files: Record<string, string> = {},
) => {
  const w = featureWorld(on, { files: { 'GLOSSARY.md': GLOSSARY, ...files } })
  await startSession($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'section-section-glossary' })
  return { w, pane }
}

const fill = async (
  pane: Awaited<ReturnType<typeof open>>['pane'],
  name: string,
  definition: string,
  avoid: string,
) => {
  await pane.input({ key: 'set-gl-name', text: name, kind: 'change' })
  await pane.input({ key: 'set-gl-definition', text: definition, kind: 'change' })
  await pane.input({ key: 'set-gl-avoid', text: avoid, kind: 'change' })
}

test('adding a term appends it and leaves every other byte alone; deleting it restores the file', async ($, on) => {
  const { w, pane } = await open(on, $)
  await fill(pane, 'Credit note', 'A refund document.', 'refund')
  await pane.press({ key: 'gl-save' })
  const added = w.files.get('GLOSSARY.md')!
  expect(added).toContain('**Credit note**:\nA refund document.\n_Avoid_: refund\n')
  expect(added.replace('\n**Credit note**:\nA refund document.\n_Avoid_: refund\n', '')).toBe(
    GLOSSARY,
  )
  await pane.redraw()
  expect(await texts(pane)).toContain('Credit note')
  await pane.press({ key: 'gl-delete-Credit note' })
  expect(w.files.get('GLOSSARY.md')).toBe(GLOSSARY)
})

test('editing a term rewrites only its own lines', async ($, on) => {
  const { w, pane } = await open(on, $)
  await pane.press({ key: 'gl-edit-Customer' })
  await pane.redraw()
  expect((await pane.find({ key: 'set-gl-name' }))?.props.value).toBe('Customer')
  await pane.input({ key: 'set-gl-definition', text: 'The paying organisation.', kind: 'change' })
  await pane.press({ key: 'gl-save' })
  expect(w.files.get('GLOSSARY.md')).toBe(
    GLOSSARY.replace('The paying account.', 'The paying organisation.'),
  )
})

test('a duplicate name and a missing definition are refused with a reason', async ($, on) => {
  const { w, pane } = await open(on, $)
  await fill(pane, 'customer', 'Again.', '')
  await pane.press({ key: 'gl-save' })
  await pane.redraw()
  expect(await allText(pane)).toContain('A term with that name is already in the glossary.')
  await fill(pane, 'Thing', '', '')
  await pane.press({ key: 'gl-save' })
  await pane.redraw()
  expect(await allText(pane)).toContain('A term needs a definition.')
  expect(w.writes).toEqual([])
})

test('import adds the CONTEXT.md terms the glossary lacks', async ($, on) => {
  const context =
    '## Language\n\n**Customer**:\nDifferent.\n\n**Invoice run**:\nA batch of invoices.\n_Avoid_: billing job\n'
  const { w, pane } = await open(on, $, { 'CONTEXT.md': context })
  await pane.press({ key: 'gl-import' })
  const saved = w.files.get('GLOSSARY.md')!
  expect(saved).toContain('**Invoice run**:\nA batch of invoices.\n_Avoid_: billing job\n')
  expect(saved.match(/\*\*Customer\*\*:/g)).toHaveLength(1)
  await pane.redraw()
  expect(await allText(pane)).toContain('Imported 1 of 2 terms from CONTEXT.md into GLOSSARY.md.')
})

test('there is no import button without a CONTEXT.md', async ($, on) => {
  const { pane } = await open(on, $)
  expect(await pane.find({ key: 'gl-import' })).toBeUndefined()
})

test('the Glossary tab Edit jumps to this form with the term loaded', async ($, on) => {
  const { pane } = await open(on, $)
  await pane.press({ key: 'tab-glossary' })
  await pane.press({ key: 'term-edit-Ledger line' })
  await pane.redraw()
  expect((await pane.find({ key: 'set-gl-name' }))?.props.value).toBe('Ledger line')
  expect((await pane.find({ key: 'set-gl-avoid' }))?.props.value).toBe('line item')
})
