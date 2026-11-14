import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG } from '../src/config'
import { deriveFlow, type PhaseState } from '../src/evidence'
import { renderBand, type BandActions, type BandArgs } from '../src/rail'
import { Entry, Field, type Typed } from '../src/widgets'
import { mapView } from '../src/map-view'
import type { Feature, IssueRef, Tone, WayMap } from '../types'
import { byKey, fakeUi, findAll, textOf } from './fake-ui'
import { featureWorld, mountPane, startSession } from './harness'

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

const noop = () => undefined
const on: BandActions = {
  phase: noop,
  triage: noop,
  summary: noop,
  gear: noop,
  closeCard: noop,
  pickFeature: noop,
  switchFeature: noop,
  map: noop,
  pickMap: noop,
  act: noop,
  wayfinder: noop,
  openFolder: noop,
}

const bandArgs = (surface: BandArgs['surface'], tone: Tone | undefined): BandArgs => ({
  ui: fakeUi(surface !== 'terminal'),
  surface,
  columns: 120,
  tone,
  ascii: false,
  spinFrame: 0,
  below: undefined,
  layout: 'row',
  flow: deriveFlow({ feature: draft, config: DEFAULT_CONFIG, tracker: null, running: null }),
  config: DEFAULT_CONFIG,
  waiting: 0,
  agents: null,
  notices: [],
  open: 'spec',
  map: null,
  isMapOpen: false,
  features: [],
  isPickingFeature: false,
  on,
})

const band = (surface: BandArgs['surface'], tone: Tone | undefined, rich: boolean) =>
  renderBand({ ...bandArgs(surface, tone), ui: fakeUi(rich) })

test("VS Code's card keeps its roomy padding and reads `x: Close`, with no tone", () => {
  const out = band('vscode', undefined, true)
  expect(byKey(out, 'card')?.props).toMatchObject({ paddingY: 'lg', rowGap: 'md' })
  expect(textOf(byKey(out, 'close'))).toBe('x: Close')
  expect(byKey(out, 'close-slot')?.props).toMatchObject({ flexShrink: 0 })
})

test("Desktop's card still goes compact over its wrapping rail, with the × close", () => {
  const out = band('desktop', 'light', true)
  expect(byKey(out, 'card')?.props).toMatchObject({ paddingY: 'xs', rowGap: 'xs' })
  expect(textOf(byKey(out, 'close'))).toBe('×')
})

test("the terminal's close keeps the plain `Close` label, which the Button draws as `x: Close`", () => {
  const out = band('terminal', undefined, false)
  expect(textOf(byKey(out, 'close'))).toBe('Close')
})

test('a chip with no tone keeps a cell of padding on VS Code, and none extra on the terminal', () => {
  const gear = (rich: boolean) =>
    byKey(band(rich ? 'vscode' : 'terminal', undefined, rich), 'box-gear')?.props
  expect(gear(true)).toMatchObject({ paddingX: 'xs', columnGap: 'xs' })
  expect(gear(false)).not.toHaveProperty('paddingX')
})

test('with no tone, every connector of the phase row is a text dash, so the row stays on one line', () => {
  const base = deriveFlow({ feature: draft, config: DEFAULT_CONFIG, tracker: null, running: null })
  const done: PhaseState = { kind: 'done' } as PhaseState
  const flow = { ...base, phases: base.phases.map((s, i) => (i < 3 ? { ...s, state: done } : s)) }
  const out = renderBand({ ...bandArgs('vscode', undefined), ui: fakeUi(true), flow, open: null })
  const steps = byKey(out, 'phases-steps')
  expect(findAll(steps, n => n.type === 'Svg')).toEqual([])
  expect(findAll(steps, n => String(n.props.key).startsWith('connector-'))).toHaveLength(6)
})

test("VS Code's settings tabs take a row of padding above and below, with no tone", async ($, on) => {
  featureWorld(on, { surfaces: ['vscode'], theme: 'auto' })
  await startSession($, 'vscode')
  const pane = await mountPane($, 'vscode')
  expect((await pane.find({ key: 'tab-flow-box' }))?.props).toMatchObject({ paddingY: 1 })
})

test('with no tone, a dim phase label is dim on its Button, not on a Text inside it', () => {
  const out = band('vscode', undefined, true)
  const retro = byKey(out, 'phase-retro')
  expect(retro?.props).toMatchObject({ dimColor: true })
  expect(findAll(retro, n => n.type === 'Text' && n.props.dimColor !== undefined)).toEqual([])
})

test('with no tone, the selected tab carries a marker and the others do not', async ($, on) => {
  featureWorld(on, { surfaces: ['vscode'], theme: 'auto' })
  await startSession($, 'vscode')
  const pane = await mountPane($, 'vscode')
  expect((await pane.find({ key: 'tab-flow' }))?.text).toContain('▸ Flow')
  expect((await pane.find({ key: 'tab-tickets' }))?.text).not.toContain('▸')
})

const billing = mapView({
  ref: 'm' as IssueRef,
  source: 'local',
  title: 'Billing v2',
  origin: '.scratch/m',
  location: '.scratch/m/map.md',
  isClosed: false,
  destination: 'A spec for usage-based billing',
  hasFog: false,
  tickets: [1, 2].map(n => ({
    ref: `m/0${n}` as IssueRef,
    title: `Ticket ${n}`,
    type: null,
    state: 'open' as const,
    assignee: null,
    blockedBy: [],
    location: `.scratch/m/issues/0${n}.md`,
  })),
  updatedAt: 1,
} satisfies WayMap)

test("VS Code's wayfinder card takes the phase card's roomy spacing and padded buttons", () => {
  const out = renderBand({
    ...bandArgs('vscode', undefined),
    open: null,
    map: billing,
    isMapOpen: true,
  })
  expect(byKey(out, 'map-card')?.props).toMatchObject({ paddingY: 'lg', rowGap: 'md' })
  expect(textOf(byKey(out, 'close'))).toBe('x: Close')
  const work = findAll(out, n => n.props.paddingY === 1 && textOf(n).includes('Work next ticket'))
  expect(work.length).toBeGreaterThan(0)
})

test('with no tone, the band draws no raw fills a dark VS Code window would clash with', () => {
  const out = renderBand({ ...bandArgs('vscode', undefined), map: billing })
  expect(
    JSON.stringify(out).match(/"(backgroundColor|borderColor|color)":"#[0-9A-Fa-f]+"/g),
  ).toBeNull()
})

const richUi = () => ({ ...fakeUi(true), Input: fakeUi().Box }) as never

const typedLog = () => {
  const held: Record<string, string> = {}
  const typed: Typed = {
    note: (key, text) => void (held[key] = text),
    submit: (key, fallback, submit) => submit(held[key] ?? fallback),
  }
  return { held, typed }
}

test('on VS Code a field draws its own Save Button, which saves what was typed', () => {
  const { typed } = typedLog()
  const saved: string[] = []
  const out = Field({
    ui: richUi(),
    tone: undefined,
    id: 'triage',
    label: 'Needs triage',
    value: 'needs-triage',
    onSubmit: text => void saved.push(text),
    typed,
  })
  const input = findAll(out, n => n.props.key === 'set-triage')[0]!
  expect(input.props).not.toHaveProperty('submitLabel')
  ;(input.props.onInput as (t: string) => void)('triage')
  const save = byKey(out, 'set-triage-submit')!
  expect(textOf(save)).toBe('Save')
  ;(save.props.onPress as () => void)()
  expect(saved).toEqual(['triage'])
})

test('elsewhere the Input keeps its own submit word, capitalised', () => {
  const out = Entry({
    ui: { ...fakeUi(true), Input: fakeUi().Box } as never,
    tone: 'dark',
    id: 'x',
    value: '',
    submitLabel: 'Save',
    onSubmit: noop,
    typed: typedLog().typed,
  })
  expect(byKey(out, 'x')?.props).toMatchObject({ submitLabel: 'Save' })
  expect(byKey(out, 'x-submit')).toBeUndefined()
})
