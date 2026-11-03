import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { PHASES } from '../src/phases'
import { paint } from '../src/theme'
import {
  allText,
  featureWorld,
  mountPane,
  startSession,
  texts,
  turnComplete,
  type WorldOptions,
} from './harness'

const open = async ($: Engine, surface: 'terminal' | 'desktop' | 'mobile', tab: string) => {
  const pane = await mountPane($, surface)
  await pane.press({ key: `tab-${tab}` })
  await pane.redraw()
  return pane
}

const session = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  surface: 'terminal' | 'desktop' | 'mobile',
  options: WorldOptions = {},
) => {
  const w = featureWorld(on, { surfaces: [surface], ...options })
  await startSession($, surface)
  return w
}

for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
  test(`${surface}: the tab row names the five tabs with their counts and hotkeys 1 to 5`, async ($, on) => {
    await session(on, $, surface)
    const pane = await mountPane($, surface)
    const tabs = await pane.findAll({ type: 'Button' })
    const hotkeys = tabs.filter(b => b.key?.startsWith('tab-')).map(b => [b.key, b.props.hotkey])
    expect(hotkeys).toEqual([
      ['tab-flow', '1'],
      ['tab-tickets', '2'],
      ['tab-worktrees', '3'],
      ['tab-glossary', '4'],
      ['tab-settings', '5'],
    ])
    const words = await allText(pane)
    for (const title of ['Flow', 'Tickets', 'Worktrees', 'Glossary', 'Settings'])
      expect(words).toContain(title)
    expect(words).toContain('3/7')
    expect(words).toContain('3')
  })

  test(`${surface}: the Flow tab lists the seven phases with their command and a one-line result`, async ($, on) => {
    await session(on, $, surface)
    const words = await texts(await open($, surface, 'flow'))
    for (const phase of Object.values(PHASES)) expect(words).toContain(phase.label)
    for (const command of [
      '/grill-with-docs',
      '/to-spec',
      '/to-tickets',
      '/implement-spec',
      '/retro',
    ])
      expect(words).toContain(command)
    expect(words).toContain('/code-review')
    expect(words).toContain('/pr')
    expect(words).toContain('Export invoices as CSV · 3 of 7 phases done')
    expect(words).toContain('Written: docs/issues/42-export-invoices.md')
    expect(words).toContain(PHASES.build.why)
    expect(words.some(w => w.startsWith('Gated · '))).toBe(true)
  })
}

test('mobile has no band, so the Flow tab heads with the same rail, wrapping', async ($, on) => {
  await session(on, $, 'mobile')
  const pane = await open($, 'mobile', 'flow')
  const rail = await pane.find({ key: 'pane-rail' })
  expect(rail?.props.flexWrap).toBe('wrap')
  for (const phase of Object.keys(PHASES))
    expect(await pane.find({ key: `phase-${phase}` })).toBeDefined()
  expect(await pane.find({ key: 'triage' })).toBeDefined()
})

test('the terminal and desktop do not repeat the rail inside the pane', async ($, on) => {
  await session(on, $, 'terminal')
  const pane = await open($, 'terminal', 'flow')
  expect(await pane.find({ key: 'pane-rail' })).toBeUndefined()
})

test('desktop, dark: a done phase glyph takes the done colour, the next one the running colour', async ($, on) => {
  await session(on, $, 'desktop', { theme: 'dark' })
  const pane = await open($, 'desktop', 'flow')
  const colourOf = async (glyph: string) =>
    (await pane.findAll({ type: 'Text', text: glyph }))[0]?.props.color
  expect(await colourOf('✓')).toBe(paint('perm', 'dark').fg)
  expect(await colourOf('▸')).toBe(paint('skill', 'dark').fg)
})

test('the Glossary tab lists terms, counts those added this session and the terms the last reply used', async ($, on) => {
  const w = await session(on, $, 'terminal', {
    files: {
      'GLOSSARY.md':
        '# Billing\n\n## Language\n\n**Customer**:\nThe paying account.\n_Avoid_: client, user\n\n**Ledger line**:\nA priced row on an invoice.\n_Avoid_: line item\n',
    },
  })
  const pane = await open($, 'terminal', 'glossary')
  expect(await texts(pane)).toContain('GLOSSARY.md · 0 added this session')
  expect(await allText(pane)).toContain('No glossary term in the last reply.')
  w.files.set(
    'GLOSSARY.md',
    `${w.files.get('GLOSSARY.md')}\n**Export batch**:\nA requested export.\n`,
  )
  await turnComplete($, { answer: 'Each ledger line lands in one customer file.' })
  await pane.redraw()
  const words = await texts(pane)
  expect(words).toContain('Used in last reply')
  expect(words).toContain('Customer')
  expect(words).toContain('Ledger line')
  expect(words).toContain('Avoid: client, user')
  expect(words).toContain('Avoid: line item')
})

test('Edit on a term jumps to Settings, Glossary', async ($, on) => {
  await session(on, $, 'terminal', {
    files: { 'GLOSSARY.md': '## Language\n\n**Customer**:\nThe paying account.\n' },
  })
  const pane = await open($, 'terminal', 'glossary')
  await pane.press({ key: 'term-edit-Customer' })
  await pane.redraw()
  expect((await pane.find({ key: 'tab-settings' }))?.text).toContain('Settings')
})
