import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow, type Flow, type PhaseState } from '../src/evidence'
import { phaseMeta } from '../src/card-model'
import { renderBand, type BandActions, type BandArgs } from '../src/rail'
import { paint, SPINNER, PHASE_LOOKS, TRIPLES } from '../src/theme'
import type { Feature, IssueRef, PhaseId, Tone } from '../types'
import { byKey, fakeUi, findAll, textOf, type Node } from './fake-ui'

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

const baseFlow = (feature: Feature = draft): Flow =>
  deriveFlow({ feature, config: DEFAULT_CONFIG, tracker: null, running: null })

const withState = (flow: Flow, phase: PhaseId, state: PhaseState): Flow => ({
  ...flow,
  current: state.kind === 'running' || state.kind === 'needs-you' ? phase : flow.current,
  phases: flow.phases.map(s => (s.phase === phase ? { ...s, state } : s)),
})

const calls: string[] = []
const on: BandActions = {
  phase: (phase, fits) => void calls.push(`view ${phase} ${fits}`),
  triage: fits => void calls.push(`triage ${fits}`),
  summary: () => void calls.push('summary'),
  gear: () => void calls.push('gear'),
  closeCard: () => void calls.push('close'),
  pickFeature: () => void calls.push('pick'),
  switchFeature: key => void calls.push(`switch ${key}`),
  map: () => void calls.push('map'),
  pickMap: ref => void calls.push(`pick ${ref}`),
  act: action => void calls.push(action.kind === 'run-phase' ? `run ${action.phase}` : action.kind),
}

const args = (over: Partial<BandArgs> = {}): BandArgs => ({
  ui: fakeUi(),
  surface: 'terminal',
  columns: 140,
  maxRows: 40,
  tone: undefined,
  ascii: false,
  spinFrame: 0,
  below: undefined,
  layout: 'row',
  flow: baseFlow(),
  config: DEFAULT_CONFIG,
  waiting: 0,
  agents: null,
  notices: [],
  open: null,
  map: null,
  isMapOpen: false,
  features: [],
  isPickingFeature: false,
  on,
  ...over,
})

const phaseText = (out: unknown, phase: PhaseId) => textOf(byKey(out, `phase-${phase}`))

const STATES: [string, PhaseState, string, string][] = [
  ['done', { kind: 'done', artifact: null }, '✓ Build', 'v Build'],
  ['next', { kind: 'next' }, '▸ Build', '> Build'],
  ['running', { kind: 'running', progress: '1/5' }, '◐ Build 1/5', '| Build 1/5'],
  ['needs-you', { kind: 'needs-you', meta: 'Q6 of ~14' }, '? Build Q6 of ~14', '? Build Q6 of ~14'],
  ['gated', { kind: 'gated', by: 'tickets', blockers: [] }, '⊘ Build', 'x Build'],
  ['failed', { kind: 'failed', meta: '2 tests red' }, '▲ Build 2 tests red', '! Build 2 tests red'],
  [
    'over-budget',
    { kind: 'over-budget', ticket: '#44' as IssueRef, budget: 80_000 },
    '▲ Build #44 · 80k',
    '! Build #44 · 80k',
  ],
  ['skipped', { kind: 'skipped', why: 'off' }, '– Build', '- Build'],
  ['todo', { kind: 'todo' }, '· Build', '. Build'],
]

for (const [name, state, glyphs, ascii] of STATES) {
  test(`terminal view state ${name}: glyph, words and the ASCII fallback`, () => {
    const flow = withState(baseFlow(), 'build', state)
    expect(phaseText(renderBand(args({ flow })), 'build')).toBe(glyphs)
    expect(phaseText(renderBand(args({ flow, ascii: true })), 'build')).toBe(ascii)
  })
}

test('every glyph is one cell wide and every state has an ASCII twin of one cell', () => {
  for (const look of Object.values(PHASE_LOOKS)) {
    expect([...look.glyph]).toHaveLength(1)
    expect(look.ascii).toHaveLength(1)
  }
})

test('the running spinner turns with the frame, and has its own ASCII frames', () => {
  const flow = withState(baseFlow(), 'build', { kind: 'running', progress: null })
  const glyph = (spinFrame: number, ascii = false) =>
    phaseText(renderBand(args({ flow, spinFrame, ascii })), 'build')[0]
  expect(SPINNER.map((_, i) => glyph(i))).toEqual(['◐', '◓', '◑', '◒'])
  expect([0, 1, 2, 3].map(i => glyph(i, true))).toEqual(['|', '/', '-', '\\'])
})

test('state colours follow the roles: perm done, skill next, hook needs you, danger failed', () => {
  const flow = (kind: PhaseState) => withState(baseFlow(), 'build', kind)
  const glyphColor = (state: PhaseState, tone: Tone | undefined) => {
    const out = renderBand(args({ flow: flow(state), tone }))
    return findAll(byKey(out, 'phase-build'), n => n.type === 'Text')[0]!.props.color as unknown
  }
  expect(glyphColor({ kind: 'done', artifact: null }, undefined)).toBe('planMode')
  expect(glyphColor({ kind: 'next' }, undefined)).toBe('suggestion')
  expect(glyphColor({ kind: 'needs-you', meta: 'x' }, undefined)).toBe('warning')
  expect(glyphColor({ kind: 'failed', meta: 'x' }, undefined)).toBe('error')
  for (const tone of ['light', 'dark'] as const) {
    expect(glyphColor({ kind: 'done', artifact: null }, tone)).toBe(TRIPLES.perm[tone].fg)
    expect(glyphColor({ kind: 'next' }, tone)).toBe(TRIPLES.skill[tone].fg)
    expect(glyphColor({ kind: 'needs-you', meta: 'x' }, tone)).toBe(TRIPLES.hook[tone].fg)
    expect(glyphColor({ kind: 'failed', meta: 'x' }, tone)).toBe(paint('danger', tone).fg)
  }
})

test('skipped is struck through and dim; next is bold', () => {
  const out = renderBand(
    args({ flow: withState(baseFlow(), 'retro', { kind: 'skipped', why: 'off' }) }),
  )
  const label = findAll(byKey(out, 'phase-retro'), n => n.type === 'Text')[1]!
  expect(label.props).toMatchObject({ strikethrough: true, dimColor: true })
  const next = findAll(byKey(renderBand(args()), 'phase-align'), n => n.type === 'Text')[1]!
  expect(next.props.bold).toBe(true)
})

test('connectors are teal after a done phase and neutral otherwise', () => {
  const flow = withState(baseFlow(), 'align', { kind: 'done', artifact: null })
  const out = renderBand(args({ flow, tone: 'dark' }))
  const connectors = findAll(out, n => n.type === 'Text' && textOf(n) === '─')
  expect(connectors).toHaveLength(6)
  expect(connectors[0]!.props.color).toBe(TRIPLES.perm.dark.bd)
  expect(connectors[1]!.props.color).not.toBe(TRIPLES.perm.dark.bd)
})

test("another mod's row is the first child of the band, in its own row", () => {
  const below = { type: 'Box', props: { key: 'session-activity' }, children: [] } as never
  const out = renderBand(args({ below })) as Node
  expect(out.children[0]).toBe(below)
  expect(findAll(out.children[0], n => n.type === 'Text')).toEqual([])
})

test('the rail reads triage, divider, phases, title and gear in that order', () => {
  const out = renderBand(args({ waiting: 3 }))
  expect(textOf(byKey(out, 'triage'))).toBe('Inbox 3')
  const all = textOf(out)
  expect(all.indexOf('Inbox 3')).toBeLessThan(all.indexOf('│'))
  expect(all.indexOf('│')).toBeLessThan(all.indexOf('Align'))
  expect(all.indexOf('Retro')).toBeLessThan(all.indexOf('Export invoices as CSV'))
  expect(all.indexOf('Export invoices as CSV')).toBeLessThan(all.indexOf('⚙'))
})

test('desktop draws state icons as images and meta in a mono badge', () => {
  const flow = withState(baseFlow(), 'build', { kind: 'running', progress: '1/5' })
  const out = renderBand(
    args({ ui: fakeUi(true), surface: 'desktop', tone: 'light', flow, waiting: 2, columns: 200 }),
  )
  const icons = findAll(out, n => n.type === 'Svg')
  expect(icons.map(i => i.props.alt)).toContain('Running')
  expect(icons.length).toBeGreaterThanOrEqual(8)
  const badge = findAll(out, n => n.type === 'Text' && textOf(n).trim() === '1/5')[0]!
  expect(badge.props).toMatchObject({ mono: true })
  const rail = byKey(out, 'rail')!
  expect(rail.props).toMatchObject({ borderStyle: 'round', backgroundColor: '#FFFFFF' })
})

test('a feature entered from triage shows the issue it came from on the entry view', () => {
  const feature: Feature = {
    kind: 'specced',
    key: 'spec:#42',
    record: {
      version: 1,
      spec: '#42' as IssueRef,
      origin: 'spec',
      title: 'T',
      entry: 'build',
      enteredFrom: '#41' as IssueRef,
      skips: {},
      integrationBranch: '',
      pr: null,
      marks: {},
      agents: {},
    },
  }
  const out = renderBand(args({ flow: baseFlow(feature) }))
  expect(phaseText(out, 'align')).toBe('– Align')
  expect(phaseText(out, 'build')).toBe('▸ Build #41')
  expect(phaseMeta(baseFlow(feature).phases[3]!, baseFlow(feature))).toBe('#41')
})

test('a title press opens the switcher only when several features are in flight', () => {
  const none = renderBand(args())
  expect(byKey(none, 'title-switch')).toBeUndefined()
  const features = [
    { key: 'spec:#42' as const, title: 'Export invoices', isActive: true },
    { key: 'spec:#50' as const, title: 'Dark mode', isActive: false },
  ]
  const out = renderBand(args({ features, isPickingFeature: true }))
  expect(textOf(byKey(out, 'title-switch'))).toBe('Export invoices as CSV ▾')
  const other = byKey(out, 'feature-spec:#50')!
  ;(other.props.onPress as () => void)()
  expect(calls.at(-1)).toBe('switch spec:#50')
})

test('the summary layout is one chip naming the feature and phase, with the gear', () => {
  const flow = withState(baseFlow(), 'build', { kind: 'running', progress: '2/5' })
  const out = renderBand(args({ flow, layout: 'summary' }))
  expect(textOf(byKey(out, 'summary'))).toBe('Export invoices as CSV · Build 2/5')
  expect(byKey(out, 'phase-build')).toBeUndefined()
  expect(byKey(out, 'gear')).toBeDefined()
  ;(byKey(out, 'summary')!.props.onPress as () => void)()
  expect(calls.at(-1)).toBe('summary')
})

test('a band too narrow for seven phases collapses to the chip by itself', () => {
  expect(byKey(renderBand(args({ columns: 140 })), 'phase-build')).toBeDefined()
  const narrow = renderBand(args({ columns: 60 }))
  expect(byKey(narrow, 'phase-build')).toBeUndefined()
  expect(byKey(narrow, 'summary')).toBeDefined()
})

test('a pressed view opens the card: kicker, title, command, helpers, gate and buttons', () => {
  const out = renderBand(args({ open: 'spec' }))
  const card = byKey(out, 'card')!
  const text = textOf(card)
  expect(text).toContain('Phase 2 of 7 · Gated')
  expect(text).toContain('Spec')
  expect(text).toContain('Turns the conversation into a spec')
  expect(text).toContain('Command')
  expect(text).toContain('/to-spec')
  expect(text).toContain('Gated: not run yet. It still runs after you confirm.')
  expect(byKey(card, 'primary')!.props.label).toBe('r: /to-spec')
  ;(byKey(card, 'primary')!.props.onPress as () => void)()
  expect(calls.at(-1)).toBe('run spec')
  ;(byKey(card, 'close')!.props.onPress as () => void)()
  expect(calls.at(-1)).toBe('close')
  const build = textOf(byKey(renderBand(args({ open: 'build' })), 'card'))
  expect(build).toContain('Helpers')
  expect(build).toContain('tdd')
  expect(build).toContain('Gate on:')
})

test('a phase with no command says what starts it', () => {
  const card = textOf(byKey(renderBand(args({ open: 'review' })), 'card'))
  expect(card).toContain('None to type. Runs as the end of Build.')
  expect(byKey(byKey(renderBand(args({ open: 'review' })), 'card'), 'primary')).toBeUndefined()
})

test('a done phase offers Re-run and an Open button for its artifact', () => {
  const flow = withState(baseFlow(), 'align', { kind: 'done', artifact: 'GLOSSARY.md (+3 terms)' })
  const withArtifact = {
    ...flow,
    phases: flow.phases.map(s =>
      s.phase === 'align' ? { ...s, artifact: 'GLOSSARY.md (+3 terms)' } : s,
    ),
  }
  const card = byKey(renderBand(args({ flow: withArtifact, open: 'align' })), 'card')
  expect(textOf(card)).toContain('GLOSSARY.md (+3 terms)')
  expect(textOf(card)).toContain('Updated')
  expect(byKey(card, 'primary')!.props.label).toBe('r: Re-run /grill-with-docs')
})

test('triage opens its own card, outside the seven phases', () => {
  const out = renderBand(args({ open: 'triage', waiting: 3 }))
  const text = textOf(byKey(out, 'card'))
  expect(text).toContain('Entry point · outside the 7 phases')
  expect(text).toContain('3 new · labelled needs-triage')
  expect(text).toContain('/triage')
})

test('a card that does not fit the band is not drawn, and the press says so', () => {
  const short = args({ open: 'build', maxRows: 12 })
  expect(byKey(renderBand(short), 'card')).toBeUndefined()
  ;(byKey(renderBand(short), 'phase-build')!.props.onPress as () => void)()
  expect(calls.at(-1)).toBe('view build false')
  ;(byKey(renderBand(args()), 'phase-build')!.props.onPress as () => void)()
  expect(calls.at(-1)).toBe('view build true')
})

test('a derived notice replaces the rail, an event notice sits above it', () => {
  const notice = (id: string, replacesRail: boolean) => ({
    id,
    role: 'hook' as const,
    text: id,
    actions: [],
    replacesRail,
  })
  const replaced = renderBand(args({ notices: [notice('plugin', true)] }))
  expect(byKey(replaced, 'rail')).toBeUndefined()
  expect(textOf(replaced)).toContain('plugin')
  const above = renderBand(args({ notices: [notice('gate-spec', false)] })) as Node
  const rows = above.children.map(c => (c as Node).props.key)
  expect(rows).toEqual(['notice-gate-spec', 'rail'])
})

const shipFlow = (artifact: string | null) => {
  const flow = withState(baseFlow(), 'ship', { kind: 'todo' })
  return { ...flow, phases: flow.phases.map(s => (s.phase === 'ship' ? { ...s, artifact } : s)) }
}

test('Ship offers /pr to rewrite the body once there is a pull request, and it runs the pr skill', () => {
  calls.length = 0
  const card = byKey(renderBand(args({ flow: shipFlow('#60 (draft)'), open: 'ship' })), 'card')
  expect(byKey(card, 'pr')!.props.label).toBe('Rewrite the body with /pr')
  ;(byKey(card, 'pr')!.props.onPress as () => void)()
  expect(calls).toEqual(['write-pr'])
  const without = byKey(renderBand(args({ flow: shipFlow(null), open: 'ship' })), 'card')
  expect(byKey(without, 'pr')).toBeUndefined()
})

test('a Build that failed or ran out of budget offers diagnosing-bugs instead of moving on', () => {
  for (const state of [
    { kind: 'failed', meta: '#44 failed' },
    { kind: 'over-budget', ticket: '#44' as IssueRef, budget: 80_000 },
  ] as const) {
    calls.length = 0
    const flow = withState(baseFlow(), 'build', state)
    const card = byKey(renderBand(args({ flow, open: 'build' })), 'card')
    expect(byKey(card, 'diagnose')!.props.label).toBe('Diagnose')
    ;(byKey(card, 'diagnose')!.props.onPress as () => void)()
    expect(calls).toEqual(['diagnose'])
  }
})
