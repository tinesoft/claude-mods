import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { FRESH, type Finder, mountBand, mountPane, session, stubEngine } from './harness'

const docx = ($: Engine) =>
  $.skill.prompt({
    skill: 'docx',
    text: '',
    frontmatter: {},
    source: 'plugin',
    path: '/skills/docx/SKILL.md',
  } as never)

const textBy = async (mounted: Finder, text: string) =>
  (await mounted.findAll({ type: 'Text' })).find(t => t.text === text)?.props

test('desktop: the card draws its eyebrow, name, tiles, source and count on the type scale', async ($, on) => {
  const clock = session(on, {}, new Map(), 'dark', ['desktop'])
  stubEngine(on)
  await docx($)
  await docx($)
  await clock.advance(FRESH)
  await (await mountBand($, 'desktop', 120, 40)).press({ key: 'chip-skill-docx' })
  const band = await mountBand($, 'desktop', 120, 40)
  expect(await textBy(band, 'SKILL · Loaded')).toMatchObject({ mono: true, size: 'caption' })
  expect(await textBy(band, 'docx')).toMatchObject({ size: 'heading' })
  expect(await textBy(band, 'Status')).toMatchObject({ size: 'footnote' })
  expect(await textBy(band, 'Active')).toMatchObject({ size: 'footnote' })
  expect(await textBy(band, '/skills/docx/SKILL.md')).toMatchObject({
    mono: true,
    size: 'footnote',
  })
  expect(await textBy(band, ' ×2 ')).toMatchObject({ mono: true, size: 'caption' })
})

test('desktop: the tray draws group headers, meta, tallies and why lines on the type scale', async ($, on) => {
  session(on, {}, new Map(), 'dark', ['desktop'])
  stubEngine(on)
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  await $.tool.call({ tool: 'mcp__github__get_issue' } as never)
  const pane = await mountPane($, 'desktop')
  expect(await textBy(pane, 'MCP SERVERS')).toMatchObject({ mono: true, size: 'caption' })
  expect(await textBy(pane, ' get_issue')).toMatchObject({ mono: true, size: 'footnote' })
  expect(await textBy(pane, '×2 · now')).toMatchObject({ mono: true, size: 'footnote' })
  expect(await textBy(pane, 'Called get_issue')).toMatchObject({ size: 'footnote' })
})
