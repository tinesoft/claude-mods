import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { RenderSurface, Space } from 'claude-code'
import { across, down, SPACE } from '../src/theme'
import { FRESH, mountBand, mountPane, session, stubEngine, SURFACES } from './harness'

/** The step as the tree holds it: VS Code resolves steps to cells before drawing, the others keep the name. */
const drawn = (surface: RenderSurface, step: Space, axis: 'across' | 'down') =>
  surface === 'vscode' ? (axis === 'across' ? across(step) : down(step)) : step

const SKILLS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']

const load = async ($: Engine) => {
  for (const skill of SKILLS) {
    await $.skill.prompt({
      skill,
      text: '',
      frontmatter: {},
      source: 'plugin',
      path: `/skills/${skill}/SKILL.md`,
    } as never)
  }
}

test('a step reaches the terminal as the cells the type documents', () => {
  expect(['xs', 'sm', 'md', 'lg', 'xl'].map(s => across(s as 'xs'))).toEqual([1, 1, 2, 3, 4])
  expect(['xs', 'sm', 'md', 'lg', 'xl'].map(s => down(s as 'xs'))).toEqual([0, 0, 1, 1, 2])
  expect(across(2)).toBe(2)
})

for (const surface of SURFACES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`${tone} on ${surface}: the band, the card and both pane tabs carry the spacing steps`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      await load($)
      await clock.advance(FRESH)

      const x = (step: Space) => drawn(surface, step, 'across')
      const y = (step: Space) => drawn(surface, step, 'down')
      const closed = await mountBand($, surface, 120, 40)
      const rowBox = (await closed.findAll({ type: 'Box' })).find(
        b =>
          b.key === undefined &&
          b.props.flexDirection === 'row' &&
          b.text.includes('alpha') &&
          b.text.includes('bravo'),
      )
      expect(rowBox?.props.columnGap).toBe(x(SPACE.chipGap))
      expect(rowBox?.props.paddingX).toBe(surface === 'mobile' ? SPACE.rowPadX : undefined)
      const chip = (await closed.findAll({ type: 'Box' })).find(b => b.key?.startsWith('box-'))
      expect(chip?.props).toMatchObject({
        paddingX: x(SPACE.chipPadX),
        columnGap: x(SPACE.chipInner),
      })

      await closed.press({ key: 'chip-skill-alpha' })
      const open = await mountBand($, surface, 120, 40)
      const card = await open.find({ key: 'card' })
      expect(card?.props.rowGap).toBe(y(SPACE.cardGap))
      expect(card?.props).toMatchObject(
        surface === 'vscode'
          ? { paddingX: x(SPACE.cardPad), paddingY: y(SPACE.cardPad) }
          : { padding: SPACE.cardPad },
      )
      expect((await open.find({ key: 'card-slot' }))?.props.marginBottom).toBe(y(SPACE.cardAbove))
      const boxes = await open.findAll({ type: 'Box' })
      expect(
        boxes.some(b => b.text.includes('Status') && b.props.columnGap === x(SPACE.tilesGap)),
      ).toBe(true)
      expect(boxes.find(b => b.key === 'tile-Status')?.props).toMatchObject({
        paddingX: x(SPACE.tilePadX),
        paddingY: y(SPACE.tilePadY),
        rowGap: y(SPACE.tileGap),
      })
      expect(
        boxes.some(b => b.props.columnGap === x(SPACE.actionsGap) && b.text.includes('Mute')),
      ).toBe(true)

      const pane = await mountPane($, surface, 80)
      const paneBoxes = await pane.findAll({ type: 'Box' })
      expect(paneBoxes.find(b => b.props.paddingLeft !== undefined)?.props).toMatchObject({
        paddingLeft: x(SPACE.paneLeft),
        paddingRight: x(SPACE.paneRight),
        rowGap: y(SPACE.tabsBelow),
      })
      expect(paneBoxes.some(b => b.props.rowGap === y(SPACE.listGap))).toBe(true)
      expect(paneBoxes.find(b => b.key?.startsWith('rowbox-'))?.props.rowGap).toBe(
        y(SPACE.rowTextGap),
      )

      await pane.press({ key: 'tab-settings' })
      const settings = await pane.findAll({ type: 'Box' })
      expect(settings.some(b => b.props.rowGap === y(SPACE.settingsGap))).toBe(true)
      expect(
        settings.filter(b => b.props.rowGap === y(SPACE.listGap)).length,
      ).toBeGreaterThanOrEqual(3)
      expect(
        settings.find(b => b.props.columnGap === x(SPACE.footerGap) && b.text.includes('Reset'))
          ?.text,
      ).toContain('Turn everything on')
    })
  }
}

test(
  'untinted terminal chips keep their two-cell gap and no padding',
  { options: { chip_style: 'text' } },
  async ($, on) => {
    const clock = session(on)
    stubEngine(on)
    await load($)
    await clock.advance(FRESH)
    const band = await mountBand($, 'terminal', 120)
    const boxes = await band.findAll({ type: 'Box' })
    const row = boxes.find(
      b =>
        b.key === undefined &&
        b.props.flexDirection === 'row' &&
        b.text.includes('alpha') &&
        b.text.includes('bravo'),
    )
    expect(row?.props.columnGap).toBe(2)
    expect(boxes.find(b => b.key?.startsWith('box-'))?.props.paddingX).toBe(0)
  },
)

test('terminal chips stay one row tall', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await load($)
  await clock.advance(FRESH)
  const band = await mountBand($, 'terminal', 120)
  for (const box of (await band.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('box-'))) {
    expect(box.props.paddingY).toBeUndefined()
  }
})
