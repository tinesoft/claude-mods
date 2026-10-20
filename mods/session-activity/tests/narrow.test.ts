import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { mountBand, mountPane, session, stubEngine } from './harness'

const SKILLS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']

const load = async ($: Engine) => {
  for (const skill of SKILLS) {
    await $.skill.prompt({ skill, text: '', frontmatter: {}, source: 'projectSettings' } as never)
  }
}

test('the header stats and Customize are separate units that wrap onto the next line', async ($, on) => {
  session(on)
  stubEngine(on)
  await load($)
  const pane = await mountPane($, 'terminal', 49)
  const boxes = await pane.findAll({ type: 'Box' })
  const header = boxes.find(b => b.props.flexWrap === 'wrap' && b.text.includes('activations'))
  expect(header?.props.columnGap).toBe(1)
  expect(header?.text).toContain('Customize')
  const link = boxes.find(b => b.key === 'customize-link')
  expect(link?.props.flexShrink).toBe(0)
  expect(link?.props.columnGap).toBe(1)
  expect(link?.text).toContain('Customize')
})

test('a row keeps a column between its left side and its count, and the left clips first', async ($, on) => {
  session(on)
  stubEngine(on)
  await load($)
  const pane = await mountPane($, 'terminal', 49)
  const boxes = await pane.findAll({ type: 'Box' })
  const right = boxes.find(b => /^×1 · /.test(b.text))
  expect(right?.props.flexShrink).toBe(0)
  const outer = boxes.find(b => b.props.justifyContent === 'space-between')
  expect(outer?.props.columnGap).toBe(1)
  const left = boxes.find(b => b.props.overflow === 'hidden')
  expect(left?.props).toMatchObject({ flexShrink: 1, minWidth: 0 })
})

for (const [theme, text2] of [
  ['light', '#3B3F48'],
  ['dark', '#B4B8C1'],
] as const) {
  test(`${theme} terminal: "+N more" is text-2, not dim`, async ($, on) => {
    session(on, { chip_style: 'auto', chip_theme: theme }, new Map(), theme)
    stubEngine(on)
    await load($)
    const band = await mountBand($, 'terminal', 40)
    const more = (await band.findAll({ type: 'Text' })).find(t =>
      /^\+\d+ more$/.test(t.text.trim()),
    )
    expect(more?.props.color).toBe(text2)
    expect(more?.props.dimColor).toBeUndefined()
  })
}

test(
  'untinted terminal: "+N more" stays dim',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    session(on)
    stubEngine(on)
    await load($)
    const band = await mountBand($, 'terminal', 40)
    const more = (await band.findAll({ type: 'Text' })).find(t =>
      /^\+\d+ more$/.test(t.text.trim()),
    )
    expect(more?.props.dimColor).toBe(true)
    expect(more?.props.color).toBeUndefined()
  },
)
