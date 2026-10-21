import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { RenderSurface, Space } from 'claude-code'
import { across, CARD_SPACE, down, SPACE } from '../src/theme'
import {
  BAND_SURFACES,
  FRESH,
  mountBand,
  mountPane,
  session,
  stubEngine,
  SURFACES,
} from './harness'

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

for (const surface of BAND_SURFACES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`${tone} on ${surface}: the band and the card carry the spacing steps`, async ($, on) => {
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
      expect(rowBox?.props.paddingX).toBeUndefined()
      const chip = (await closed.findAll({ type: 'Box' })).find(b => b.key?.startsWith('box-'))
      expect(chip?.props).toMatchObject({
        paddingX: x(SPACE.chipPadX),
        columnGap: x(SPACE.chipInner),
      })

      await closed.press({ key: 'chip-skill-alpha' })
      const open = await mountBand($, surface, 120, 40)
      const card = await open.find({ key: 'card' })
      expect(card?.props).toMatchObject({
        rowGap: y(CARD_SPACE.roomy.gap),
        paddingX: x(CARD_SPACE.roomy.padX),
        paddingY: y(CARD_SPACE.roomy.padY),
      })
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
    })
  }
}

for (const surface of SURFACES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`${tone} on ${surface}: both pane tabs carry the spacing steps`, async ($, on) => {
      const clock = session(on, {}, new Map(), tone, [surface])
      stubEngine(on)
      await load($)
      await clock.advance(FRESH)

      const x = (step: Space) => drawn(surface, step, 'across')
      const y = (step: Space) => drawn(surface, step, 'down')
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

for (const surface of BAND_SURFACES) {
  test(`on ${surface} the card is roomy where the band has the rows, compact where it is short, and the pane only below that`, async ($, on) => {
    const clock = session(on, {}, new Map(), 'light', [surface])
    const { opens } = stubEngine(on)
    await load($)
    await clock.advance(FRESH)

    const probe = async (maxRows: number) => {
      const tall = await mountBand($, surface, 120, 60)
      if (await tall.find({ key: 'card' })) await tall.press({ key: 'close' })
      await tall.unmount()
      opens.length = 0
      const band = await mountBand($, surface, 120, maxRows)
      await band.press({ key: 'chip-skill-alpha' })
      const card = await band.find({ key: 'card' })
      if (card !== undefined) await band.press({ key: 'close' })
      await band.unmount()
      if (card === undefined) return opens.length === 1 ? 'pane' : 'none'
      return card.props.rowGap === 0 ? 'compact' : 'roomy'
    }

    const seen: string[] = []
    for (let rows = 0; rows <= 40; rows++) seen.push(await probe(rows))
    const first = (kind: string) => seen.indexOf(kind)
    expect(seen.join()).not.toContain('none')
    expect(first('compact')).toBeGreaterThan(0)
    expect(first('roomy')).toBeGreaterThan(first('compact'))
    expect(seen.slice(0, first('compact')).every(kind => kind === 'pane')).toBe(true)
    expect(seen.slice(first('compact'), first('roomy')).every(kind => kind === 'compact')).toBe(
      true,
    )
    expect(seen.slice(first('roomy')).every(kind => kind === 'roomy')).toBe(true)
  })
}

test('the compact card keeps the horizontal padding and drops the vertical padding and the gaps', async ($, on) => {
  const clock = session(on)
  stubEngine(on)
  await load($)
  await clock.advance(FRESH)
  const props = async (maxRows: number) => {
    const band = await mountBand($, 'terminal', 120, maxRows)
    await band.press({ key: 'chip-skill-alpha' })
    const card = await band.find({ key: 'card' })
    if (card) await band.press({ key: 'close' })
    await band.unmount()
    return card?.props
  }
  let rows = 0
  while ((await props(rows)) === undefined) rows++
  expect(await props(rows)).toMatchObject({ paddingX: 'lg', paddingY: 0, rowGap: 0 })
  expect(await props(40)).toMatchObject({ paddingX: 'lg', paddingY: 'lg', rowGap: 'md' })
})
