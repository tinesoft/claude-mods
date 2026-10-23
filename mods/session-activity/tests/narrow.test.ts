import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { cellsAcross, mountBand, mountPane, session, stubEngine } from './harness'

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
  expect(header?.props.columnGap).toBe('xs')
  expect(header?.text).toContain('Customize')
  const link = boxes.find(b => b.key === 'customize-link')
  expect(link?.props.flexShrink).toBe(0)
  expect(link?.props.columnGap).toBe('xs')
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
  expect(outer?.props.columnGap).toBe('sm')
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

for (const columns of [20, 30]) {
  test(`at ${columns} columns the first chip clips so it and "+N more" fit the band`, async ($, on) => {
    session(on)
    stubEngine(on)
    for (const skill of [
      'a-very-long-skill-name-one',
      'a-very-long-skill-name-two',
      'third-long-skill-name-here',
    ]) {
      await $.skill.prompt({ skill, text: '', frontmatter: {}, source: 'projectSettings' } as never)
    }
    const band = await mountBand($, 'terminal', columns)
    const row = ((await band.drawn()) as { children: unknown[] }).children.at(-1)
    expect(cellsAcross(row)).toBeLessThanOrEqual(columns - 2)
    expect((await band.find({ key: 'more' }))?.text).toBe('+2 more')
  })
}

for (const columns of [20, 30]) {
  test(`at ${columns} columns the chips, "+N more" and the gear all fit the band`, async ($, on) => {
    session(on)
    stubEngine(on)
    for (const skill of [
      'a-very-long-skill-name-one',
      'a-very-long-skill-name-two',
      'third-long-skill-name-here',
    ]) {
      await $.skill.prompt({ skill, text: '', frontmatter: {}, source: 'projectSettings' } as never)
    }
    const band = await mountBand($, 'terminal', columns)
    const row = ((await band.drawn()) as { children: unknown[] }).children.at(-1)
    expect(cellsAcross(row)).toBeLessThanOrEqual(columns - 2)
    expect((await band.find({ key: 'more' }))?.text).toBe('+2 more')
    expect((await band.find({ key: 'settings-gear' }))?.text).toBe('\u2699')
  })
}
