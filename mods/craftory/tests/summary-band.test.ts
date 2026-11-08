import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { chipText, summaryParts } from '../src/card-model'
import { deriveFlow, type Flow, type PhaseState } from '../src/evidence'
import { mapView } from '../src/map-view'
import { renderBand, type BandActions, type BandArgs } from '../src/rail'
import { paint, PHASE_LOOKS, TOKENS } from '../src/theme'
import type { Feature, IssueRef, PhaseId, Tone, WayMap } from '../types'
import { byKey, fakeUi, findAll, textOf, type Node } from './fake-ui'
import { featureWorld, mountBand, startSession } from './harness'
import { scenarioFiles } from './wayfinder'

const draft: Feature = {
  kind: 'draft',
  key: 'draft:d1',
  draft: {
    draftId: 'd1',
    title: 'Export invoices as CSV',
    entry: 'align',
    enteredFrom: null,
    marks: {},
    startedAt: '2026-10-24T09:00:00Z',
  },
}

const baseFlow = (): Flow =>
  deriveFlow({ feature: draft, config: DEFAULT_CONFIG, tracker: null, running: null })

const withState = (flow: Flow, phase: PhaseId, state: PhaseState): Flow => ({
  ...flow,
  current: state.kind === 'running' || state.kind === 'needs-you' ? phase : flow.current,
  phases: flow.phases.map(s => (s.phase === phase ? { ...s, state } : s)),
})

const running = () => withState(baseFlow(), 'build', { kind: 'running', progress: '2/5' })

test('the summary splits into title, phase name and count', () => {
  expect(summaryParts(running())).toEqual({
    title: 'Export invoices as CSV',
    phase: 'Build',
    count: '2/5',
  })
  expect(summaryParts(baseFlow()).count).toBeNull()
  expect(chipText(running())).toBe('Export invoices as CSV · Build 2/5')
})

const billing = mapView({
  ref: 'm' as IssueRef,
  source: 'local',
  title: 'Billing v2',
  origin: '.scratch/m',
  location: '.scratch/m/map.md',
  isClosed: false,
  destination: '',
  hasFog: false,
  tickets: [1, 2, 3].map(n => ({
    ref: `m/0${n}` as IssueRef,
    title: `Ticket ${n}`,
    type: null,
    state: n === 1 ? ('resolved' as const) : ('open' as const),
    assignee: null,
    blockedBy: [],
    location: `.scratch/m/issues/0${n}.md`,
  })),
  updatedAt: 1,
} satisfies WayMap)

const calls: string[] = []
const on: BandActions = {
  phase: phase => void calls.push(`view ${phase}`),
  triage: () => void calls.push('triage'),
  summary: () => void calls.push('summary'),
  gear: () => void calls.push('gear'),
  closeCard: () => void calls.push('close'),
  pickFeature: () => void calls.push('pick'),
  switchFeature: key => void calls.push(`switch ${key}`),
  map: () => void calls.push('map'),
  pickMap: ref => void calls.push(`pick ${ref}`),
  act: action => void calls.push(action.kind),
}

const band = (over: Partial<BandArgs> = {}) =>
  renderBand({
    ui: fakeUi(),
    surface: 'terminal',
    columns: 140,
    maxRows: 40,
    tone: undefined,
    ascii: false,
    spinFrame: 0,
    below: undefined,
    layout: 'summary',
    flow: running(),
    config: DEFAULT_CONFIG,
    waiting: 0,
    agents: null,
    notices: [],
    open: null,
    map: billing,
    isMapOpen: false,
    features: [],
    isPickingFeature: false,
    on,
    ...over,
  })

const PARTS = ['box-map-chip', 'summary-sep', 'summary', 'summary-phase', 'summary-count']
/** The summary's keyed parts, in drawing order. */
const order = (out: unknown) =>
  findAll(byKey(out, 'summary-row'), n => PARTS.includes(n.props.key as string)).map(
    n => n.props.key,
  )

const SURFACES = [
  ['terminal', false, undefined],
  ['desktop', true, 'light'],
  ['desktop', true, 'dark'],
] as const

for (const [surface, rich, tone] of SURFACES) {
  const ui = () => fakeUi(rich)
  const name = `${surface}${tone ? ` ${tone}` : ''}`

  test(`${name}: with a map the summary reads map › title · phase count`, () => {
    const out = band({ ui: ui(), surface, tone })
    expect(order(out)).toEqual(PARTS)
    expect(textOf(byKey(out, 'box-map-chip'))).toContain('1✓ 2?')
    expect(textOf(byKey(out, 'summary-sep')).trim()).toBe('›')
    expect(textOf(byKey(out, 'summary'))).toBe('Export invoices as CSV')
    expect(textOf(byKey(out, 'summary-phase'))).toContain('Build')
    expect(textOf(byKey(out, 'summary-count')).trim()).toBe('2/5')
  })

  test(`${name}: without a map the summary is title · phase · count, with no separator`, () => {
    const out = band({ ui: ui(), surface, tone, map: null })
    expect(order(out)).toEqual(['summary', 'summary-phase', 'summary-count'])
  })

  test(`${name}: pressing the summary expands the rail`, () => {
    const out = band({ ui: ui(), surface, tone })
    ;(byKey(out, 'summary')!.props.onPress as () => void)()
    expect(calls.at(-1)).toBe('summary')
  })
}

test('ASCII glyphs turn the separator into >', () => {
  expect(textOf(byKey(band({ ascii: true }), 'summary-sep')).trim()).toBe('>')
})

for (const tone of ['light', 'dark'] as Tone[]) {
  test(`desktop ${tone}: the title is the Button label; phase and count carry their colours outside it`, () => {
    const out = band({ ui: fakeUi(true), surface: 'desktop', tone })
    const button = byKey(out, 'summary')!
    expect(findAll(button, n => n.type === 'Text' && n.props.color !== undefined)).toEqual([])
    expect(findAll(button, (n: Node) => n.props.bold === true).length).toBe(1)
    const state = paint(PHASE_LOOKS.running.role, tone).fg
    expect(byKey(out, 'summary-phase')!.props.color).toBe(state)
    const count = byKey(out, 'summary-count')!
    expect(count.props.backgroundColor).toBeDefined()
    expect(count.props.color).toBe(TOKENS[tone].text2)
  })
}

type Drawn = { props: Record<string, unknown>; children?: unknown[] }
const isDrawn = (c: unknown): c is Drawn => typeof c === 'object' && c !== null && 'props' in c
/** Every element under one found element, depth first. */
const within = (el: { children?: unknown[] }): Drawn[] =>
  (el.children ?? []).filter(isDrawn).flatMap(c => [c, ...within(c)])

for (const [surface, theme] of [
  ['terminal', 'dark'],
  ['desktop', 'light'],
  ['desktop', 'dark'],
] as const) {
  test(`${surface} ${theme} band: summary mode draws the map chip, ›, then the feature, and a press expands it`, async ($, on) => {
    const w = featureWorld(on, {
      surfaces: [surface],
      theme,
      files: scenarioFiles('local', 'mixed'),
      store: { prefs: { railLayout: 'summary' } },
    })
    await startSession($, surface)
    const band = await mountBand($, surface, 200)
    expect(await band.find({ key: 'phase-build' })).toBeUndefined()
    expect((await band.find({ key: 'box-map-chip' }))!.text).toMatch(/Billing v2 ?2✓ 4\?$/)
    expect((await band.find({ key: 'summary' }))!.text).toBe('Export invoices as CSV')
    // The engine keeps no key on a Text, so the order is read off the row's text.
    expect((await band.find({ key: 'summary-row' }))!.text).toMatch(
      /^(◆ )?Billing v2 ?2✓ 4\?›(▸ )?Export invoices as CSV ?· Build⚙$/,
    )
    const chip = (await band.find({ key: 'summary-chip' }))!
    const coloured = within(await band.find({ key: 'summary' }).then(b => b!)).filter(
      n => n.props.color !== undefined,
    )
    expect(coloured).toHaveLength(surface === 'desktop' ? 0 : 1)
    expect(chip.text).toContain('· Build')
    await band.press({ key: 'summary' })
    expect(w.opens).toHaveLength(1)
  })
}
