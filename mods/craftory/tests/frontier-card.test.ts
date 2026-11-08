import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  BAND_SURFACES,
  featureWorld,
  mountBand,
  mountPane,
  startSession,
  type BandSurface,
} from './harness'
import { TOKENS, TRIPLES } from '../src/theme'
import { scenarioFiles } from './wayfinder'

type Node = { type: string; props: Record<string, unknown>; children?: unknown[] }
const isNode = (c: unknown): c is Node => typeof c === 'object' && c !== null && 'type' in c
/** Every element under one found element, depth first. */
const within = (el: { children?: unknown[] }): Node[] =>
  (el.children ?? []).filter(isNode).flatMap(c => [c, ...within(c)])
const textOf = (el: Node): string =>
  (el.children ?? []).map(c => (typeof c === 'string' ? c : isNode(c) ? textOf(c) : '')).join('')

const MAP = '.scratch/billing-v2/map.md'
const INVOICE = 'frontier-billing-v2/03'
const TAX = 'frontier-billing-v2/04'

const mixed = () => ({ files: scenarioFiles('local', 'mixed') })

/** The mixed map with its two takeable tickets claimed, so nothing is takeable. */
const nothingTakeable = () => {
  const files = { ...scenarioFiles('local', 'mixed') }
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith('03-invoice-layout.md') || path.endsWith('04-tax-rounding.md'))
      files[path] = text.replace(/^# .*$/m, (m: string) => `${m}\nStatus: claimed\nAssignee: ada`)
  }
  return { files }
}

/** The band with the frontier card opened from the map chip. */
const openCard = async ($: Engine, surface: BandSurface) => {
  await startSession($, surface)
  await (await mountBand($, surface, 200)).press({ key: 'map-chip' })
  return mountBand($, surface, 200)
}

for (const surface of BAND_SURFACES) {
  test(`${surface}: the frontier lists each takeable ticket under its heading, with ▸, the title and its type`, async ($, on) => {
    featureWorld(on, { surfaces: [surface], ...mixed() })
    const band = await openCard($, surface)
    expect((await band.find({ key: 'frontier-head' }))!.text).toBe('Frontier · takeable now')
    const invoice = (await band.find({ key: INVOICE }))!.text
    expect(invoice).toMatch(/^▸ ?Invoice layout ?Prototype$/)
    expect((await band.find({ key: TAX }))!.text).toMatch(/^▸ ?Tax rounding ?Grilling$/)
    expect((await band.find({ key: 'map-card' }))!.text).not.toContain('(prototype)')
  })

  test(`${surface}: Work next ticket runs /wayfinder on the map and Open map links the map`, async ($, on) => {
    const w = featureWorld(on, { surfaces: [surface], ...mixed() })
    const band = await openCard($, surface)
    // the same Link as the Tickets tab's: Desktop draws a local path as plain text
    const open = (await band.find({ key: 'frontier-open-map' }))!
    expect(open.text).toBe('Open map')
    if (surface === 'terminal') {
      const links = await band.findAll({ type: 'Link' })
      expect(links.find(l => l.props.href === MAP)?.props.label).toBe('Open map')
    }
    await band.press({ key: 'frontier-work-next' })
    expect(w.commandsRun).toEqual([{ command: 'mattpocock-skills:wayfinder', args: MAP }])
  })

  test(`${surface}: with nothing takeable a muted hint stands in for Work next ticket`, async ($, on) => {
    const w = featureWorld(on, { surfaces: [surface], ...nothingTakeable() })
    const band = await openCard($, surface)
    expect(await band.find({ key: 'frontier-work-next' })).toBeUndefined()
    expect(await band.find({ key: 'frontier-head' })).toBeUndefined()
    const hint = (await band.find({ key: 'frontier-work-next-off' }))!
    expect(hint.text).toBe('Work next ticket · Nothing takeable')
    expect((await band.find({ key: 'frontier-open-map' }))!.text).toBe('Open map')
    expect(w.commandsRun).toEqual([])
  })
}

for (const tone of ['light', 'dark'] as const) {
  test(`desktop ${tone}: an agent kicker, a framed Frontier with a header strip, and outlined type badges`, async ($, on) => {
    featureWorld(on, { surfaces: ['desktop'], theme: tone, ...mixed() })
    const band = await openCard($, 'desktop')
    const t = TOKENS[tone]
    const kicker = within((await band.find({ key: 'map-card' }))!).find(
      e => e.type === 'Text' && textOf(e).startsWith('Wayfinder · Local'),
    )
    expect(kicker?.props.color).toBe(TRIPLES.agent[tone].fg)
    expect((await band.find({ key: 'frontier' }))!.props).toMatchObject({
      borderStyle: 'round',
      borderColor: t.line,
    })
    expect((await band.find({ key: 'frontier-head' }))!.props.backgroundColor).toBe(t.surface2)
    for (const [ref, role] of [
      ['billing-v2/03', 'agent'],
      ['billing-v2/04', 'skill'],
    ] as const) {
      const badge = (await band.find({ key: `frontier-type-${ref}` }))!
      const fg = TRIPLES[role][tone].fg
      expect(badge.props).toMatchObject({ borderStyle: 'round', borderColor: fg })
      expect(badge.props.backgroundColor).toBeUndefined()
      expect(
        within(badge)
          .filter(e => e.type === 'Text')
          .map(e => e.props.color),
      ).toEqual([fg])
    }
    // one hairline between the two rows, none above the first
    expect(
      within((await band.find({ key: 'frontier' }))!).filter(e => e.type === 'Svg').length,
    ).toBe(1)
    expect((await band.find({ key: 'frontier-work-next-box' }))!.props.backgroundColor).toBe(
      t.inverseBg,
    )
  })
}

test('desktop: no Button in the frontier card holds coloured Text', async ($, on) => {
  featureWorld(on, { surfaces: ['desktop'], ...mixed() })
  const band = await openCard($, 'desktop')
  const card = (await band.find({ key: 'map-card' }))!
  const buttons = within(card).filter(
    e => e.type === 'Button' && !String(e.props.key ?? '').startsWith('map-switch'),
  )
  expect(buttons.length).toBeGreaterThan(0)
  for (const b of buttons)
    expect(within(b).filter(e => e.type === 'Text' && e.props.color !== undefined)).toEqual([])
})

test('terminal: the kicker and types are coloured, with no frame around the Frontier', async ($, on) => {
  featureWorld(on, { theme: 'dark', ...mixed() })
  const band = await openCard($, 'terminal')
  const card = (await band.find({ key: 'map-card' }))!
  const kicker = within(card).find(e => e.type === 'Text' && textOf(e).startsWith('Wayfinder'))
  expect(kicker?.props.color).toBe(TRIPLES.agent.dark.fg)
  expect((await band.find({ key: 'frontier' }))?.props.borderStyle).toBeUndefined()
  const type = within((await band.find({ key: INVOICE }))!).find(
    e => e.type === 'Text' && textOf(e) === 'Prototype',
  )
  expect(type?.props.color).toBe(TRIPLES.agent.dark.fg)
  expect(within(card).filter(e => e.type === 'Svg')).toEqual([])
})

test('the frontier rows are ascii-safe when the glyphs are off', async ($, on) => {
  featureWorld(on, { ...mixed(), store: { prefs: { ascii: true } } })
  const band = await openCard($, 'terminal')
  expect((await band.find({ key: INVOICE }))!.text).toBe('> Invoice layout Prototype')
  expect((await band.find({ key: TAX }))!.text).toBe('> Tax rounding Grilling')
})

test('mobile: the frontier card in the Flow head runs Work next ticket too', async ($, on) => {
  const w = featureWorld(on, { surfaces: ['mobile'], ...mixed() })
  await startSession($, 'mobile')
  const pane = await mountPane($, 'mobile')
  await pane.press({ key: 'tab-flow' })
  await pane.redraw()
  await pane.press({ key: 'map-chip' })
  await pane.redraw()
  expect((await pane.find({ key: INVOICE }))!.text).toContain('Prototype')
  await pane.press({ key: 'frontier-work-next' })
  expect(w.commandsRun).toEqual([{ command: 'mattpocock-skills:wayfinder', args: MAP }])
})
