import { expect, test } from 'claude-code/testing'
import type { ElementQuery, FoundElement } from 'claude-code/testing'
import { TOKENS, TRIPLES } from '../src/theme'
import {
  allText,
  BAND_SURFACES,
  bandProps,
  featureWorld,
  mountBand,
  skillPrompt,
  startSession,
  texts,
  turnComplete,
} from './harness'

type Seen = { find: (q: ElementQuery) => Promise<FoundElement | undefined> }
const find = (band: Seen, key: string) => band.find({ key })

for (const surface of BAND_SURFACES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`${surface} ${tone}: the rail shows what is done, what is next and what is gated`, async ($, on) => {
      featureWorld(on, { surfaces: [surface], theme: tone })
      await startSession($, surface)
      const band = await mountBand($, surface, 200)
      const rail = await find(band, 'rail')
      expect(rail).toBeDefined()
      const text = await allText(band)
      for (const label of ['Align', 'Spec', 'Tickets', 'Build', 'Review', 'Ship', 'Retro'])
        expect(text).toContain(label)
      expect(text).toContain('csv')
      expect(text).toContain('Export invoices as CSV')
      const label = async (word: string) =>
        (await band.findAll({ type: 'Text' })).find(t => t.text === word)
      if (surface === 'terminal') {
        expect(await band.findAll({ type: 'Svg' })).toEqual([])
        expect((await find(band, 'phase-align'))!.text).toBe('✓ Align')
        expect((await find(band, 'phase-build'))!.text).toBe('▸ Build')
        expect((await find(band, 'phase-review'))!.text).toBe('⊘ Review')
        expect((await find(band, 'phase-retro'))!.text).toBe('· Retro')
        expect((await label('Build'))?.props.color).toBe(TRIPLES.skill[tone].fg)
        expect((await label('Align'))?.props.color).toBe(TOKENS[tone].ink)
      } else {
        const alts = (await band.findAll({ type: 'Svg' })).map(s => s.props.alt)
        expect(alts).toEqual(expect.arrayContaining(['Done', 'Up next', 'Gated', 'Not started']))
        expect(rail!.props).toMatchObject({
          borderStyle: 'round',
          borderColor: TOKENS[tone].line,
          backgroundColor: TOKENS[tone].surface,
        })
        expect((await label('Build'))?.props.color).toBe(TRIPLES.skill[tone].fg)
      }
    })
  }
}

test("another mod's row is drawn in its own row above the rail", async ($, on) => {
  featureWorld(on)
  await startSession($)
  const drawn = (await (await mountBand($)).drawn()) as {
    children: { props: { key?: string } }[]
  }
  expect(drawn.children.map(c => c.props?.key)).toEqual([undefined, 'rail'])
})

test('pressing a view opens its card, a second press and Close shut it', async ($, on) => {
  featureWorld(on)
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  expect(await find(band, 'card')).toBeUndefined()
  await band.press({ key: 'phase-tickets' })
  let open = await mountBand($, 'terminal', 200)
  expect((await find(open, 'card'))!.text).toContain('Phase 3 of 7 · Done')
  await open.press({ key: 'phase-tickets' })
  expect(await find(await mountBand($, 'terminal', 200), 'card')).toBeUndefined()
  await open.press({ key: 'phase-build' })
  open = await mountBand($, 'terminal', 200)
  expect((await find(open, 'card'))!.text).toContain('Phase 4 of 7 · Up next')
  await open.press({ key: 'close' })
  expect(await find(await mountBand($, 'terminal', 200), 'card')).toBeUndefined()
})

test('the card shows the command, helpers, artifact and the amber gate line', async ($, on) => {
  featureWorld(on)
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-build' })
  const card = (await find(await mountBand($, 'terminal', 200), 'card'))!
  for (const part of ['Build', '/implement-spec', 'tdd', 'diagnosing-bugs', 'Gate on:'])
    expect(card.text).toContain(part)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-tickets' })
  const tickets = (await find(await mountBand($, 'terminal', 200), 'card'))!
  expect(tickets.text).toContain('Created')
  expect(tickets.text).toContain('csv/01 to csv/03 · 1 ready, 2 blocked')
})

test('the card primary submits the namespaced command with the spec as its argument', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-build' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'primary' })
  expect(w.commandsRun).toEqual([
    { command: 'mattpocock-skills:implement-spec', args: '.scratch/csv/spec.md' },
  ])
  expect(await find(await mountBand($, 'terminal', 200), 'card')).toBeUndefined()
})

test('Open csv opens the pane on the tickets tab', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  await (await mountBand($, 'terminal', 200)).press({ key: 'phase-spec' })
  await (await mountBand($, 'terminal', 200)).press({ key: 'open-spec' })
  expect(w.opens).toEqual([expect.objectContaining({ id: 'craftory' })])
})

test('the gear opens the pane and the triage button opens its card', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  await band.press({ key: 'triage' })
  expect((await find(await mountBand($, 'terminal', 200), 'card'))!.text).toContain(
    'Entry point · outside the 7 phases',
  )
  await band.press({ key: 'gear' })
  expect(w.opens).toHaveLength(1)
})

test('the gear hides the pane when Settings is showing, and shows it again', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  await band.press({ key: 'gear' })
  await band.press({ key: 'gear' })
  expect(w.panes.size).toBe(0)
  await band.press({ key: 'gear' })
  expect(w.opens).toHaveLength(2)
  expect(w.panes.size).toBe(1)
})

test('rail_layout summary draws one chip, and so does a narrow band', async ($, on) => {
  featureWorld(on, { store: { prefs: { railLayout: 'summary' } } })
  await startSession($)
  const chip = await mountBand($, 'terminal', 200)
  expect(await find(chip, 'phase-build')).toBeUndefined()
  expect((await find(chip, 'summary'))!.text).toBe('Export invoices as CSV · Build')
})

test('a band too narrow for seven phases collapses to the chip', async ($, on) => {
  featureWorld(on)
  await startSession($)
  const narrow = await mountBand($, 'terminal', 50)
  expect(await find(narrow, 'phase-build')).toBeUndefined()
  expect(await find(narrow, 'summary')).toBeDefined()
})

test('a band without the rows for the card still opens it, for the band to scroll', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  const band = await $.ui.mount({
    plugin: 'craftory',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: bandProps(200, 10),
  })
  await band.press({ key: 'phase-build' })
  expect(w.opens).toEqual([])
  expect(await find(band, 'card')).toBeDefined()
})

test('the ascii pref draws plain characters', async ($, on) => {
  featureWorld(on, { store: { prefs: { ascii: true } } })
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  expect((await find(band, 'phase-align'))!.text).toBe('v Align')
  expect((await find(band, 'phase-build'))!.text).toBe('> Build')
  expect((await find(band, 'phase-review'))!.text).toBe('x Review')
})

test('a running skill spins while it runs, and the spinner stops with it', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  await skillPrompt($, 'to-tickets')
  const glyph = async () =>
    (await find(await mountBand($, 'terminal', 200), 'phase-tickets'))!.text[0]
  const first = await glyph()
  expect('◐◓◑◒').toContain(first!)
  await w.clock.advance(150)
  expect(await glyph()).not.toBe(first)
  await turnComplete($)
  expect((await find(await mountBand($, 'terminal', 200), 'phase-tickets'))!.text).toBe(
    '✓ Tickets 3',
  )
})

test('a grill that asks a question is needs-you until the user answers', async ($, on) => {
  featureWorld(on, { files: { '.craftory/features/csv.json': '' } })
  await startSession($)
  await skillPrompt($, 'grill-with-docs')
  await turnComplete($)
  const text = async () => (await find(await mountBand($, 'terminal', 200), 'phase-align'))!.text
  expect(await text()).toContain('? Align waiting on you')
  expect((await texts(await mountBand($, 'terminal', 200))).join(' ')).not.toContain(
    'Start a feature',
  )
})
