import { expect, test } from 'claude-code/testing'
import { BAND_SURFACES, featureWorld, mountBand, startSession } from './harness'
import { TOKENS, TRIPLES } from '../src/theme'
import { scenarioFiles } from './wayfinder'

type Node = { type: string; props: Record<string, unknown>; children?: unknown[] }
const isNode = (c: unknown): c is Node => typeof c === 'object' && c !== null && 'type' in c
/** Every element under one found element, depth first. */
const within = (el: { children?: unknown[] }): Node[] =>
  (el.children ?? []).filter(isNode).flatMap(c => [c, ...within(c)])
const textOf = (el: Node): string =>
  (el.children ?? []).map(c => (typeof c === 'string' ? c : isNode(c) ? textOf(c) : '')).join('')
const keysOf = (el: Node) =>
  within(el).flatMap(n => (typeof n.props?.key === 'string' ? [n.props.key] : []))

const mixed = () => ({ files: scenarioFiles('local', 'mixed') })
const TONES = ['light', 'dark'] as const
const PHASE_KEYS = ['align', 'spec', 'tickets', 'build', 'review', 'ship', 'retro'].map(
  p => `phase-${p}`,
)

for (const surface of BAND_SURFACES) {
  test(`${surface}: the rail reads Triage, map chip, title and gear, then the seven phases on their own row`, async ($, on) => {
    featureWorld(on, { surfaces: [surface], ...mixed() })
    await startSession($, surface)
    const band = await mountBand($, surface, 200)
    const rail = (await band.find({ key: 'phases' })) as Node
    expect(rail.props.flexDirection).toBe('column')
    const inOrder = (row: string, wanted: string[]) => {
      const keys = keysOf(within(rail).find(n => n.props.key === row)!)
      const order = wanted.map(k => keys.indexOf(k))
      expect({ row, order: order.every(i => i >= 0) }).toEqual({ row, order: true })
      expect([...order].sort((a, b) => a - b)).toEqual(order)
    }
    inOrder('phases-head', ['triage', 'map-chip', 'box-title', 'gear'])
    inOrder('phases-steps', PHASE_KEYS)
    expect(keysOf(within(rail).find(n => n.props.key === 'phases-steps')!)).not.toContain('triage')
    expect(keysOf(within(rail).find(n => n.props.key === 'phases-head')!)).not.toContain(
      'phase-align',
    )
    expect(await band.find({ key: 'box-triage' })).toBeDefined()
  })

  for (const tone of TONES) {
    test(`${surface} ${tone}: the connector after a done phase is teal, the others neutral`, async ($, on) => {
      featureWorld(on, { surfaces: [surface], theme: tone })
      await startSession($, surface)
      const band = await mountBand($, surface, 200)
      // align, spec and tickets are done; build is next
      const colourAfter = async (phase: string, before: string) => {
        const group = (await band.find({ key: `group-${phase}` })) as Node
        const mark = within(group)[0]!
        if (surface === 'terminal') {
          expect(textOf(mark)).toBe('─')
          return String(mark.props.color)
        }
        const bar = within(mark).find(n => n.type === 'Svg')!
        expect(mark.props.key).toBe(`connector-${before}`)
        return String(bar.props.source)
      }
      expect(await colourAfter('spec', 'align')).toContain(TRIPLES.perm[tone].bd)
      expect(await colourAfter('review', 'build')).toContain(TOKENS[tone].line)
      expect(await colourAfter('review', 'build')).not.toContain(TRIPLES.perm[tone].bd)
    })
  }
}

for (const tone of TONES) {
  test(`desktop ${tone}: the title is a fill-tinted pill with a list icon and an ink label`, async ($, on) => {
    featureWorld(on, { surfaces: ['desktop'], theme: tone })
    await startSession($, 'desktop')
    const band = await mountBand($, 'desktop', 200)
    const pill = (await band.find({ key: 'box-title' })) as Node
    expect(pill.props).toMatchObject({ backgroundColor: TOKENS[tone].fill })
    const inside = within(pill)
    expect(inside.filter(n => n.type === 'Svg')).toHaveLength(1)
    const label = inside.find(n => n.type === 'Text')!
    expect(label.props.color).toBe(TOKENS[tone].ink)
  })

  test(`desktop ${tone}: steps are clear at rest, and the open one takes fill and a strong border`, async ($, on) => {
    featureWorld(on, { surfaces: ['desktop'], theme: tone })
    await startSession($, 'desktop')
    await (await mountBand($, 'desktop', 200)).press({ key: 'phase-build' })
    const band = await mountBand($, 'desktop', 200)
    const t = TOKENS[tone]
    const rest = (await band.find({ key: 'box-phase-spec' })) as Node
    expect(rest.props.backgroundColor).toBeUndefined()
    // Desktop paints a transparent border black, so a step at rest draws none.
    expect(rest.props.borderStyle).toBeUndefined()
    expect(rest.props.borderColor).toBeUndefined()
    const open = (await band.find({ key: 'box-phase-build' })) as Node
    expect(open.props).toMatchObject({ backgroundColor: t.fill, borderColor: t.lineStrong })
  })

  test(`desktop ${tone}: no text inside a step, Triage or gear Button is coloured, counts sit outside`, async ($, on) => {
    featureWorld(on, { surfaces: ['desktop'], theme: tone })
    await startSession($, 'desktop')
    const band = await mountBand($, 'desktop', 200)
    for (const key of [...PHASE_KEYS, 'triage', 'gear']) {
      const button = (await band.find({ key })) as Node
      const coloured = within(button).filter(n => n.type === 'Text' && n.props.color !== undefined)
      expect(coloured).toEqual([])
    }
    const tickets = (await band.find({ key: 'box-phase-tickets' })) as Node
    const meta = within(tickets).find(n => n.type === 'Text' && textOf(n).trim() === '3')!
    expect(meta.props).toMatchObject({ mono: true })
    expect(within((await band.find({ key: 'phase-tickets' })) as Node)).not.toContain(meta)
    const inbox = (await band.find({ key: 'box-triage' })) as Node
    expect(inbox.props).toMatchObject({
      borderStyle: 'dashed',
      borderColor: TOKENS[tone].lineDashed,
    })
    expect(inbox.props.backgroundColor).toBeUndefined()
  })
}

test('terminal: steps keep their glyphs, and the open one is underlined', async ($, on) => {
  featureWorld(on, { theme: 'dark' })
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-build' })
  const band = await mountBand($, 'terminal', 200)
  const build = (await band.find({ key: 'phase-build' })) as Node
  expect(textOf(build)).toBe('▸ Build')
  expect(within(build).some(n => n.props.underline === true)).toBe(true)
  const spec = (await band.find({ key: 'phase-spec' })) as Node
  expect(within(spec).some(n => n.props.underline === true)).toBe(false)
})
